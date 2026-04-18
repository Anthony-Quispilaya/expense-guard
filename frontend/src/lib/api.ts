// Use relative paths so all requests go through the Vite proxy (WSL2-safe).
// Vite forwards /api/* and /health to http://localhost:3001 server-side.
const BASE = "";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  // Safely parse JSON — guard against empty or non-JSON responses
  let json: Record<string, unknown> | undefined;
  try {
    json = await res.json();
  } catch {
    throw new Error(`API error ${res.status}: non-JSON response from ${path}`);
  }
  if (!res.ok) throw new Error((json as Record<string, string>)?.error ?? `API error ${res.status}`);
  return json as T;
}

export const api = {
  health: () => apiFetch<{ status: string; platform: string }>("/health"),

  createKnotSession: (payload?: { external_user_id?: string; merchant_id?: number }) =>
    apiFetch<{ session_id: string; external_user_id: string }>("/api/knot/session", {
      method: "POST",
      body: JSON.stringify(payload ?? {}),
    }),

  listKnotMerchants: () =>
    apiFetch<{ merchants: Array<{ id: number; name: string; category?: string; logo?: string }> }>(
      "/api/knot/merchants"
    ),

  simulateTransaction: (type: "suspicious" | "approved" | "likely_personal") =>
    apiFetch<{
      simulated: boolean;
      transaction_id: string;
      merchant: string;
      amount: number;
      policyClassification: string;
      riskScore: number;
      alertStatus: string;
    }>("/api/demo/simulate-transaction", {
      method: "POST",
      body: JSON.stringify({ type }),
    }),

  /**
   * Dev only: link a Knot merchant account and immediately pull transactions.
   * No client SDK needed — calls /development/accounts/link directly.
   */
  devLinkKnot: (payload: {
    external_user_id: string;
    merchant_id: number;
    generate_updates?: boolean;
  }) =>
    apiFetch<{
      linked: boolean;
      external_user_id: string;
      merchant_id: number;
      linked_account_id: string;
      transactions_ingested: number;
      message: string;
    }>("/api/knot/dev-link", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  replayAlert: (transactionId: string) =>
    apiFetch<{ replayed: boolean; alert: unknown }>(
      `/api/demo/replay-alert/${transactionId}`,
      { method: "POST" }
    ),

  // ── Review workflow ────────────────────────────────────────────────────────
  listReviews: (status?: string) =>
    apiFetch<{ items: ReviewQueueItem[] }>(
      `/api/reviews${status ? `?status=${status}` : ""}`
    ),

  getTransactionDetail: (txId: string) =>
    apiFetch<TransactionDetail>(`/api/reviews/transaction/${txId}`),

  submitReview: (txId: string, body: {
    status: "pending" | "approved" | "rejected" | "needs_receipt" | "needs_explanation";
    reviewer_note?: string | null;
    reviewed_by?: string;
  }) =>
    apiFetch<{ review: ReviewRecord }>(`/api/reviews/transaction/${txId}`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getReviewCounts: () =>
    apiFetch<{ total_flagged: number; pending: number; reviewed: number }>("/api/reviews/counts"),

  // ── Policy config ──────────────────────────────────────────────────────────
  getPolicyConfig: () =>
    apiFetch<{ config: PolicyConfig }>("/api/policy/config"),

  updatePolicyConfig: (config: Omit<PolicyConfig, "id" | "updated_at">) =>
    apiFetch<{ config: PolicyConfig }>("/api/policy/config", {
      method: "PUT",
      body: JSON.stringify(config),
    }),
};

// ── Shared types exported for pages ───────────────────────────────────────────

export interface ReviewRecord {
  id?: string;
  transaction_id: string;
  status: "pending" | "approved" | "rejected" | "needs_receipt" | "needs_explanation";
  reviewer_note?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  created_at?: string;
}

export interface ReviewQueueItem {
  transaction_id: string;
  classification: "suspicious" | "likely_personal";
  risk_score: number;
  reasons: string[];
  policy_created_at: string;
  transaction: {
    id: string;
    merchant_name: string | null;
    amount: number;
    currency: string;
    transaction_datetime: string | null;
    source: string;
    created_at: string;
  } | null;
  review: ReviewRecord | null;
  alert: { status: string; channel: string; sent_at: string | null } | null;
}

export interface TransactionDetail {
  transaction: {
    id: string;
    merchant_name: string | null;
    amount: number;
    currency: string;
    transaction_datetime: string | null;
    source: string;
    order_status: string | null;
    raw_payload: Record<string, unknown>;
    created_at: string;
  };
  items: Array<{
    id: string;
    name: string | null;
    description: string | null;
    quantity: number | null;
    unit_price: number | null;
    seller_name: string | null;
  }>;
  policy: {
    classification: string;
    risk_score: number;
    reasons: string[];
    requires_review: boolean;
  } | null;
  alerts: Array<{
    id: string;
    status: string;
    channel: string | null;
    message_body: string | null;
    sent_at: string | null;
    error_message: string | null;
    created_at: string;
  }>;
  review: ReviewRecord | null;
}

export interface PolicyConfig {
  id?: number;
  high_amount_threshold: number;
  personal_keywords: string[];
  suspicious_merchant_patterns: string[];
  unusual_hour_start: number;
  unusual_hour_end: number;
  updated_at?: string;
}
