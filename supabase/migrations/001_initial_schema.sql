-- ============================================================
-- Expense Policy Alert Prototype — Initial Schema
-- Run this in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/_/sql
-- ============================================================

-- Enable UUID extension (usually already enabled on Supabase)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── profiles ─────────────────────────────────────────────────────────────────
-- Optional: owner identity metadata (can tie to Supabase Auth users)
CREATE TABLE IF NOT EXISTS profiles (
  id           uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone        text,
  display_name text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ─── linked_accounts ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS linked_accounts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id    uuid,
  provider         text NOT NULL DEFAULT 'knot',
  merchant_name    text,
  merchant_id      text,
  knot_account_id  text UNIQUE,
  status           text NOT NULL,
  last_synced_at   timestamptz,
  metadata         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- ─── transactions ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  linked_account_id       uuid REFERENCES linked_accounts(id) ON DELETE CASCADE,
  external_transaction_id text UNIQUE NOT NULL,
  merchant_name           text,
  transaction_datetime    timestamptz,
  amount                  numeric NOT NULL,
  currency                text NOT NULL DEFAULT 'USD',
  order_status            text,
  source                  text NOT NULL DEFAULT 'knot',
  raw_payload             jsonb NOT NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- ─── transaction_items ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transaction_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  name           text,
  description    text,
  quantity       numeric,
  unit_price     numeric,
  seller_name    text,
  raw_payload    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ─── policy_results ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS policy_results (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id   uuid NOT NULL REFERENCES transactions(id) ON DELETE CASCADE UNIQUE,
  classification   text NOT NULL CHECK (classification IN ('approved', 'suspicious', 'likely_personal')),
  risk_score       integer NOT NULL CHECK (risk_score BETWEEN 0 AND 100),
  requires_review  boolean NOT NULL DEFAULT false,
  reasons          jsonb NOT NULL DEFAULT '[]'::jsonb,
  policy_version   text NOT NULL DEFAULT 'v1',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- ─── alerts ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alerts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id      uuid NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  policy_result_id    uuid NOT NULL REFERENCES policy_results(id) ON DELETE CASCADE,
  channel             text NOT NULL DEFAULT 'photon',
  recipient           text NOT NULL,
  status              text NOT NULL CHECK (status IN ('sent', 'failed', 'simulated', 'platform_unsupported', 'skipped')),
  external_message_id text,
  message_body        text,
  error_message       text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  sent_at             timestamptz
);

-- ─── webhook_events ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS webhook_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider          text NOT NULL,
  event_type        text NOT NULL,
  external_event_id text,
  payload           jsonb NOT NULL,
  processed         boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_transactions_linked_account ON transactions(linked_account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_policy_results_classification ON policy_results(classification);
CREATE INDEX IF NOT EXISTS idx_alerts_transaction_id ON alerts(transaction_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_provider ON webhook_events(provider, processed);

-- ─── Row-level security (optional, enable when using Supabase Auth) ───────────
-- ALTER TABLE linked_accounts ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE policy_results ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
