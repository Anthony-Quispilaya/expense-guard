/**
 * Photon alert service — iMessage via spectrum-ts (Photon's official SDK).
 *
 * spectrum-ts handles auth, token rotation, and gRPC transport automatically.
 * You only need two env variables:
 *   PHOTON_PROJECT_ID      — from https://photon.codes/dashboard → project Settings
 *   PHOTON_PROJECT_SECRET  — same page, below the project ID
 *
 * On first send, we lazily initialise a single Spectrum app instance with the
 * iMessage cloud provider and reuse it for the lifetime of the process.
 *
 * Alert channels (all that succeed run — they don't short-circuit each other):
 *   1. iMessage via spectrum-ts  — real iMessage on your phone
 *   2. Discord webhook           — rich embed to the DISCORD_WEBHOOK_URL channel
 */

import { getEnv } from "./env";
import { logger } from "../index";
import {
  insertAlert,
  updateAlert,
  type Alert,
  type PolicyResult,
  type Transaction,
} from "./supabase";

export interface AlertPayload {
  transaction: Transaction;
  policyResult: PolicyResult;
  recipient: string;
}

// ── Spectrum app singleton ─────────────────────────────────────────────────────
// spectrum-ts is ESM-only; we use `await import()` and cache the resolved app.

type SpectrumApp = import("spectrum-ts").SpectrumInstance;
type IMessageNarrow = import("spectrum-ts/providers/imessage").IMessageInstance;

interface SpectrumBundle {
  app: SpectrumApp;
  imessageFn: (app: SpectrumApp) => IMessageNarrow;
  text: (s: string) => import("spectrum-ts").ContentInput;
}

let _spectrumPromise: Promise<SpectrumBundle> | null = null;

async function getSpectrum(
  projectId: string,
  projectSecret: string
): Promise<SpectrumBundle> {
  if (_spectrumPromise) return _spectrumPromise;

  _spectrumPromise = (async () => {
    logger.info({ projectId }, "[Photon] Initialising spectrum-ts (iMessage cloud)");
    const { Spectrum, text } = await import("spectrum-ts");
    const { imessage } = await import("spectrum-ts/providers/imessage");

    const app = await Spectrum({
      projectId,
      projectSecret,
      providers: [imessage.config()],
    });

    logger.info("[Photon] spectrum-ts app ready ✓");
    // `imessage` is a callable that narrows a Spectrum app -> IMessageInstance.
    // The cast is needed because our shim types simplify the real generic signature.
    return {
      app,
      imessageFn: imessage as unknown as (app: SpectrumApp) => IMessageNarrow,
      text,
    };
  })().catch((err) => {
    _spectrumPromise = null; // reset on failure so the next call retries
    throw err;
  });

  return _spectrumPromise;
}

/** Graceful shutdown — called from index.ts on SIGINT/SIGTERM. */
export async function stopSpectrum(): Promise<void> {
  if (!_spectrumPromise) return;
  try {
    const { app } = await _spectrumPromise;
    await app.stop();
    logger.info("[Photon] spectrum-ts stopped cleanly");
  } catch (err) {
    logger.error({ err }, "[Photon] Error stopping spectrum-ts");
  } finally {
    _spectrumPromise = null;
  }
}

// ── Message text builder ───────────────────────────────────────────────────────

function buildAlertMessage(
  transaction: Transaction,
  policyResult: PolicyResult
): string {
  const merchant = transaction.merchant_name ?? "Unknown Merchant";
  const amount = `$${Number(transaction.amount).toFixed(2)}`;
  const cls = policyResult.classification.replace(/_/g, " ").toUpperCase();
  const topReason = (policyResult.reasons as string[])[0] ?? "Policy rule triggered";
  const icon =
    policyResult.classification === "likely_personal"
      ? "🚨"
      : policyResult.classification === "suspicious"
      ? "⚠️"
      : "✅";

  return [
    `${icon} ExpenseGuard Alert`,
    "",
    `Merchant: ${merchant}`,
    `Amount:   ${amount}`,
    `Status:   ${cls}`,
    `Reason:   ${topReason}`,
    "",
    policyResult.requires_review
      ? "⚡ Action required — please review in ExpenseGuard."
      : "No action needed.",
  ].join("\n");
}

// ── iMessage via spectrum-ts ───────────────────────────────────────────────────

/**
 * Send an iMessage to a phone number (E.164, e.g. +15551234567).
 * Exposed for the /api/photon/test diagnostic endpoint.
 */
export async function sendIMessage(
  recipient: string,
  message: string
): Promise<{ status: "sent" | "failed"; error?: string; durationMs: number }> {
  const env = getEnv();
  const start = Date.now();

  if (!env.PHOTON_PROJECT_ID || !env.PHOTON_PROJECT_SECRET) {
    return {
      status: "failed",
      error: "PHOTON_PROJECT_ID and PHOTON_PROJECT_SECRET are not set",
      durationMs: 0,
    };
  }

  try {
    logger.info({ recipient }, "[Photon] Sending iMessage via spectrum-ts");
    const { app, imessageFn, text } = await getSpectrum(
      env.PHOTON_PROJECT_ID,
      env.PHOTON_PROJECT_SECRET
    );

    const im = imessageFn(app);
    const user = await im.user(recipient);
    const space = await im.space(user);
    await space.send(text(message));

    const durationMs = Date.now() - start;
    logger.info({ recipient, durationMs }, "[Photon] iMessage sent ✓");
    return { status: "sent", durationMs };
  } catch (err) {
    const durationMs = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err, recipient, durationMs }, `[Photon] iMessage send failed: ${msg}`);
    // Nuke the cached app so the next attempt reconnects with a fresh token.
    _spectrumPromise = null;
    return { status: "failed", error: msg, durationMs };
  }
}

