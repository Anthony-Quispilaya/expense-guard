# Expense Policy Alert Prototype — Build Brief for Coding Agent

## Objective

Build a **mini working prototype** in **TypeScript** that uses:

- **Supabase** as the **single source of truth** for auth, database, storage, and app state
- **Knot** for account linking / transaction ingestion or realistic transaction simulation tied to Knot integration
- **Photon** for real outbound user alerts to iMessage/SMS-compatible workflow
- A minimal frontend to link accounts, review transactions, and inspect alerts

The prototype should let us:

1. Link or simulate a spend source using Knot-compatible flows
2. Ingest transactions into Supabase
3. Run a policy engine that flags suspicious/non-business spend
4. Send a **real Photon alert** to my phone when a flagged transaction is detected
5. Show the result in a simple dashboard

---

## Important repo reference notes

Use the repo below as a **structural inspiration**, not as a direct architecture to copy:

- Repo: `HackPrincetonQANT/backend-frontned-agent-alltogether`

### What was useful from the repo
The public repo clearly shows a multi-service pattern:
- a Node agent service
- Photon/iMessage messaging with `@photon-ai/imessage-kit`
- an HTTP API layer
- a frontend
- environment-based local development
- Node 20-based setup
- Express/CORS/dotenv usage in the agent service

The agent package in that repo includes:
- `@photon-ai/imessage-kit`
- `express`
- `cors`
- `dotenv`
- `axios`
- `openai`
- `@google/generative-ai`

The repo README also documents:
- Node 20 usage
- separate backend/frontend/agent setup
- service-specific env files
- local dev scripts

### What must change for our project
Do **not** copy the repo’s storage strategy.
Our project must use:

- **Supabase instead of Snowflake**
- **Supabase as the app database and source of truth**
- **Knot transaction flow instead of the repo’s receipt-first pattern**
- **Photon for policy alerts**, not just conversational finance assistant behavior

---

## Product we are building

We are building an **AI expense policy alert prototype** for business owners.

### Core use case
A business owner gives a worker access to a business payment method or linked spending account.

When a new transaction appears:
- the system checks it against business expense rules
- if it looks suspicious or personal, it is flagged
- Photon sends a message to the owner
- the dashboard shows the event and why it was flagged

### Example
A worker uses a business-linked payment source for alcohol or a likely personal retail purchase.

The system:
- stores the transaction
- evaluates it
- creates a policy result
- sends an alert to the owner’s phone through Photon

---

## Scope for the first working prototype

Keep this **small and real**.

### In scope
- TypeScript app
- Supabase database + auth + typed schema
- Knot integration for account linking and transaction sync **or**
  a simulation layer that still uses Knot service wiring where real transactions are not available yet
- Photon alerting
- rule-based policy engine
- minimal dashboard
- logs for every integration step

### Out of scope
- full accounting
- reimbursements
- multi-tenant enterprise permissions
- OCR receipts
- full AI classification pipeline
- production hardening
- complete card issuing / banking infrastructure

---

## Required architecture

Use a clean TypeScript architecture with three app concerns:

### 1. Frontend
Recommended stack:
- Vite
- React
- TypeScript
- Supabase client

Responsibilities:
- sign in
- connect Knot account
- show recent transactions
- show policy results
- show alert status
- provide a button to simulate a suspicious transaction if real transactions are not immediately available

### 2. Backend / API
Recommended stack:
- Node 20+
- TypeScript
- Express or Fastify
- Supabase server client
- Knot integration service
- Photon integration service

Responsibilities:
- create Knot sessions
- receive Knot webhooks
- sync transactions
- normalize/store data in Supabase
- evaluate transactions
- send Photon alerts
- expose internal demo/admin endpoints

### 3. Supabase
Use Supabase for:
- database
- auth
- row-level security where feasible
- storage if needed later
- optional realtime subscriptions for dashboard updates

---

## Required installation and package baseline

Use Node 20.

Install or confirm these packages exist.

