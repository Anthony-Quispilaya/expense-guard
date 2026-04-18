/**
 * Knot API client wrapper.
 *
 * Auth: HTTP Basic — client_id as username, secret as password.
 * Base URLs:
 *   development: https://development.knotapi.com
 *   production:  https://production.knotapi.com
 *
 * Paths and types verified against official Knot skills (April 2026).
 */

import { getEnv } from "./env";
import { logger } from "../index";

export interface KnotSessionResponse {
  session: string;
}

export interface KnotMerchant {
  id: number;
  name: string;
  category?: string;
  logo?: string;
}
// ── Real Knot transaction structure ──────────────────────────────────────────
// price.total is a STRING, not a number.
// products[] is the field name (not items[]).
// merchant comes from the sync response wrapper, not inside the transaction.

export interface KnotPriceAdjustment {
  type: "DISCOUNT" | "TAX" | "TIP" | "FEE" | "REFUND" | "UNRECOGNIZED";
  label: string | null;
  amount: string;
}

export interface KnotPrice {
  sub_total: string | null;
  total: string;
  currency: string | null;
  adjustments: KnotPriceAdjustment[];
}

export interface KnotProduct {
  external_id?: string | null;
  name: string;
  description?: string | null;
  url?: string | null;
  image_url?: string | null;
  quantity?: number | null;
  eligibility?: string[];
  price?: {
    sub_total?: string | null;
    total?: string | null;
    unit_price?: string | null;
  } | null;
  seller?: { name?: string | null; url?: string | null } | null;
  [key: string]: unknown;
}

export interface KnotPaymentMethod {
  type: string;
  brand?: string | null;
  last_four?: string | null;
  transaction_amount?: string | null;
  name?: string | null;
  external_id?: string | null;
}

export interface KnotShipping {
  location?: {
    first_name?: string | null;
    last_name?: string | null;
    address?: {
      line1?: string | null;
      line2?: string | null;
      city?: string | null;
      region?: string | null;
      postal_code?: string | null;
      country: string;
    } | null;
  } | null;
}

export interface KnotTransaction {
  id: string;
  external_id?: string | null;
  datetime: string;
  order_status: string;
  url?: string | null;
  price: KnotPrice;
  products: KnotProduct[];
  payment_methods: KnotPaymentMethod[];
  shipping?: KnotShipping | null;
  [key: string]: unknown;
}

export interface KnotSyncResponse {
  merchant: KnotMerchant;
  transactions: KnotTransaction[];
  next_cursor: string | null;
  limit: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getBaseUrl(): string {
  const env = getEnv();
  return env.KNOT_ENVIRONMENT === "production"
    ? "https://production.knotapi.com"
    : "https://development.knotapi.com";
}

function getAuthHeader(): string {
  const env = getEnv();
  const token = Buffer.from(
    `${env.KNOT_CLIENT_ID}:${env.KNOT_CLIENT_SECRET}`
  ).toString("base64");
  return `Basic ${token}`;
}

async function knotFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const env = getEnv();
  const url = `${getBaseUrl()}${path}`;
  const method = options.method ?? "GET";

  // Log full request details
  let bodyPreview: unknown = undefined;
  if (options.body && typeof options.body === "string") {
    try { bodyPreview = JSON.parse(options.body); } catch { bodyPreview = options.body; }
  }
  logger.info(
    { url, method, env: env.KNOT_ENVIRONMENT, clientId: env.KNOT_CLIENT_ID, body: bodyPreview },
    `[Knot] → ${method} ${path}`
  );

  const start = Date.now();
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: getAuthHeader(),
      ...(options.headers as Record<string, string>),
    },
  });

  const text = await response.text();
  const ms = Date.now() - start;

  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { parsed = text; }

  if (!response.ok) {
    logger.error(
      { url, method, status: response.status, ms, response: parsed },
      `[Knot] ✗ ${response.status} ${method} ${path}`
    );
    throw new Error(`Knot API ${response.status} at ${path}: ${text}`);
  }

  logger.info(
    { url, method, status: response.status, ms, response: parsed },
    `[Knot] ✓ ${response.status} ${method} ${path}`
  );

  return parsed as T;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * POST /session/create
 * Creates a TransactionLink session. Returns { session: "..." }.
 */