// ── Discord webhook ────────────────────────────────────────────────────────────

const DISCORD_COLORS = {
  likely_personal: 0xef4444,
  suspicious: 0xf59e0b,
  approved: 0x22c55e,
} as const;

const DISCORD_EMOJI = {
  likely_personal: "🚨",
  suspicious: "⚠️",
  approved: "✅",
} as const;

async function sendDiscordAlert(
  transaction: Transaction,
  policyResult: PolicyResult,
  webhookUrl: string
): Promise<"sent" | "failed"> {
  const merchant = transaction.merchant_name ?? "Unknown Merchant";
  const amount = `$${Number(transaction.amount).toFixed(2)}`;
  const cls = policyResult.classification as keyof typeof DISCORD_COLORS;
  const reasons = (policyResult.reasons as string[]).filter(Boolean);

  const embed = {
    title: `${DISCORD_EMOJI[cls] ?? "🔔"} Expense Policy Alert`,
    color: DISCORD_COLORS[cls] ?? 0x6c63ff,
    fields: [
      { name: "Merchant", value: merchant, inline: true },
      { name: "Amount", value: amount, inline: true },
      {
        name: "Classification",
        value: policyResult.classification.replace(/_/g, " ").toUpperCase(),
        inline: true,
      },
      { name: "Risk Score", value: `${policyResult.risk_score}/100`, inline: true },
      { name: "Requires Review", value: policyResult.requires_review ? "Yes" : "No", inline: true },
      ...(reasons.length > 0
        ? [{ name: "Policy Violations", value: reasons.map((r) => `• ${r}`).join("\n"), inline: false }]
        : []),
    ],
    footer: { text: "ExpenseGuard · Powered by Photon" },
    timestamp: new Date().toISOString(),
  };

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "ExpenseGuard", embeds: [embed] }),
    });

    if (!res.ok) {
      logger.error({ status: res.status }, "[Discord] Webhook returned error");
      return "failed";
    }

    logger.info({ merchant, cls }, "[Discord] Alert sent ✓");
    return "sent";
  } catch (err) {
    logger.error({ err }, "[Discord] Webhook fetch failed");
    return "failed";
  }
}

// ── Main entry point ───────────────────────────────────────────────────────────

export async function sendPolicyAlert(payload: AlertPayload): Promise<Alert> {
  const { transaction, policyResult, recipient } = payload;
  const env = getEnv();
  const messageBody = buildAlertMessage(transaction, policyResult);

  logger.info(
    { transactionId: transaction.id, recipient, classification: policyResult.classification },
    "[Alert] Preparing to send policy alert"
  );

  const primaryChannel: Alert["channel"] = env.PHOTON_PROJECT_ID
    ? "imessage"
    : env.DISCORD_WEBHOOK_URL
    ? "discord"
    : "imessage";

  const alert = await insertAlert({
    transaction_id: transaction.id!,
    policy_result_id: policyResult.id!,
    channel: primaryChannel,
    recipient,
    status: "skipped",
    message_body: messageBody,
  });

  if (policyResult.classification === "approved") {
    logger.info({ transactionId: transaction.id }, "[Alert] Transaction approved — no alert sent");
    return { ...alert, status: "skipped" };
  }

  let finalStatus: Alert["status"] = "skipped";
  const errors: string[] = [];

  // iMessage via spectrum-ts
  if (env.PHOTON_PROJECT_ID && env.PHOTON_PROJECT_SECRET) {
    const result = await sendIMessage(recipient, messageBody);
    if (result.status === "sent") {
      finalStatus = "sent";
    } else if (result.error) {
      errors.push(`iMessage: ${result.error}`);
    }
  }

  // Discord webhook (runs in parallel — both channels fire if configured)
  if (env.DISCORD_WEBHOOK_URL) {
    const discordResult = await sendDiscordAlert(
      transaction,
      policyResult,
      env.DISCORD_WEBHOOK_URL
    );
    if (discordResult === "sent") {
      finalStatus = "sent";
    } else {
      errors.push("Discord webhook failed");
    }
  }

  if (finalStatus === "skipped") {
    logger.warn(
      { platform: process.platform, messageBody },
      "[Alert] No channel sent — set PHOTON_PROJECT_ID+PHOTON_PROJECT_SECRET or DISCORD_WEBHOOK_URL"
    );
    finalStatus = "platform_unsupported";
  }

  const errorMessage = errors.length > 0 ? errors.join("; ") : undefined;

  await updateAlert(alert.id!, {
    status: finalStatus,
    sent_at: finalStatus === "sent" ? new Date().toISOString() : undefined,
    error_message: errorMessage,
  });

  return { ...alert, status: finalStatus, error_message: errorMessage };
}

export async function replayAlert(payload: AlertPayload): Promise<Alert> {
  logger.info({ transactionId: payload.transaction.id }, "[Alert] Replaying alert");
  return sendPolicyAlert(payload);
}