### Frontend
- react
- react-dom
- typescript
- vite
- @supabase/supabase-js
- react-router-dom
- zod
- date-fns

### Backend
- typescript
- tsx
- express
- cors
- dotenv
- zod
- @supabase/supabase-js
- node-fetch or native fetch
- pino or console-based logging
- ngrok or equivalent for webhook testing if needed locally

### Photon / agent side
- `@photon-ai/imessage-kit`

### Optional utilities
- drizzle or prisma only if truly needed
- otherwise use direct Supabase queries to move faster

Do **not** add unnecessary complexity.

---

## Environment variables

Create these env files and wire them correctly.

### Frontend `.env`
```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_API_BASE_URL=http://localhost:3001
```

### Backend `.env`
```env
PORT=3001
NODE_ENV=development

SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_ANON_KEY=

KNOT_CLIENT_ID=
KNOT_CLIENT_SECRET=
KNOT_ENVIRONMENT=sandbox

PHOTON_TEST_NUMBER=+1XXXXXXXXXX

# Add any Photon-specific credentials/config already required by your local Photon setup
# Keep names aligned with the actual Photon SDK/runtime setup in use

APP_BASE_URL=http://localhost:5173
WEBHOOK_BASE_URL=
```

### Notes
- Keep all secrets server-side.
- Frontend must never receive service role keys.
- If local webhooks are needed, use `WEBHOOK_BASE_URL` with ngrok/cloudflared.

---

## Supabase schema (single source of truth)

Create the following tables.

### `profiles`
Use if auth is enabled and you want owner identity metadata.

- `id uuid primary key`
- `phone text`
- `display_name text`
- `created_at timestamptz default now()`

### `linked_accounts`
Tracks Knot-linked or simulated linked spend sources.

- `id uuid primary key default gen_random_uuid()`
- `owner_user_id uuid`
- `provider text not null default 'knot'`
- `merchant_name text`
- `merchant_id text`
- `knot_account_id text`
- `status text not null`
- `last_synced_at timestamptz`
- `metadata jsonb default '{}'::jsonb`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

### `transactions`
- `id uuid primary key default gen_random_uuid()`
- `linked_account_id uuid references linked_accounts(id) on delete cascade`
- `external_transaction_id text unique`
- `merchant_name text`
- `transaction_datetime timestamptz`
- `amount numeric not null`
- `currency text default 'USD'`
- `order_status text`
- `source text not null default 'knot'`
- `raw_payload jsonb not null`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

### `transaction_items`
- `id uuid primary key default gen_random_uuid()`
- `transaction_id uuid references transactions(id) on delete cascade`
- `name text`
- `description text`
- `quantity numeric`
- `unit_price numeric`
- `seller_name text`
- `raw_payload jsonb not null default '{}'::jsonb`
- `created_at timestamptz default now()`

### `policy_results`
- `id uuid primary key default gen_random_uuid()`
- `transaction_id uuid references transactions(id) on delete cascade unique`
- `classification text not null`
- `risk_score integer not null`
- `requires_review boolean not null default false`
- `reasons jsonb not null default '[]'::jsonb`
- `policy_version text not null default 'v1'`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

### `alerts`
- `id uuid primary key default gen_random_uuid()`
- `transaction_id uuid references transactions(id) on delete cascade`
- `policy_result_id uuid references policy_results(id) on delete cascade`
- `channel text not null default 'photon'`
- `recipient text not null`
- `status text not null`
- `external_message_id text`
- `message_body text`
- `error_message text`
- `created_at timestamptz default now()`
- `sent_at timestamptz`

### `webhook_events`
Use for debugging and replay safety.

- `id uuid primary key default gen_random_uuid()`
- `provider text not null`
- `event_type text not null`
- `external_event_id text`
- `payload jsonb not null`
- `processed boolean not null default false`
- `created_at timestamptz default now()`

---

## Required backend modules

Implement these modules cleanly.

### `src/lib/supabase.ts`
- server-side Supabase client
- helper methods for inserts/upserts

