import { Router, Request, Response } from "express";
import { z } from "zod";
import { logger } from "../index";
import { getEnv } from "../lib/env";
import {
  createKnotSession,
  listKnotMerchants,
  syncKnotTransactions,
  devLinkAccount,
  verifyKnotWebhookSignature,
} from "../lib/knot";
import {
  upsertLinkedAccount,
  insertWebhookEvent,
  markWebhookProcessed,
} from "../lib/supabase";
import { ingestKnotTransaction } from "../lib/pipeline";

const router = Router();

// ── GET /api/knot/debug ─────────────────────────────────────────────────────
// End-to-end connectivity test: checks keys, session creation, merchant list,
// and prints the webhook URL that Knot should call.

router.get("/debug", async (_req: Request, res: Response) => {
  const env = getEnv();
  const results: Record<string, unknown> = {
    environment: env.KNOT_ENVIRONMENT,
    clientId: env.KNOT_CLIENT_ID,
    baseUrl:
      env.KNOT_ENVIRONMENT === "production"
        ? "https://production.knotapi.com"
        : "https://development.knotapi.com",
    webhookUrl: `${env.WEBHOOK_BASE_URL}/api/knot/webhook`,
    tunnelAlive: false,
    sessionTest: null,
    merchantsTest: null,
    accountsTest: null,
  };

  // 1. Check tunnel is reachable
  try {
    const r = await fetch(`${env.WEBHOOK_BASE_URL}/health`, { signal: AbortSignal.timeout(4000) });
    results.tunnelAlive = r.ok;
    logger.info({ webhookUrl: results.webhookUrl, alive: r.ok }, "[Debug] Tunnel check");
  } catch (e) {
    results.tunnelAlive = false;
    results.tunnelError = e instanceof Error ? e.message : String(e);
    logger.error({ err: results.tunnelError }, "[Debug] Tunnel unreachable");
  }

  // 2. Test session creation
  try {
    const session = await createKnotSession({ external_user_id: `debug_${Date.now()}` });
    results.sessionTest = { ok: true, session_id: session.session };
    logger.info({ sessionId: session.session }, "[Debug] Session created OK");
  } catch (e) {
    results.sessionTest = { ok: false, error: e instanceof Error ? e.message : String(e) };
    logger.error({ err: results.sessionTest }, "[Debug] Session creation FAILED");
  }

  // 3. Test merchant list
  try {
    const merchants = await listKnotMerchants("web");
    results.merchantsTest = { ok: true, count: merchants.length, sample: merchants.slice(0, 3) };
    logger.info({ count: merchants.length }, "[Debug] Merchant list OK");
  } catch (e) {
    results.merchantsTest = { ok: false, error: e instanceof Error ? e.message : String(e) };
    logger.error({ err: results.merchantsTest }, "[Debug] Merchant list FAILED");
  }

  // 4. Test get accounts (production only)
  try {
    const { getKnotAccounts } = await import("../lib/knot");
    const accounts = await getKnotAccounts("debug_user");
    results.accountsTest = { ok: true, accounts };
    logger.info({ accounts }, "[Debug] Accounts fetch OK");
  } catch (e) {
    results.accountsTest = { ok: false, note: "Expected for new users", error: e instanceof Error ? e.message : String(e) };
  }

  const allOk =
    results.tunnelAlive === true &&
    (results.sessionTest as Record<string, unknown>)?.ok === true &&
    (results.merchantsTest as Record<string, unknown>)?.ok === true;

  logger.info({ allOk, results }, "[Debug] Full diagnostic complete");
  return res.json({ allOk, results });
});

// ── GET /api/knot/accounts/:externalUserId ──────────────────────────────────

router.get("/accounts/:externalUserId", async (req: Request, res: Response) => {
  const externalUserId = String(req.params.externalUserId);
  try {
    const { getKnotAccounts } = await import("../lib/knot");
    const accounts = await getKnotAccounts(externalUserId);
    logger.info({ externalUserId, accounts }, "[Knot] Accounts fetched");
    return res.json({ accounts });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err, externalUserId }, "[Knot] Failed to fetch accounts");
    return res.status(500).json({ error: msg });
  }
});