export async function createKnotSession(payload: {
  external_user_id: string;
  metadata?: Record<string, string>;
}): Promise<KnotSessionResponse> {
  logger.info({ external_user_id: payload.external_user_id }, "Creating Knot session");
  return knotFetch<KnotSessionResponse>("/session/create", {
    method: "POST",
    body: JSON.stringify({ type: "transaction_link", ...payload }),
  });
}

/**
 * GET /merchant/list?type=transaction_link&platform=web
 * Returns an array of merchant objects with id, name, category, logo.
 */
export async function listKnotMerchants(
  platform: "web" | "ios" | "android" = "web"
): Promise<KnotMerchant[]> {
  logger.info("Fetching Knot merchant list");
  const result = await knotFetch<KnotMerchant[]>(
    `/merchant/list?type=transaction_link&platform=${platform}`
  );
  return Array.isArray(result) ? result : [];
}

/**
 * POST /transactions/sync
 * Paginated via cursor. Loop until next_cursor === null.
 * Persist cursor after each page.
 *
 * NOTE: merchant context is in the wrapper (response.merchant), NOT inside
 * each transaction object.
 */
export async function syncKnotTransactions(
  externalUserId: string,
  merchantId: number,
  cursor?: string
): Promise<KnotSyncResponse> {
  logger.info({ externalUserId, merchantId, cursor }, "Syncing Knot transactions");
  const body: Record<string, unknown> = {
    external_user_id: externalUserId,
    merchant_id: merchantId,
    limit: 100,
  };
  if (cursor) body.cursor = cursor;
  return knotFetch<KnotSyncResponse>("/transactions/sync", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/**
 * GET /transactions/:id
 * Fetch a single transaction by ID (for UPDATED_TRANSACTIONS_AVAILABLE).
 */
export async function getKnotTransactionById(
  transactionId: string
): Promise<KnotTransaction> {
  logger.info({ transactionId }, "Fetching Knot transaction by ID");
  return knotFetch<KnotTransaction>(`/transactions/${transactionId}`);
}

/**
 * GET /accounts?external_user_id=...
 * Returns all linked merchant accounts for a user with their connection status.
 */
export async function getKnotAccounts(externalUserId: string): Promise<unknown[]> {
  logger.info({ externalUserId }, "[Knot] Fetching accounts");
  const result = await knotFetch<{ accounts?: unknown[] } | unknown[]>(
    `/merchant/accounts?external_user_id=${encodeURIComponent(externalUserId)}`
  );
  if (Array.isArray(result)) return result;
  if (result && typeof result === "object" && "accounts" in result) {
    return (result as { accounts?: unknown[] }).accounts ?? [];
  }
  return [];
}

/**
 * POST /development/accounts/link
 * Development-only: link a merchant account and generate sample transactions
 * without the client-side SDK. Triggers AUTHENTICATED + NEW_TRANSACTIONS_AVAILABLE
 * webhooks (if a webhook URL is configured).
 *
 * Can also be polled directly via syncKnotTransactions without webhooks.
 */
export async function devLinkAccount(
  externalUserId: string,
  merchantId: number,
  options: { new?: boolean; updated?: boolean } = { new: true, updated: false }
): Promise<{ message: string }> {
  logger.info({ externalUserId, merchantId, options }, "Dev-linking Knot account");
  return knotFetch<{ message: string }>("/development/accounts/link", {
    method: "POST",
    body: JSON.stringify({
      external_user_id: externalUserId,
      merchant_id: merchantId,
      transactions: { new: options.new ?? true, updated: options.updated ?? false },
    }),
  });
}

/**
 * Verify Knot webhook HMAC-SHA256 signature.
 */
export function verifyKnotWebhookSignature(
  rawBody: Buffer,
  headers: Record<string, string | string[] | undefined>,
  secret: string
): boolean {
  try {
    const receivedSig = headers["knot-signature"] as string;
    if (!receivedSig) return false;

    const event = headers["event"] as string;
    const sessionId = headers["session_id"] as string;
    const contentLength = headers["content-length"] as string;
    const contentType = headers["content-type"] as string;
    const encryptionType = headers["encryption-type"] as string;

    const parts = [
      `Content-Length=${contentLength}`,
      `Content-Type=${contentType}`,
      `Encryption-Type=${encryptionType ?? "none"}`,
      `event=${event}`,
      `session_id=${sessionId}`,
    ].join("|");

    const { createHmac } = require("crypto");
    const computed = createHmac("sha256", secret).update(parts).digest("base64");
    return computed === receivedSig;
  } catch {
    return false;
  }
}