### `src/lib/knot.ts`
Responsibilities:
- create session
- list/prepare merchant config if needed
- verify or minimally validate webhook shape
- sync transactions
- fetch transaction details if available
- isolate all Knot-specific logic here

### `src/lib/photon.ts`
Responsibilities:
- initialize Photon SDK/runtime
- send alert message
- log delivery result
- expose one clean function:
  - `sendPolicyAlert(recipient, payload)`

### `src/lib/policy-engine.ts`
Responsibilities:
- evaluate each transaction
- return classification, score, reasons, review flag

### `src/lib/normalizers.ts`
Responsibilities:
- convert Knot transaction payloads into internal Supabase-ready records

### `src/routes/knot.ts`
Endpoints:
- `POST /api/knot/session`
- `POST /api/knot/webhook`
- optional `POST /api/knot/sync/:linkedAccountId`

### `src/routes/demo.ts`
Endpoints:
- `POST /api/demo/simulate-transaction`
- `POST /api/demo/replay-alert/:transactionId`

### `src/routes/health.ts`
- `GET /health`

---

## Policy engine v1

Start with deterministic rules only.

### Classifications
- `approved`
- `suspicious`
- `likely_personal`

### v1 rules
Flag as `likely_personal` if:
- merchant or item name contains alcohol keywords
- merchant or item strongly suggests personal entertainment or non-business shopping
- transaction amount exceeds a configured threshold for a risky category

Flag as `suspicious` if:
- merchant is unknown and item detail is missing
- transaction happens at an unusual hour
- amount is abnormally high for the category
- merchant/category is not yet approved by policy

Else:
- `approved`

### Sample keywords
- alcohol
- liquor
- wine
- beer
- spirits
- vape
- luxury
- gaming
- cosmetics
- jewelry

Keep keywords configurable in code, not hardcoded deep in components.

### Output contract
```ts
type PolicyResult = {
  classification: "approved" | "suspicious" | "likely_personal";
  riskScore: number;
  reasons: string[];
  requiresReview: boolean;
};
```

---

## Knot integration expectations

Use Knot as the transaction/account connectivity layer.

### Realistic implementation requirement
If full real card-linked transaction coverage is not immediately available in local testing, still do the following:

1. Implement the **real Knot session creation flow**
2. Implement the **real Knot webhook endpoint**
3. Implement the **real transaction normalization path**
4. Add a **simulation endpoint** that injects a realistic Knot-like payload into the same ingestion pipeline

That way the prototype remains honest:
- real structure
- real services
- realistic fallback for demo/testing

### Do not fake success
If a real Knot sync is not available yet:
- mark the record source appropriately
- log that the event was simulated
- still process it through the exact same Supabase + policy + Photon pipeline

### Use cases to support
- connect account
- save linked account
- ingest transaction
- store raw payload
- create normalized records
- trigger policy evaluation

---

## Photon integration expectations

Use Photon to send a real message to my phone.

### Minimum success criteria
- a flagged transaction produces a real message
- the message includes merchant, amount, classification, and reason
- alert status is recorded in Supabase

### Message format
```txt
Expense Alert

Merchant: {{merchant}}
Amount: ${{amount}}
Classification: {{classification}}
Reason: {{reason}}

Please review this business expense.
```

### Photon service behavior
- send exactly one alert per flagged transaction unless manually replayed
- persist send result in `alerts`
- log failures clearly
- expose a simple manual test route if needed

---

## Frontend requirements

Create a very small demo UI.

### Page 1: Dashboard
Cards:
- linked accounts
- transactions
- flagged transactions
- alerts sent

### Page 2: Transactions
Columns:
- datetime
- merchant
- amount
- classification
- top reason
- alert status

### Page 3: Linked Accounts
Columns:
- merchant
- status
- provider
- last synced

### Page 4: Demo Controls
Buttons:
- connect Knot account
- simulate suspicious transaction
- simulate approved transaction
- replay alert for latest flagged transaction

---

## Demo scenarios to support