const sessionBodySchema = z.object({
  external_user_id: z.string().optional(),
  merchant_id: z.number().int().positive().optional(),
  metadata: z.record(z.string()).optional(),
});

router.post("/session", async (req: Request, res: Response) => {
  const parsed = sessionBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const externalUserId =
    parsed.data.external_user_id ?? `demo_user_${Date.now()}`;

  try {
    const result = await createKnotSession({
      external_user_id: externalUserId,
      metadata: parsed.data.metadata,
    });
    logger.info({ session: result.session, externalUserId, merchant_id: parsed.data.merchant_id }, "Knot session created");
    // Normalise response: Knot returns { session: "..." }, we expose session_id for the frontend
    return res.json({ session_id: result.session, external_user_id: externalUserId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "Failed to create Knot session");
    return res.status(500).json({ error: msg });
  }
});

// ── GET /api/knot/merchants ─────────────────────────────────────────────────

router.get("/merchants", async (_req: Request, res: Response) => {
  try {
    const merchants = await listKnotMerchants("web");
    return res.json({ merchants });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "Failed to list Knot merchants");
    return res.status(500).json({ error: msg });
  }
});

// ── POST /api/knot/dev-link ─────────────────────────────────────────────────
// Development only: link a merchant and generate sample transactions directly,
// bypassing the SDK. After calling this, poll /api/knot/sync/:linkedAccountId
// or wait for the NEW_TRANSACTIONS_AVAILABLE webhook.

const devLinkSchema = z.object({
  external_user_id: z.string().min(1),
  merchant_id: z.number().int().positive(),
  generate_updates: z.boolean().default(false),
});

router.post("/dev-link", async (req: Request, res: Response) => {
  const parsed = devLinkSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { external_user_id, merchant_id, generate_updates } = parsed.data;
  const env = getEnv();

  if (env.KNOT_ENVIRONMENT !== "development") {
    return res.status(400).json({
      error: "dev-link is only available in development environment",
    });
  }

  try {
    // 1. Call Knot dev link endpoint — generates ~205 sample transactions
    const linkResult = await devLinkAccount(external_user_id, merchant_id, {
      new: true,
      updated: generate_updates,
    });
    logger.info({ external_user_id, merchant_id, linkResult }, "Dev account linked");

    // 2. Upsert linked account in Supabase
    const linkedAccount = await upsertLinkedAccount({
      provider: "knot",
      merchant_id: String(merchant_id),
      knot_account_id: `${external_user_id}:${merchant_id}`,
      status: "connected",
      last_synced_at: new Date().toISOString(),
      metadata: { external_user_id, merchant_id, source: "dev_link" },
    });

    // 3. Immediately poll transactions (no webhook needed in dev prototype)
    let cursor: string | undefined;
    let totalIngested = 0;
    let retries = 0;

    // Knot generates transactions asynchronously — retry up to 6 times (12s total)
    while (retries < 6) {
      do {
        const syncResult = await syncKnotTransactions(
          external_user_id,
          merchant_id,
          cursor
        );
        for (const tx of syncResult.transactions) {
          await ingestKnotTransaction(
            tx,
            linkedAccount.id ?? null,
            syncResult.merchant.name,
            "knot"
          );
          totalIngested++;
        }
        cursor = syncResult.next_cursor ?? undefined;
      } while (cursor);

      if (totalIngested > 0) break;

      // No transactions yet — wait 2 seconds and retry
      retries++;
      logger.info({ retries }, "No transactions yet, retrying in 2s...");
      await new Promise((r) => setTimeout(r, 2000));
    }

    logger.info({ totalIngested, external_user_id, merchant_id }, "Dev link + sync complete");

    return res.json({
      linked: true,
      external_user_id,
      merchant_id,
      linked_account_id: linkedAccount.id,
      transactions_ingested: totalIngested,
      message: linkResult.message,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "Dev link failed");
    return res.status(500).json({ error: msg });
  }
});

// ── POST /api/knot/webhook ──────────────────────────────────────────────────
// Raw body for HMAC verification (configured in index.ts)

router.post("/webhook", async (req: Request, res: Response) => {
  const env = getEnv();
  const rawBody = req.body as Buffer;
  const receivedAt = new Date().toISOString();

  logger.info(
    {
      receivedAt,
      headers: {
        "knot-signature": req.headers["knot-signature"],
        "content-type": req.headers["content-type"],
        "content-length": req.headers["content-length"],
        event: req.headers["event"],
        session_id: req.headers["session_id"],
      },
      bodyLength: rawBody?.length ?? 0,
    },
    "[Webhook] Knot webhook received"
  );

  const signatureValid = verifyKnotWebhookSignature(
    rawBody,
    req.headers as Record<string, string>,
    env.KNOT_CLIENT_SECRET
  );

  logger.info({ signatureValid, nodeEnv: env.NODE_ENV }, "[Webhook] Signature check");

  if (!signatureValid && env.NODE_ENV === "production") {
    logger.warn("[Webhook] Invalid signature — rejecting (NODE_ENV=production)");
    return res.status(401).json({ error: "Invalid signature" });
  }
  if (!signatureValid) {
    logger.warn("[Webhook] Signature unverifiable — accepting (NODE_ENV=development)");
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody.toString());
  } catch {
    logger.error({ body: rawBody.toString() }, "[Webhook] Invalid JSON body");
    return res.status(400).json({ error: "Invalid JSON body" });
  }

  const eventType = (payload.event as string) ?? "UNKNOWN";
  const sessionId = (payload.session_id as string) ?? null;

  logger.info(
    { eventType, sessionId, payload },
    `[Webhook] Processing event: ${eventType}`
  );

  const webhookEvent = await insertWebhookEvent({
    provider: "knot",
    event_type: eventType,
    external_event_id: sessionId,
    payload,
    processed: false,
  }).catch((err) => {
    logger.error({ err }, "[Webhook] Failed to persist — continuing anyway");
    return null;
  });

  // Return 200 immediately — Knot times out in 10s and retries on non-200
  res.json({ received: true, event: eventType });

  setImmediate(async () => {
    try {
      await handleKnotWebhookEvent(eventType, payload);
      if (webhookEvent?.id) await markWebhookProcessed(webhookEvent.id);
      logger.info({ eventType }, "[Webhook] Event processed successfully");
    } catch (err) {
      logger.error({ err, eventType, payload }, "[Webhook] Error processing event");
    }
  });
});

