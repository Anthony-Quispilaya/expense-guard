/**
 * Photon alert service.
 *
 * Alert channels:
 *   1. Discord webhook  — works on ALL platforms (Linux/WSL2/macOS)
 *                         fires whenever DISCORD_WEBHOOK_URL is set in .env
 *   2. iMessage via Photon SDK — macOS only, requires @photon-ai/imessage-kit
 *
 * Both channels are attempted independently. The Supabase alert record
 * reflects the best outcome across channels.
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

// ── Discord color palette ──────────────────────────────────────────────────────
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

function buildAlertMessage(
  transaction: Transaction,
  policyResult: PolicyResult
): string {
  const merchant = transaction.merchant_name ?? "Unknown Merchant";
  const amount = `$${Number(transaction.amount).toFixed(2)}`;
  const classification = policyResult.classification.replace("_", " ");
  const topReason = (policyResult.reasons as string[])[0] ?? "Policy rule triggered";

  return [
    "Expense Alert",
    "",
    `Merchant: ${merchant}`,
    `Amount: ${amount}`,
    `Classification: ${classification}`,
    `Reason: ${topReason}`,
    "",
    "Please review this business expense.",
  ].join("\n");
}

// ── Discord webhook ────────────────────────────────────────────────────────────

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
      const body = await res.text().catch(() => "");
      logger.error({ status: res.status, body }, "Discord webhook returned error");
      return "failed";
    }

    logger.info({ merchant, amount, classification: cls }, "Discord alert sent ✓");
    return "sent";
  } catch (err) {
    logger.error({ err }, "Discord webhook fetch failed");
    return "failed";
  }
}

// ── Main alert entry point ─────────────────────────────────────────────────────

export async function sendPolicyAlert(payload: AlertPayload): Promise<Alert> {
  const { transaction, policyResult, recipient } = payload;
  const env = getEnv();

  const messageBody = buildAlertMessage(transaction, policyResult);

  logger.info(
    { transactionId: transaction.id, recipient, classification: policyResult.classification },
    "Preparing to send policy alert"
  );

  const alert = await insertAlert({
    transaction_id: transaction.id!,
    policy_result_id: policyResult.id!,
    channel: "discord",
    recipient,
    status: "skipped",
    message_body: messageBody,
  });

  if (policyResult.classification === "approved") {
    logger.info({ transactionId: transaction.id }, "Transaction approved — no alert sent");
    return { ...alert, status: "skipped" };
  }

  let finalStatus: Alert["status"] = "skipped";
  let errorMessage: string | undefined;

  // ── Channel 1: Discord webhook (works on all platforms) ──────────────────────
  if (env.DISCORD_WEBHOOK_URL) {
    logger.info({ transactionId: transaction.id }, "Sending Discord alert");
    const discordResult = await sendDiscordAlert(transaction, policyResult, env.DISCORD_WEBHOOK_URL);
    finalStatus = discordResult;
    if (discordResult === "failed") {
      errorMessage = "Discord webhook failed";
    }
  }

  // ── Channel 2: iMessage via Photon SDK (macOS only) ──────────────────────────
  const isMacOS = process.platform === "darwin";

  if (isMacOS) {
    try {
      const { IMessageSDK } = await import("@photon-ai/imessage-kit");
      const sdk = new IMessageSDK();
      logger.info({ recipient }, "Sending Photon iMessage");
      await sdk.send(recipient, messageBody);
      finalStatus = "sent";
      logger.info({}, "Photon iMessage sent ✓");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err }, "Photon iMessage send failed");
      if (finalStatus !== "sent") {
        finalStatus = "failed";
        errorMessage = msg;
      }
    }
  } else if (!env.DISCORD_WEBHOOK_URL) {
    logger.warn(
      { platform: process.platform, messageBody },
      "PHOTON: No macOS and no DISCORD_WEBHOOK_URL — alert logged only:\n" + messageBody
    );
    finalStatus = "platform_unsupported";
  }

  await updateAlert(alert.id!, {
    status: finalStatus,
    sent_at: finalStatus === "sent" ? new Date().toISOString() : undefined,
    error_message: errorMessage,
  });

  return { ...alert, status: finalStatus, error_message: errorMessage };
}

/**
 * Manual replay: resend alert for a previously flagged transaction.
 */
export async function replayAlert(payload: AlertPayload): Promise<Alert> {
  logger.info({ transactionId: payload.transaction.id }, "Replaying alert");
  return sendPolicyAlert(payload);
}
