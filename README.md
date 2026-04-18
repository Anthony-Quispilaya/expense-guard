# Expense Policy Alert Prototype

A working mini prototype that monitors business expenses using:
- **Supabase** — single source of truth for all data
- **Knot** — account linking and transaction ingestion
- **Photon / iMessage** — real phone alerts for suspicious spend
- **React dashboard** — inspect transactions, policy results, and alerts

---

## Architecture

```
frontend/        React + Vite + TypeScript (port 5173)
backend/         Node 20 + TypeScript + Express (port 3001)
supabase/        SQL migrations
```

**Transaction flow:**
```
Knot webhook  ─┐
               ├──► normalizer ──► Supabase ──► policy engine ──► Photon alert
Simulation    ─┘
```

Both real and simulated transactions use the **same downstream pipeline** after ingestion.

---

## Platform note: Photon / iMessage

`@photon-ai/imessage-kit` is **macOS-only**. It requires Apple Messages.app.

| Platform | Behavior |
|----------|----------|
| macOS    | Real iMessage sent to `PHOTON_TEST_NUMBER` |
| Linux / WSL2 | Alert is logged to console + persisted to Supabase with `status: platform_unsupported`. No fake success. |

---

## Prerequisites

- Node 20+
- A [Supabase](https://supabase.com) project (free tier works)
- Knot API credentials from [dashboard.knotapi.com](https://dashboard.knotapi.com)
- (macOS only) Apple Messages.app configured with your phone number for Photon

---

## Setup

### 1. Clone and install

```bash
cd /root/PU_Hack

# Backend
cd backend
cp .env.example .env
npm install

# Frontend
cd ../frontend
cp .env.example .env
npm install
```

### 2. Configure Supabase

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) → your project → SQL Editor
2. Run the migration file: `supabase/migrations/001_initial_schema.sql`
3. Copy your project URL and keys from Settings → API

### 3. Fill in environment variables

#### `backend/.env`
```env
PORT=3001
NODE_ENV=development

SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key

KNOT_CLIENT_ID=your-knot-client-id
KNOT_CLIENT_SECRET=your-knot-client-secret
KNOT_ENVIRONMENT=development

PHOTON_TEST_NUMBER=+1XXXXXXXXXX

APP_BASE_URL=http://localhost:5173
WEBHOOK_BASE_URL=https://your-ngrok-url.ngrok.io  # optional for webhook testing
```

#### `frontend/.env`
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_API_BASE_URL=http://localhost:3001
```

### 4. Run

```bash
# Terminal 1 — backend
cd backend && npm run dev

# Terminal 2 — frontend
cd frontend && npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

---

## Demo Scenarios

### Scenario A — Simulate a suspicious transaction (works immediately)

1. Open the **Demo Controls** tab in the dashboard
2. Click **"Simulate Likely Personal"** or **"Simulate Suspicious"**
3. The backend will:
   - Create a realistic Knot-shaped transaction payload
   - Save raw event to `webhook_events`
   - Normalize into `transactions` and `transaction_items`
   - Run the policy engine
   - Attempt a Photon alert (real on macOS, logged on Linux)
4. The dashboard **Transactions** tab will show the result

### Scenario B — Real Knot transaction

1. Set `KNOT_CLIENT_ID` and `KNOT_CLIENT_SECRET` in `backend/.env`
2. Configure a webhook URL in [Knot Dashboard](https://dashboard.knotapi.com) → webhook config
   - Use ngrok to expose: `ngrok http 3001` → set `WEBHOOK_BASE_URL`
   - Knot webhook URL: `https://your-ngrok.ngrok.io/api/knot/webhook`
3. Click **"Create Knot Session"** in Demo Controls to get a `session_id`
4. Use that `session_id` with the Knot frontend SDK to link a merchant account
   - Knot sends `AUTHENTICATED` webhook → linked account saved to Supabase
   - Knot sends `NEW_TRANSACTIONS_AVAILABLE` → transactions synced and ingested

### Scenario C — Replay an alert

1. Go to Demo Controls
2. Simulate a suspicious or likely_personal transaction (this sets the last transaction ID)
3. Click **"Replay Alert"** to re-send the Photon alert for that transaction

---

## API Reference

### Health
```
GET /health
```

### Knot
```
POST /api/knot/session          — Create a Knot session (body: { user_id?, merchant_ids? })
POST /api/knot/webhook          — Receive Knot webhooks (raw body)
GET  /api/knot/merchants        — List available Knot merchants
POST /api/knot/sync/:id         — Manual transaction sync (body: { user_id, merchant_id })
```

### Demo
```
POST /api/demo/simulate-transaction   — Simulate a transaction
     body: { type: "suspicious" | "approved" | "likely_personal", merchant_name?, amount? }

POST /api/demo/replay-alert/:txId    — Replay alert for a transaction
```

---

## Policy Engine v1

Deterministic rules — no AI.

| Classification | Triggered by |
|---------------|--------------|
| `likely_personal` | Personal/lifestyle keywords (alcohol, luxury, gaming, vape, casino, etc.) |
| `suspicious` | Unknown merchant + no item detail; unusual hour (midnight–5am); high amount (>$500) |
| `approved` | None of the above |

Alert is sent only for `likely_personal` and `suspicious` transactions.

---

## Database tables

| Table | Purpose |
|-------|---------|
| `linked_accounts` | Knot-linked merchant accounts |
| `transactions` | All ingested transactions |
| `transaction_items` | Line items per transaction |
| `policy_results` | Classification + risk score + reasons |
| `alerts` | Photon send status per flagged transaction |
| `webhook_events` | Raw Knot webhook payloads for replay/debug |

---

## What is real vs simulated

| Thing | Status |
|-------|--------|
| Supabase writes | Real — all data persists |
| Knot session creation | Real (requires API keys) |
| Knot webhook receiver | Real plumbing, HMAC verification |
| Simulated transactions | Clearly labeled `source: "simulation"` in DB |
| Photon alerts (macOS) | Real iMessage |
| Photon alerts (Linux) | Logged to console, `status: platform_unsupported` in DB |
| Policy engine | Fully deterministic, no external calls |

---

## Troubleshooting

**Backend fails to start**
- Check `backend/.env` — all required vars must be set
- The env validator will print which vars are missing

**Supabase connection fails**
- Verify `SUPABASE_URL` starts with `https://`
- `SUPABASE_SERVICE_ROLE_KEY` must be the service role key, not anon key

**Photon alert not arriving on macOS**
- Ensure Messages.app is open and signed in
- Verify `PHOTON_TEST_NUMBER` is in E.164 format: `+1XXXXXXXXXX`

**Knot webhooks not arriving**
- Local webhooks require ngrok: `ngrok http 3001`
- Set the resulting URL in `WEBHOOK_BASE_URL` and in the Knot Dashboard