async function handleKnotWebhookEvent(
  eventType: string,
  payload: Record<string, unknown>
): Promise<void> {
  // Real Knot webhooks: external_user_id and merchant as { id, name } object
  const externalUserId = payload.external_user_id as string | undefined;
  const merchant = payload.merchant as { id?: number; name?: string } | undefined;
  const merchantId = merchant?.id;
  const merchantName = merchant?.name ?? null;

  logger.info(
    { eventType, externalUserId, merchantId, merchantName, fullPayload: payload },
    `[Webhook] Handling ${eventType}`
  );

  switch (eventType) {
    case "AUTHENTICATED": {
      logger.info({ externalUserId, merchantId, merchantName }, "[Webhook] AUTHENTICATED — upserting linked account");
      if (externalUserId && merchantId) {
        const account = await upsertLinkedAccount({
          provider: "knot",
          merchant_id: String(merchantId),
          merchant_name: merchantName,
          knot_account_id: `${externalUserId}:${merchantId}`,
          status: "connected",
          last_synced_at: new Date().toISOString(),
          metadata: payload as Record<string, unknown>,
        });
        logger.info({ externalUserId, merchantId, accountId: account.id }, "[Webhook] Linked account saved ✓");
      } else {
        logger.warn({ payload }, "[Webhook] AUTHENTICATED missing external_user_id or merchant.id");
      }
      break;
    }

    case "NEW_TRANSACTIONS_AVAILABLE": {
      logger.info({ externalUserId, merchantId }, "[Webhook] NEW_TRANSACTIONS_AVAILABLE — starting sync");
      if (!externalUserId || !merchantId) {
        logger.warn({ payload }, "[Webhook] Missing external_user_id or merchant.id — skipping");
        return;
      }

      const { getSupabaseClient } = await import("../lib/supabase");
      const sb = getSupabaseClient();
      const { data: acct } = await sb
        .from("linked_accounts")
        .select("id")
        .eq("knot_account_id", `${externalUserId}:${merchantId}`)
        .single();

      const linkedAccountId = acct?.id ?? null;
      logger.info({ linkedAccountId, externalUserId, merchantId }, "[Webhook] Found linked account, syncing transactions");

      let cursor: string | undefined;
      let totalIngested = 0;
      let page = 0;

      do {
        page++;
        const syncResult = await syncKnotTransactions(externalUserId, merchantId, cursor);
        logger.info(
          { page, txCount: syncResult.transactions.length, nextCursor: syncResult.next_cursor },
          `[Webhook] Sync page ${page}`
        );
        for (const tx of syncResult.transactions) {
          await ingestKnotTransaction(
            tx,
            linkedAccountId,
            syncResult.merchant.name,
            "knot"
          );
          totalIngested++;
        }
        cursor = syncResult.next_cursor ?? undefined;
      } while (cursor);

      logger.info({ totalIngested, pages: page, externalUserId, merchantId }, "[Webhook] NEW_TRANSACTIONS sync complete ✓");
      break;
    }

    case "UPDATED_TRANSACTIONS_AVAILABLE": {
      logger.info({ externalUserId, merchantId, payload }, "[Webhook] UPDATED_TRANSACTIONS_AVAILABLE");
      const updated = payload.updated as Array<{ id: string }> | undefined;
      if (!updated?.length) {
        logger.warn("[Webhook] No updated transaction IDs in payload");
        break;
      }
      logger.info({ count: updated.length, ids: updated.map(u => u.id) }, "[Webhook] Re-ingesting updated transactions");

      const { getKnotTransactionById } = await import("../lib/knot");
      const { getSupabaseClient } = await import("../lib/supabase");
      const sb = getSupabaseClient();
      const { data: acct } = merchantId
        ? await sb
            .from("linked_accounts")
            .select("id")
            .eq("knot_account_id", `${externalUserId}:${merchantId}`)
            .single()
        : { data: null };

      for (const { id: txId } of updated) {
        const tx = await getKnotTransactionById(txId);
        await ingestKnotTransaction(tx, acct?.id ?? null, merchantName, "knot");
        logger.info({ txId }, "[Webhook] Updated transaction ingested");
      }
      logger.info({ count: updated.length }, "[Webhook] UPDATED_TRANSACTIONS sync complete ✓");
      break;
    }

    case "ACCOUNT_LOGIN_REQUIRED": {
      logger.warn({ externalUserId, merchantId, payload }, "[Webhook] ACCOUNT_LOGIN_REQUIRED — marking disconnected");
      if (externalUserId && merchantId) {
        const { getSupabaseClient } = await import("../lib/supabase");
        const sb = getSupabaseClient();
        const { error } = await sb
          .from("linked_accounts")
          .update({ status: "disconnected", updated_at: new Date().toISOString() })
          .eq("knot_account_id", `${externalUserId}:${merchantId}`);
        if (error) logger.error({ error }, "[Webhook] Failed to mark disconnected");
        else logger.info({ externalUserId, merchantId }, "[Webhook] Account marked disconnected");
      }
      break;
    }

    default:
      logger.info({ eventType, payload }, "[Webhook] Unhandled event type — logged only");
  }
}

// ── POST /api/knot/sync/:linkedAccountId ───────────────────────────────────

router.post("/sync/:linkedAccountId", async (req: Request, res: Response) => {
  const linkedAccountId = String(req.params.linkedAccountId);
  const body = req.body as { external_user_id?: string; merchant_id?: number; merchant_name?: string };
  const externalUserId = body.external_user_id;
  const merchantId = body.merchant_id;
  const merchantName = body.merchant_name ?? null;

  if (!externalUserId || !merchantId) {
    return res.status(400).json({ error: "external_user_id and merchant_id are required" });
  }

  try {
    let cursor: string | undefined;
    let totalIngested = 0;

    do {
      const syncResult = await syncKnotTransactions(externalUserId, Number(merchantId), cursor);
      for (const tx of syncResult.transactions) {
        await ingestKnotTransaction(
          tx,
          linkedAccountId,
          merchantName ?? syncResult.merchant.name,
          "knot"
        );
        totalIngested++;
      }
      cursor = syncResult.next_cursor ?? undefined;
    } while (cursor);

    return res.json({ synced: totalIngested });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "Manual sync failed");
    return res.status(500).json({ error: msg });
  }
});

export default router;
