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

// ── POST /api/knot/session ──────────────────────────────────────────────────

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

  const signatureValid = verifyKnotWebhookSignature(
    rawBody,
    req.headers as Record<string, string>,
    env.KNOT_CLIENT_SECRET
  );

  if (!signatureValid && env.NODE_ENV === "production") {
    logger.warn("Knot webhook signature invalid — rejecting in production");
    return res.status(401).json({ error: "Invalid signature" });
  }
  if (!signatureValid) {
    logger.warn("Knot webhook signature unverifiable — accepting in development");
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody.toString());
  } catch {
    return res.status(400).json({ error: "Invalid JSON body" });
  }

  const eventType = (payload.event as string) ?? "UNKNOWN";
  const sessionId = (payload.session_id as string) ?? null;

  logger.info({ eventType, sessionId }, "Knot webhook received");

  const webhookEvent = await insertWebhookEvent({
    provider: "knot",
    event_type: eventType,
    external_event_id: sessionId,
    payload,
    processed: false,
  }).catch((err) => {
    logger.error({ err }, "Failed to persist webhook event — continuing");
    return null;
  });

  // Return 200 immediately — Knot times out in 10s and retries on non-200
  res.json({ received: true });

  setImmediate(async () => {
    try {
      await handleKnotWebhookEvent(eventType, payload);
      if (webhookEvent?.id) await markWebhookProcessed(webhookEvent.id);
    } catch (err) {
      logger.error({ err, eventType }, "Error processing Knot webhook");
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

  switch (eventType) {
    case "AUTHENTICATED": {
      logger.info({ externalUserId, merchantId, merchantName }, "AUTHENTICATED webhook");
      if (externalUserId && merchantId) {
        await upsertLinkedAccount({
          provider: "knot",
          merchant_id: String(merchantId),
          merchant_name: merchantName,
          knot_account_id: `${externalUserId}:${merchantId}`,
          status: "connected",
          last_synced_at: new Date().toISOString(),
          metadata: payload as Record<string, unknown>,
        });
        logger.info({ externalUserId, merchantId }, "Linked account saved");
      }
      break;
    }

    case "NEW_TRANSACTIONS_AVAILABLE": {
      logger.info({ externalUserId, merchantId }, "NEW_TRANSACTIONS_AVAILABLE webhook");
      if (!externalUserId || !merchantId) {
        logger.warn("Missing external_user_id or merchant.id in webhook");
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

      let cursor: string | undefined;
      let totalIngested = 0;

      do {
        const syncResult = await syncKnotTransactions(externalUserId, merchantId, cursor);
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

      logger.info({ totalIngested, externalUserId, merchantId }, "Transactions synced via webhook");
      break;
    }

    case "UPDATED_TRANSACTIONS_AVAILABLE": {
      logger.info({ externalUserId, merchantId }, "UPDATED_TRANSACTIONS_AVAILABLE webhook");
      const updated = payload.updated as Array<{ id: string }> | undefined;
      if (!updated?.length) break;

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
      }
      logger.info({ count: updated.length }, "Updated transactions re-ingested");
      break;
    }

    case "ACCOUNT_LOGIN_REQUIRED": {
      logger.info({ externalUserId, merchantId }, "ACCOUNT_LOGIN_REQUIRED webhook");
      if (externalUserId && merchantId) {
        const { getSupabaseClient } = await import("../lib/supabase");
        const sb = getSupabaseClient();
        await sb
          .from("linked_accounts")
          .update({ status: "disconnected", updated_at: new Date().toISOString() })
          .eq("knot_account_id", `${externalUserId}:${merchantId}`);
      }
      break;
    }

    default:
      logger.info({ eventType }, "Unhandled Knot webhook event — logged only");
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
