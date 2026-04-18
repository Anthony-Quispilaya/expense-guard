import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { getEnv } from "./env";

let _client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (_client) return _client;
  const env = getEnv();
  _client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  return _client;
}

// ─── Typed helpers ────────────────────────────────────────────────────────────

export interface LinkedAccount {
  id?: string;
  owner_user_id?: string | null;
  provider: string;
  merchant_name?: string | null;
  merchant_id?: string | null;
  knot_account_id?: string | null;
  status: string;
  last_synced_at?: string | null;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface Transaction {
  id?: string;
  linked_account_id?: string | null;
  external_transaction_id: string;
  merchant_name?: string | null;
  transaction_datetime?: string | null;
  amount: number;
  currency?: string;
  order_status?: string | null;
  source: string;
  raw_payload: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface TransactionItem {
  id?: string;
  transaction_id: string;
  name?: string | null;
  description?: string | null;
  quantity?: number | null;
  unit_price?: number | null;
  seller_name?: string | null;
  raw_payload?: Record<string, unknown>;
  created_at?: string;
}

export interface PolicyResult {
  id?: string;
  transaction_id: string;
  classification: "approved" | "suspicious" | "likely_personal";
  risk_score: number;
  requires_review: boolean;
  reasons: string[];
  policy_version?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Alert {
  id?: string;
  transaction_id: string;
  policy_result_id: string;
  channel?: string;
  recipient: string;
  status: "sent" | "failed" | "simulated" | "platform_unsupported" | "skipped";
  external_message_id?: string | null;
  message_body?: string | null;
  error_message?: string | null;
  created_at?: string;
  sent_at?: string | null;
}

export interface WebhookEvent {
  id?: string;
  provider: string;
  event_type: string;
  external_event_id?: string | null;
  payload: Record<string, unknown>;
  processed?: boolean;
  created_at?: string;
}

export interface Review {
  id?: string;
  transaction_id: string;
  status: "pending" | "approved" | "rejected" | "needs_receipt" | "needs_explanation";
  reviewer_note?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  created_at?: string;
  updated_at?: string;
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

const DEFAULT_POLICY_CONFIG: PolicyConfig = {
  high_amount_threshold: 500,
  personal_keywords: [
    "alcohol","liquor","wine","beer","spirits","brewery","winery","distillery",
    "bar ","pub ","nightclub","vape","tobacco","luxury","gaming","casino",
    "cosmetics","beauty supply","nail salon","jewelry","jewellery","spa ",
    "massage","tattoo","adult","dispensary","cannabis","gym membership","personal care",
  ],
  suspicious_merchant_patterns: ["unknown","misc","generic"],
  unusual_hour_start: 0,
  unusual_hour_end: 5,
};

// ─── DB operations ─────────────────────────────────────────────────────────────

export async function upsertLinkedAccount(
  data: LinkedAccount
): Promise<LinkedAccount> {
  const sb = getSupabaseClient();
  const { data: result, error } = await sb
    .from("linked_accounts")
    .upsert(
      { ...data, updated_at: new Date().toISOString() },
      { onConflict: "knot_account_id" }
    )
    .select()
    .single();
  if (error) throw new Error(`upsertLinkedAccount: ${error.message}`);
  return result as LinkedAccount;
}

export async function insertTransaction(
  data: Transaction
): Promise<Transaction> {
  const sb = getSupabaseClient();
  const { data: result, error } = await sb
    .from("transactions")
    .upsert(
      { ...data, updated_at: new Date().toISOString() },
      { onConflict: "external_transaction_id" }
    )
    .select()
    .single();
  if (error) throw new Error(`insertTransaction: ${error.message}`);
  return result as Transaction;
}

export async function insertTransactionItems(
  items: TransactionItem[]
): Promise<void> {
  if (items.length === 0) return;
  const sb = getSupabaseClient();
  const { error } = await sb.from("transaction_items").insert(items);
  if (error) throw new Error(`insertTransactionItems: ${error.message}`);
}

export async function upsertPolicyResult(
  data: PolicyResult
): Promise<PolicyResult> {
  const sb = getSupabaseClient();
  const { data: result, error } = await sb
    .from("policy_results")
    .upsert(
      { ...data, updated_at: new Date().toISOString() },
      { onConflict: "transaction_id" }
    )
    .select()
    .single();
  if (error) throw new Error(`upsertPolicyResult: ${error.message}`);
  return result as PolicyResult;
}

export async function insertAlert(data: Alert): Promise<Alert> {
  const sb = getSupabaseClient();
  const { data: result, error } = await sb
    .from("alerts")
    .insert(data)
    .select()
    .single();
  if (error) throw new Error(`insertAlert: ${error.message}`);
  return result as Alert;
}

export async function updateAlert(
  id: string,
  patch: Partial<Alert>
): Promise<void> {
  const sb = getSupabaseClient();
  const { error } = await sb.from("alerts").update(patch).eq("id", id);
  if (error) throw new Error(`updateAlert: ${error.message}`);
}

export async function insertWebhookEvent(
  data: WebhookEvent
): Promise<WebhookEvent> {
  const sb = getSupabaseClient();
  const { data: result, error } = await sb
    .from("webhook_events")
    .insert(data)
    .select()
    .single();
  if (error) throw new Error(`insertWebhookEvent: ${error.message}`);
  return result as WebhookEvent;
}

export async function markWebhookProcessed(id: string): Promise<void> {
  const sb = getSupabaseClient();
  const { error } = await sb
    .from("webhook_events")
    .update({ processed: true })
    .eq("id", id);
  if (error) throw new Error(`markWebhookProcessed: ${error.message}`);
}

export async function getTransactionById(
  id: string
): Promise<Transaction | null> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from("transactions")
    .select("*")
    .eq("id", id)
    .single();
  if (error) return null;
  return data as Transaction;
}

export async function getPolicyResultByTransactionId(
  transactionId: string
): Promise<PolicyResult | null> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from("policy_results")
    .select("*")
    .eq("transaction_id", transactionId)
    .single();
  if (error) return null;
  return data as PolicyResult;
}

export async function getAlertByTransactionId(
  transactionId: string
): Promise<Alert | null> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from("alerts")
    .select("*")
    .eq("transaction_id", transactionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (error) return null;
  return data as Alert;
}

// ─── Review CRUD ───────────────────────────────────────────────────────────────

export async function getReviewByTransactionId(
  transactionId: string
): Promise<Review | null> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from("reviews")
    .select("*")
    .eq("transaction_id", transactionId)
    .single();
  if (error) return null;
  return data as Review;
}

export async function upsertReview(data: Review): Promise<Review> {
  const sb = getSupabaseClient();
  const { data: result, error } = await sb
    .from("reviews")
    .upsert(
      { ...data, updated_at: new Date().toISOString() },
      { onConflict: "transaction_id" }
    )
    .select()
    .single();
  if (error) throw new Error(`upsertReview: ${error.message}`);
  return result as Review;
}

// ─── Policy config ─────────────────────────────────────────────────────────────

let _configCache: PolicyConfig | null = null;
let _configCacheAt = 0;
const CONFIG_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function getPolicyConfig(): Promise<PolicyConfig> {
  const now = Date.now();
  if (_configCache && now - _configCacheAt < CONFIG_TTL_MS) return _configCache;

  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from("policy_config")
    .select("*")
    .eq("id", 1)
    .single();

  if (error || !data) {
    // Table may not exist yet — return defaults silently
    return DEFAULT_POLICY_CONFIG;
  }

  _configCache = data as PolicyConfig;
  _configCacheAt = now;
  return _configCache;
}

export async function updatePolicyConfig(
  patch: Partial<Omit<PolicyConfig, "id" | "updated_at">>
): Promise<PolicyConfig> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from("policy_config")
    .upsert({ id: 1, ...patch, updated_at: new Date().toISOString() })
    .select()
    .single();
  if (error) throw new Error(`updatePolicyConfig: ${error.message}`);
  _configCache = null; // bust cache
  return data as PolicyConfig;
}

export { DEFAULT_POLICY_CONFIG };

