-- ============================================================
-- Migration 002: Review workflow + Policy config
-- Run this in the Supabase SQL Editor:
--   https://supabase.com/dashboard/project/_/sql
-- ============================================================

-- ── reviews ──────────────────────────────────────────────────
-- One review record per transaction. Tracks reviewer decisions.

CREATE TABLE IF NOT EXISTS reviews (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_id UUID      NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  status       TEXT        NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending','approved','rejected','needs_receipt','needs_explanation')),
  reviewer_note TEXT,
  reviewed_by  TEXT        NOT NULL DEFAULT 'reviewer',
  reviewed_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (transaction_id)
);

CREATE INDEX IF NOT EXISTS idx_reviews_transaction_id ON reviews (transaction_id);
CREATE INDEX IF NOT EXISTS idx_reviews_status          ON reviews (status);

-- ── policy_config ─────────────────────────────────────────────
-- Single-row config table. Admins edit thresholds and keywords
-- through the Policy Settings UI instead of changing code.

CREATE TABLE IF NOT EXISTS policy_config (
  id                            INTEGER   DEFAULT 1 PRIMARY KEY CHECK (id = 1),
  high_amount_threshold         NUMERIC   NOT NULL DEFAULT 500,
  personal_keywords             TEXT[]    NOT NULL DEFAULT ARRAY[
    'alcohol','liquor','wine','beer','spirits','brewery','winery','distillery',
    'bar ','pub ','nightclub','vape','tobacco','luxury','gaming','casino',
    'cosmetics','beauty supply','nail salon','jewelry','jewellery','spa ',
    'massage','tattoo','adult','dispensary','cannabis','gym membership','personal care'
  ],
  suspicious_merchant_patterns  TEXT[]    NOT NULL DEFAULT ARRAY['unknown','misc','generic'],
  unusual_hour_start            INTEGER   NOT NULL DEFAULT 0,
  unusual_hour_end              INTEGER   NOT NULL DEFAULT 5,
  updated_at                    TIMESTAMPTZ DEFAULT NOW()
);

-- Insert defaults if row doesn't exist yet
INSERT INTO policy_config (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;