### Scenario A — Real transaction path
1. Link a supported account through Knot
2. Receive or sync a transaction
3. Normalize into Supabase
4. Evaluate with policy engine
5. Send Photon alert if flagged
6. Show result in dashboard

### Scenario B — Simulated transaction path
1. Click simulate suspicious transaction
2. Create a realistic Knot-like transaction payload
3. Save raw event in `webhook_events`
4. Normalize into `transactions` and `transaction_items`
5. Evaluate
6. Send Photon alert
7. Show result in dashboard

Both scenarios must use the same downstream pipeline after ingestion.

---

## Required implementation order

### Sprint 1 — Project foundation
- scaffold frontend and backend in TypeScript
- connect Supabase
- create schema/migrations
- create health endpoint
- create environment validation

### Sprint 2 — Knot intake
- implement Knot session endpoint
- implement Knot webhook route
- persist linked accounts and webhook payloads
- add simulation endpoint using the same normalization path

### Sprint 3 — Policy engine
- implement rule-based evaluation
- persist policy results
- prevent duplicate evaluations per transaction

### Sprint 4 — Photon alerts
- implement Photon send service
- send real alert for flagged transactions
- persist alert status
- add replay route

### Sprint 5 — Dashboard
- build small UI pages
- fetch Supabase-backed data
- support demo controls
- verify end-to-end flow

---

## QA checklist

### Foundation
- [ ] App runs locally with frontend and backend
- [ ] Supabase connection succeeds
- [ ] Required env vars are validated on startup

### Knot
- [ ] Knot session endpoint exists
- [ ] Knot webhook endpoint exists
- [ ] Linked account records save correctly
- [ ] Raw webhook payloads are stored
- [ ] Simulation endpoint uses the same normalization pipeline

### Data
- [ ] Transactions persist in Supabase
- [ ] Transaction items persist in Supabase
- [ ] Policy results persist in Supabase
- [ ] Alerts persist in Supabase

### Policy engine
- [ ] Alcohol-like purchase becomes `likely_personal`
- [ ] Ambiguous risky purchase becomes `suspicious`
- [ ] Safe transaction becomes `approved`
- [ ] Reasons are stored
- [ ] Risk scores are bounded and deterministic

### Photon
- [ ] Flagged transaction sends a real message to my phone
- [ ] Approved transaction does not send an alert
- [ ] Duplicate processing does not resend automatically
- [ ] Failed sends are stored and visible

### Dashboard
- [ ] Linked accounts page works
- [ ] Transactions page works
- [ ] Demo controls work
- [ ] Alert status is visible

---

## Non-negotiable engineering rules

- Use **Supabase as the single source of truth**
- Keep all secrets server-side
- Keep code modular
- Use clear logs around every external integration
- Do not fake successful sends or syncs
- If something is simulated, label it as simulated in metadata/logs
- Avoid backend overreach beyond prototype needs
- Write code so the prototype can actually be demoed live

---

## Definition of done

This task is done only when all of the following are true:

1. I can run the app locally
2. Supabase stores linked accounts, transactions, policy results, and alerts
3. Knot session/webhook plumbing exists
4. I can either ingest a real transaction or simulate one through the same pipeline
5. A flagged transaction sends a real Photon message to my phone
6. The frontend shows the result

---

## First tasks for the coding agent

Do these first, in order:

1. Scaffold the TypeScript frontend/backend project structure
2. Add env validation
3. Add Supabase server/client wiring
4. Create SQL schema for all required tables
5. Build `/health`
6. Build `POST /api/knot/session`
7. Build `POST /api/knot/webhook`
8. Build `POST /api/demo/simulate-transaction`
9. Build policy engine
10. Build Photon send service
11. Build dashboard pages
12. Run the full suspicious-transaction test path

---

## Deliverables expected from the agent

- project folder structure
- install commands / package.json updates
- SQL migration or Supabase SQL file
- backend routes
- Knot service wrapper
- Photon service wrapper
- policy engine
- frontend dashboard
- README run instructions
- test instructions for both real and simulated transaction paths
