/**
 * Policy Engine v1 — deterministic rule-based expense classification.
 *
 * Returns a PolicyResult for any normalized transaction.
 * No AI/ML — rules only for this prototype.
 */

export type Classification = "approved" | "suspicious" | "likely_personal";

export interface PolicyInput {
  merchantName?: string | null;
  amount: number;
  currency?: string;
  transactionDatetime?: string | null;
  items?: Array<{
    name?: string | null;
    description?: string | null;
    sellerName?: string | null;
  }>;
  source?: string;
}

export interface PolicyEngineConfig {
  personalKeywords?: string[];
  suspiciousMerchantPatterns?: string[];
  highAmountThreshold?: number;
  unusualHourStart?: number;
  unusualHourEnd?: number;
}

export interface PolicyResult {
  classification: Classification;
  riskScore: number;
  reasons: string[];
  requiresReview: boolean;
}

// ─── Configurable keyword lists ───────────────────────────────────────────────

const PERSONAL_KEYWORDS = [
  "alcohol",
  "liquor",
  "wine",
  "beer",
  "spirits",
  "brewery",
  "winery",
  "distillery",
  "bar ",
  "pub ",
  "nightclub",
  "vape",
  "tobacco",
  "luxury",
  "gaming",
  "casino",
  "cosmetics",
  "beauty supply",
  "nail salon",
  "jewelry",
  "jewellery",
  "spa ",
  "massage",
  "tattoo",
  "adult",
  "dispensary",
  "cannabis",
  "gym membership",
  "personal care",
];

const SUSPICIOUS_MERCHANT_PATTERNS = [
  "unknown",
  "misc",
  "generic",
];

// High-risk amount threshold (USD)
const HIGH_AMOUNT_THRESHOLD = 500;

// Unusual hours: midnight to 5am local time
const UNUSUAL_HOUR_START = 0;
const UNUSUAL_HOUR_END = 5;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeText(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().trim();
}

function containsAny(text: string, keywords: string[]): string | null {
  for (const kw of keywords) {
    if (text.includes(kw)) return kw;
  }
  return null;
}

function isUnusualHour(datetimeStr?: string | null, start = 0, end = 5): boolean {
  if (!datetimeStr) return false;
  const hour = new Date(datetimeStr).getHours();
  return hour >= start && hour < end;
}

// ─── Engine ───────────────────────────────────────────────────────────────────

export function evaluatePolicy(input: PolicyInput, cfg: PolicyEngineConfig = {}): PolicyResult {
  const reasons: string[] = [];
  let riskScore = 0;

  const personalKeywords = cfg.personalKeywords ?? PERSONAL_KEYWORDS;
  const suspiciousPatterns = cfg.suspiciousMerchantPatterns ?? SUSPICIOUS_MERCHANT_PATTERNS;
  const highAmountThreshold = cfg.highAmountThreshold ?? HIGH_AMOUNT_THRESHOLD;
  const unusualHourStart = cfg.unusualHourStart ?? UNUSUAL_HOUR_START;
  const unusualHourEnd = cfg.unusualHourEnd ?? UNUSUAL_HOUR_END;

  const merchantText = normalizeText(input.merchantName);

  const itemTexts = (input.items ?? [])
    .map((i) =>
      [i.name, i.description, i.sellerName]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
    )
    .join(" ");

  const allText = `${merchantText} ${itemTexts}`.trim();

  const personalMatch = containsAny(allText, personalKeywords);
  if (personalMatch) {
    reasons.push(`Contains personal/non-business keyword: "${personalMatch}"`);
    riskScore += 55;
  }

  const noMerchantInfo =
    !input.merchantName ||
    merchantText.length === 0 ||
    containsAny(merchantText, suspiciousPatterns) !== null;
  const noItemDetail = !input.items || input.items.length === 0;

  if (noMerchantInfo && noItemDetail) {
    reasons.push("Unknown merchant with no item detail");
    riskScore += 35;
  }

  if (isUnusualHour(input.transactionDatetime, unusualHourStart, unusualHourEnd)) {
    const hour = new Date(input.transactionDatetime!).getHours();
    reasons.push(`Transaction at unusual hour: ${hour}:00`);
    riskScore += 20;
  }

  if (input.amount > highAmountThreshold) {
    reasons.push(
      `Amount $${input.amount.toFixed(2)} exceeds threshold $${highAmountThreshold}`
    );
    riskScore += 25;
  }

  // ── Rule 5: Simulated source gets a minor informational tag ────────────────
  if (input.source === "simulation") {
    reasons.push("Transaction sourced from simulation (not a real transaction)");
  }

  // ── Clamp score ────────────────────────────────────────────────────────────
  riskScore = Math.min(100, Math.max(0, riskScore));

  // ── Classification logic ───────────────────────────────────────────────────
  let classification: Classification;

  if (personalMatch) {
    classification = "likely_personal";
  } else if (riskScore >= 30) {
    classification = "suspicious";
  } else {
    classification = "approved";
  }

  const requiresReview =
    classification === "likely_personal" || classification === "suspicious";

  return { classification, riskScore, reasons, requiresReview };
}
