/**
 * Photon alert service.
 *
 * Alert channels (tried in order):
 *   1. iMessage via @photon-ai/advanced-imessage (gRPC to a remote Mac instance)
 *        → Works from any platform (Linux/WSL2/macOS) as long as PHOTON_ADDRESS
 *          and PHOTON_TOKEN are configured and a Photon instance is running on Mac.
 *   2. Discord webhook — works everywhere, used as fallback / parallel channel.
 *   3. Legacy @photon-ai/imessage-kit — macOS-only local fallback if no gRPC config.
 *
 * Configure in backend/.env:
 *   PHOTON_ADDRESS=your-instance.imsg.photon.codes:443
 *   PHOTON_TOKEN=your-lightauth-token
 *   PHOTON_TEST_NUMBER=+15512367940       (E.164, destination phone)
 *   DISCORD_WEBHOOK_URL=https://...       (optional second channel)
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

// ── iMessage via @photon-ai/advanced-imessage (gRPC, works from WSL2) ─────────

async function sendPhotonAdvanced(
  recipient: string,
  message: string,
  address: string,
  token: string
): Promise<"sent" | "failed"> {
  try {
    const { createClient, directChat } = await import(
      "@photon-ai/advanced-imessage"
    );

    const im = createClient({ address, token, tls: true });
    try {
      await im.messages.send(directChat(recipient), message);
      logger.info({ recipient }, "Photon iMessage sent ✓");
      return "sent";
    } finally {
      await im.close();
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err, recipient }, `Photon advanced iMessage failed: ${msg}`);
    return "failed";
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
      const body = await res.text().catch(() => "");
      logger.error({ status: res.status, body }, "Discord webhook returned error");
      return "failed";
    }

    logger.info({ merchant, amount, cls }, "Discord alert sent ✓");
    return "sent";
  } catch (err) {
    logger.error({ err }, "Discord webhook fetch failed");
    return "failed";
  }
}

// ── Legacy macOS-only fallback ─────────────────────────────────────────────────

async function sendPhotonLegacy(
  recipient: string,
  message: string
): Promise<"sent" | "failed"> {
  if (process.platform !== "darwin") return "failed";
  try {
    const { IMessageSDK } = await import("@photon-ai/imessage-kit");
    const sdk = new IMessageSDK();
    await sdk.send(recipient, message);
    logger.info({ recipient }, "Photon iMessage (legacy) sent ✓");
    return "sent";
  } catch (err) {
    logger.error({ err }, "Photon legacy iMessage send failed");
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
    "Preparing to send policy alert"
  );

  // Determine which channel will be primary for the DB record
  const primaryChannel = env.PHOTON_ADDRESS ? "imessage" : env.DISCORD_WEBHOOK_URL ? "discord" : "imessage";

  const alert = await insertAlert({
    transaction_id: transaction.id!,
    policy_result_id: policyResult.id!,
    channel: primaryChannel,
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

  // ── Channel 1: Photon advanced iMessage (gRPC — works from WSL2/Linux) ────────
  if (env.PHOTON_ADDRESS && env.PHOTON_TOKEN) {
    logger.info({ recipient, address: env.PHOTON_ADDRESS }, "Sending Photon iMessage (gRPC)");
    const result = await sendPhotonAdvanced(recipient, messageBody, env.PHOTON_ADDRESS, env.PHOTON_TOKEN);
    finalStatus = result;
    if (result === "failed") errorMessage = "Photon gRPC send failed";
  }

  // ── Channel 2: Discord webhook (parallel channel, or fallback if no Photon) ──
  if (env.DISCORD_WEBHOOK_URL) {
    logger.info({ transactionId: transaction.id }, "Sending Discord alert");
    const discordResult = await sendDiscordAlert(transaction, policyResult, env.DISCORD_WEBHOOK_URL);
    // Treat Discord success as overall success even if Photon failed
    if (discordResult === "sent") {
      finalStatus = "sent";
      errorMessage = undefined;
    } else if (finalStatus !== "sent") {
      errorMessage = (errorMessage ? errorMessage + "; " : "") + "Discord webhook failed";
    }
  }

  // ── Channel 3: Legacy macOS iMessage (last resort) ────────────────────────────
  if (finalStatus !== "sent" && process.platform === "darwin") {
    logger.info({ recipient }, "Trying legacy Photon iMessage (macOS only)");
    const legacyResult = await sendPhotonLegacy(recipient, messageBody);
    if (legacyResult === "sent") {
      finalStatus = "sent";
      errorMessage = undefined;
    }
  }

  // ── No channel available ───────────────────────────────────────────────────────
  if (finalStatus === "skipped" && !env.PHOTON_ADDRESS && !env.DISCORD_WEBHOOK_URL && process.platform !== "darwin") {
    logger.warn(
      { platform: process.platform, messageBody },
      "No alert channel configured — set PHOTON_ADDRESS+PHOTON_TOKEN or DISCORD_WEBHOOK_URL:\n" + messageBody
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
