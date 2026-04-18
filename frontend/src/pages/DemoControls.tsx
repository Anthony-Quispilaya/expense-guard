import React, { useState } from "react";
import { api } from "../lib/api";

type SimType = "suspicious" | "approved" | "likely_personal";

interface SimResult {
  simulated: boolean;
  transaction_id: string;
  merchant: string;
  amount: number;
  policyClassification: string;
  riskScore: number;
  alertStatus: string;
}

interface LogEntry {
  ts: string;
  action: string;
  result: unknown;
  error?: string;
}

function Btn({
  children,
  onClick,
  color = "var(--primary)",
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  color?: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: disabled ? "var(--border)" : color,
        color: disabled ? "var(--muted)" : "#fff",
        border: "none",
        padding: "10px 20px",
        borderRadius: 6,
        fontWeight: 600,
        fontSize: 13,
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "opacity 0.15s",
      }}
    >
      {children}
    </button>
  );
}

export default function DemoControls() {
  const [loading, setLoading] = useState<string | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [lastTransactionId, setLastTransactionId] = useState<string | null>(null);
  const [sessionInfo, setSessionInfo] = useState<{ session_id: string } | null>(null);
  const [devLinkUserId, setDevLinkUserId] = useState(`prototype-user-${Date.now()}`);
  const [devLinkMerchantId, setDevLinkMerchantId] = useState(19);

  function addLog(action: string, result: unknown, error?: string) {
    setLog((prev) => [
      { ts: new Date().toISOString(), action, result, error },
      ...prev,
    ]);
  }

  async function run(key: string, fn: () => Promise<unknown>) {
    setLoading(key);
    try {
      const result = await fn();
      addLog(key, result);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addLog(key, null, msg);
      return null;
    } finally {
      setLoading(null);
    }
  }

  async function simulate(type: SimType) {
    const result = await run(`simulate_${type}`, () =>
      api.simulateTransaction(type)
    );
    if (result && (result as SimResult).transaction_id) {
      setLastTransactionId((result as SimResult).transaction_id);
    }
  }

  async function createSession() {
    const result = await run("create_knot_session", () =>
      api.createKnotSession()
    );
    if (result) setSessionInfo(result as { session_id: string });
  }

  async function devLink() {
    await run("knot_dev_link", () =>
      api.devLinkKnot({
        external_user_id: devLinkUserId,
        merchant_id: devLinkMerchantId,
      })
    );
    setDevLinkUserId(`prototype-user-${Date.now()}`);
  }

  async function devLinkAll() {
    const MERCHANT_IDS = [19, 36, 44, 2125];
    const baseUser = `bulk-user-${Date.now()}`;
    for (const id of MERCHANT_IDS) {
      await run(`knot_dev_link_${id}`, () =>
        api.devLinkKnot({ external_user_id: `${baseUser}-${id}`, merchant_id: id })
      );
    }
    setDevLinkUserId(`prototype-user-${Date.now()}`);
  }

  async function replay() {
    if (!lastTransactionId) return;
    await run("replay_alert", () => api.replayAlert(lastTransactionId));
  }

  async function healthCheck() {
    await run("health_check", () => api.health());
  }

  const MERCHANT_OPTIONS = [
    { id: 19, label: "DoorDash" },
    { id: 36, label: "Uber Eats" },
    { id: 44, label: "Amazon" },
    { id: 2125, label: "Shop Pay" },
  ];

  return (
    <div className="animate-in">
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Dev Tools</h1>
          <p className="page-subtitle">Trigger simulations and test flows — results appear in the log below</p>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {/* Simulation */}
        <section
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            padding: 24,
          }}
        >
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Simulate Transaction</h2>
          <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 16 }}>
            Inject a realistic Knot-shaped payload through the full pipeline:
            normalizer → Supabase → policy engine → Photon alert.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Btn
              color="#ef4444"
              disabled={loading !== null}
              onClick={() => simulate("likely_personal")}
            >
              {loading === "simulate_likely_personal" ? "Simulating…" : "🚨 Simulate Likely Personal"}
            </Btn>
            <Btn
              color="#f59e0b"
              disabled={loading !== null}
              onClick={() => simulate("suspicious")}
            >
              {loading === "simulate_suspicious" ? "Simulating…" : "⚠️ Simulate Suspicious"}
            </Btn>
            <Btn
              color="#22c55e"
              disabled={loading !== null}
              onClick={() => simulate("approved")}
            >
              {loading === "simulate_approved" ? "Simulating…" : "✓ Simulate Approved"}
            </Btn>
          </div>
        </section>

        {/* Knot Dev Link */}
        <section
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            padding: 24,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600 }}>🔗 Knot Dev Link — Pull Transactions</h2>
            <span style={{
              fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
              background: "rgba(34,197,94,0.12)", color: "var(--success)",
              border: "1px solid rgba(34,197,94,0.3)", borderRadius: 4, padding: "3px 8px",
            }}>
              DEVELOPMENT MODE
            </span>
          </div>
          <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 16 }}>
            Calls Knot's <code>/development/accounts/link</code> API to generate ~205 real SKU-level
            transactions per merchant and immediately runs them through the full pipeline.
            No SDK or webhook needed.
          </p>

          {/* Link All button */}
          <div style={{
            background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.3)",
            borderRadius: 8, padding: "14px 16px", marginBottom: 16,
            display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>Link All 4 Merchants at Once</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                DoorDash · Uber Eats · Amazon · Shop Pay — generates ~820 total transactions
              </div>
            </div>
            <Btn
              color="#6366f1"
              disabled={loading !== null}
              onClick={devLinkAll}
            >
              {loading?.startsWith("knot_dev_link_") ? "Linking all…" : "⚡ Link All Merchants"}
            </Btn>
          </div>

          {/* Single merchant link */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>USER ID</span>
              <input
                value={devLinkUserId}
                onChange={(e) => setDevLinkUserId(e.target.value)}
                style={{
                  padding: "8px 12px", borderRadius: 6,
                  border: "1px solid var(--border)", background: "var(--surface2)",
                  color: "var(--text)", fontSize: 12, width: 220,
                }}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>MERCHANT</span>
              <select
                value={devLinkMerchantId}
                onChange={(e) => setDevLinkMerchantId(Number(e.target.value))}
                style={{
                  padding: "8px 12px", borderRadius: 6,
                  border: "1px solid var(--border)", background: "var(--surface2)",
                  color: "var(--text)", fontSize: 12,
                }}
              >
                {MERCHANT_OPTIONS.map((m) => (
                  <option key={m.id} value={m.id}>{m.label} (id:{m.id})</option>
                ))}
              </select>
            </label>
            <Btn
              color="#4f46e5"
              disabled={loading !== null || !devLinkUserId}
              onClick={devLink}
            >
              {loading === "knot_dev_link" ? "Linking…" : "Link One"}
            </Btn>
          </div>
          <p style={{ color: "var(--muted)", fontSize: 11, marginTop: 10 }}>
            Takes 10–20 s per merchant while Knot generates sample data. Check the log below for results.
          </p>
        </section>

        {/* Knot session (for real SDK integration) */}
        <section
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            padding: 24,
          }}
        >
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Knot Session (SDK Integration)</h2>
          <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 16 }}>
            Create a Knot session to use with the Knot SDK for real account linking.
            Requires valid KNOT_CLIENT_ID and KNOT_CLIENT_SECRET in the backend .env.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <Btn disabled={loading !== null} onClick={createSession}>
              {loading === "create_knot_session" ? "Creating…" : "🔗 Create Knot Session"}
            </Btn>
            {sessionInfo && (
              <code
                style={{
                  background: "var(--surface2)",
                  padding: "6px 12px",
                  borderRadius: 4,
                  fontSize: 12,
                  color: "var(--text)",
                }}
              >
                session_id: {sessionInfo.session_id}
              </code>
            )}
          </div>
        </section>

        {/* Replay alert */}
        <section
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            padding: 24,
          }}
        >
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Replay Alert</h2>
          <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 16 }}>
            Re-send the Photon alert for the last simulated flagged transaction.
            {lastTransactionId && (
              <span style={{ fontFamily: "monospace", color: "var(--text)", marginLeft: 6 }}>
                ({lastTransactionId.slice(0, 8)}…)
              </span>
            )}
          </p>
          <div style={{ display: "flex", gap: 12 }}>
            <Btn
              color="var(--info)"
              disabled={loading !== null || !lastTransactionId}
              onClick={replay}
            >
              {loading === "replay_alert" ? "Replaying…" : "↺ Replay Alert"}
            </Btn>
            <Btn disabled={loading !== null} onClick={healthCheck}>
              {loading === "health_check" ? "Checking…" : "🩺 Health Check"}
            </Btn>
          </div>
        </section>

        {/* Log output */}
        {log.length > 0 && (
          <section
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "12px 20px",
                borderBottom: "1px solid var(--border)",
                fontWeight: 600,
                fontSize: 13,
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <span>Action Log</span>
              <button
                onClick={() => setLog([])}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--muted)",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                Clear
              </button>
            </div>
            <div style={{ maxHeight: 400, overflowY: "auto" }}>
              {log.map((entry, i) => (
                <div
                  key={i}
                  style={{
                    padding: "12px 20px",
                    borderBottom: "1px solid var(--border)",
                    background: entry.error ? "rgba(239,68,68,0.05)" : "transparent",
                  }}
                >
                  <div style={{ display: "flex", gap: 12, alignItems: "baseline", marginBottom: 6 }}>
                    <span
                      style={{
                        fontFamily: "monospace",
                        fontWeight: 700,
                        color: entry.error ? "var(--danger)" : "var(--success)",
                        fontSize: 12,
                      }}
                    >
                      {entry.error ? "✗" : "✓"} {entry.action}
                    </span>
                    <span style={{ color: "var(--muted)", fontSize: 11 }}>
                      {new Date(entry.ts).toLocaleTimeString()}
                    </span>
                  </div>
                  {entry.error && (
                    <div style={{ color: "var(--danger)", fontSize: 12, marginBottom: 4 }}>
                      {entry.error}
                    </div>
                  )}
                  {entry.result != null && (
                    <pre
                      style={{
                        margin: 0,
                        fontSize: 11,
                        color: "var(--muted)",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-all",
                        background: "var(--surface2)",
                        padding: "8px 12px",
                        borderRadius: 4,
                      }}
                    >
                      {JSON.stringify(entry.result, null, 2)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
