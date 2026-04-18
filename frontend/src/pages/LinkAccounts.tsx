/**
 * LinkAccounts — uses the official Knot Web SDK modal to link real merchant accounts.
 *
 * Flow per merchant:
 *   1. Backend creates a session (POST /api/knot/session)
 *   2. We open the Knot SDK with that session + the merchant's id
 *   3. Knot renders its own native UI — credential entry, MFA, etc.
 *   4. onSuccess fires when the account is linked
 *   5. Backend receives AUTHENTICATED webhook → persists the linked account
 *   6. We show a success state and let the user proceed
 *
 * The Knot SDK handles ALL login UI. We only manage the button state,
 * status messages, and session lifecycle.
 */

import React, { useEffect, useState, useCallback } from "react";
import KnotapiJS, { type KnotSuccess, type KnotError, type KnotEvent, type KnotExit } from "knotapi-js";
import { api } from "../lib/api";

const CLIENT_ID = import.meta.env.VITE_KNOT_CLIENT_ID as string;
const KNOT_ENV = (import.meta.env.VITE_KNOT_ENVIRONMENT ?? "development") as
  | "development"
  | "production";

interface Merchant {
  id: number;
  name: string;
  category?: string;
  logo?: string;
}

type MerchantStatus = "idle" | "loading_session" | "sdk_open" | "linked" | "error";

interface MerchantState {
  status: MerchantStatus;
  error?: string;
  linkedAt?: string;
}

export default function LinkAccounts() {
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [loadingMerchants, setLoadingMerchants] = useState(true);
  const [merchantsError, setMerchantsError] = useState<string | null>(null);
  const [states, setStates] = useState<Record<number, MerchantState>>({});
  const [eventLog, setEventLog] = useState<
    Array<{ ts: string; merchantId: number; event: string; detail?: string }>
  >([]);

  const knotapi = React.useRef<InstanceType<typeof KnotapiJS> | null>(null);

  // Load merchant list from Knot via our backend proxy
  useEffect(() => {
    api
      .listKnotMerchants()
      .then((res) => setMerchants(res.merchants))
      .catch((err) => setMerchantsError(err.message ?? "Failed to load merchants"))
      .finally(() => setLoadingMerchants(false));
  }, []);

  function setMerchantState(merchantId: number, update: Partial<MerchantState>) {
    setStates((prev) => ({
      ...prev,
      [merchantId]: { ...(prev[merchantId] ?? { status: "idle" }), ...update },
    }));
  }  function addEvent(merchantId: number, event: string, detail?: string) {
    setEventLog((prev) => [
      { ts: new Date().toISOString(), merchantId, event, detail },
      ...prev.slice(0, 49),
    ]);
  }

  const openSDK = useCallback(
    async (merchant: Merchant) => {
      const merchantId = merchant.id;
      setMerchantState(merchantId, { status: "loading_session", error: undefined });
      addEvent(merchantId, "SESSION_REQUESTED", `Creating session for ${merchant.name}`);

      let sessionId: string;
      try {
        const session = await api.createKnotSession({
          external_user_id: `user_${Date.now()}`,
          merchant_id: merchantId,
        });
        sessionId = session.session_id;
        addEvent(merchantId, "SESSION_CREATED", sessionId.slice(0, 8) + "…");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setMerchantState(merchantId, { status: "error", error: msg });
        addEvent(merchantId, "SESSION_ERROR", msg);
        return;
      }

      if (!knotapi.current) {
        knotapi.current = new KnotapiJS();
      }

      setMerchantState(merchantId, { status: "sdk_open" });
      addEvent(merchantId, "SDK_OPENED", `Launching Knot SDK for ${merchant.name}`);

      knotapi.current.open({
        sessionId,
        clientId: CLIENT_ID,
        environment: KNOT_ENV,
        product: "transaction_link",
        merchantIds: [merchantId],
        entryPoint: "link_accounts",
        useCategories: false,
        useSearch: false,

        onSuccess: (knotSuccess: KnotSuccess) => {
          console.log("[Knot] onSuccess", knotSuccess);
          const name = knotSuccess.merchant ?? merchant.name;
          setMerchantState(merchantId, {
            status: "linked",
            linkedAt: new Date().toISOString(),
          });
          addEvent(merchantId, "SUCCESS", `${name} linked successfully`);
        },

        onError: (knotError: KnotError) => {
          console.error("[Knot] onError", knotError);
          setMerchantState(merchantId, {
            status: "error",
            error: `${knotError.errorCode}: ${knotError.errorDescription}`,
          });
          addEvent(merchantId, "ERROR", `${knotError.errorCode} — ${knotError.errorDescription}`);
        },

        onExit: (_knotExit: KnotExit) => {
          console.log("[Knot] onExit", _knotExit);
          setStates((prev) => {
            const cur = prev[merchantId] ?? { status: "idle" as MerchantStatus };
            if (cur.status === "sdk_open" || cur.status === "loading_session") {
              return { ...prev, [merchantId]: { ...cur, status: "idle" as MerchantStatus } };
            }
            return prev;
          });
          addEvent(merchantId, "EXIT", "User closed the SDK");
        },

        onEvent: (knotEvent: KnotEvent) => {
          console.log("[Knot] onEvent", knotEvent);
          const mid = knotEvent.merchantId ? Number(knotEvent.merchantId) : merchantId;
          addEvent(
            mid,
            knotEvent.event,
            knotEvent.merchant ? `${knotEvent.merchant}` : undefined
          );
        },
      });
    },
    []
  );

  // ── Render helpers ─────────────────────────────────────────────────────────

  function getButtonLabel(s: MerchantState | undefined): string {
    switch (s?.status) {
      case "loading_session":
        return "Connecting…";
      case "sdk_open":
        return "Knot is open…";
      case "linked":
        return "✓ Linked";
      case "error":
        return "Retry";
      default:
        return "Link Account";
    }
  }

  function getButtonColor(s: MerchantState | undefined): string {
    switch (s?.status) {
      case "linked":
        return "var(--success)";
      case "error":
        return "var(--danger)";
      default:
        return "var(--primary)";
    }
  }

  // Group by category if present
  const grouped = React.useMemo(() => {
    const map: Record<string, Merchant[]> = {};
    for (const m of merchants) {
      const cat = m.category ?? "Other";
      if (!map[cat]) map[cat] = [];
      map[cat].push(m);
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [merchants]);

  return (
    <div className="animate-in">
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Link Accounts</h1>
          <p className="page-subtitle">
            Connect a merchant via Knot — credentials are handled entirely by Knot, nothing is stored here
          </p>
        </div>
      </div>

      {/* Environment + test credentials notice */}
      <div
        style={{
          background: KNOT_ENV === "development" ? "rgba(245,158,11,0.08)" : "rgba(34,197,94,0.08)",
          border: `1px solid ${KNOT_ENV === "development" ? "#f59e0b" : "var(--success)"}`,
          borderRadius: "var(--radius)",
          padding: "14px 18px",
          marginBottom: 24,
          fontSize: 13,
        }}
      >
        <div style={{ fontWeight: 700, color: KNOT_ENV === "development" ? "#f59e0b" : "var(--success)", marginBottom: 6 }}>
          {KNOT_ENV === "development" ? "⚠ Development Environment — Use Test Credentials" : "✓ Production Environment"}
        </div>
        {KNOT_ENV === "development" && (
          <div style={{ color: "var(--text)", lineHeight: 1.7 }}>
            Real merchant logins only work in <strong>production</strong>. In dev, use Knot's test credentials inside the SDK modal:
            <div style={{ marginTop: 10, display: "flex", gap: 24, flexWrap: "wrap" }}>
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, padding: "10px 16px" }}>
                <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, marginBottom: 4 }}>GENERATES NEW TRANSACTIONS</div>
                <div><span style={{ color: "var(--muted)" }}>Username:</span> <code style={{ background: "var(--surface2)", padding: "2px 6px", borderRadius: 4 }}>user_good_transactions</code></div>
                <div style={{ marginTop: 4 }}><span style={{ color: "var(--muted)" }}>Password:</span> <code style={{ background: "var(--surface2)", padding: "2px 6px", borderRadius: 4 }}>pass_good</code></div>
              </div>
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, padding: "10px 16px" }}>
                <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, marginBottom: 4 }}>NEW + UPDATED TRANSACTIONS</div>
                <div><span style={{ color: "var(--muted)" }}>Username:</span> <code style={{ background: "var(--surface2)", padding: "2px 6px", borderRadius: 4 }}>user_good_transactions</code></div>
                <div style={{ marginTop: 4 }}><span style={{ color: "var(--muted)" }}>Password:</span> <code style={{ background: "var(--surface2)", padding: "2px 6px", borderRadius: 4 }}>pass_good_updates</code></div>
              </div>
            </div>
            <div style={{ marginTop: 10, color: "var(--muted)", fontSize: 12 }}>
              To use real accounts, switch to production credentials in <code>backend/.env</code> and <code>frontend/.env</code>.
            </div>
          </div>
        )}
      </div>

      {!CLIENT_ID && (
        <div
          style={{
            background: "rgba(239,68,68,0.1)",
            border: "1px solid var(--danger)",
            borderRadius: "var(--radius)",
            padding: "12px 16px",
            color: "var(--danger)",
            marginBottom: 24,
            fontSize: 13,
          }}
        >
          <strong>Missing VITE_KNOT_CLIENT_ID</strong> — add it to{" "}
          <code>frontend/.env</code> and restart the dev server.
        </div>
      )}

      {loadingMerchants ? (
        <div style={{ color: "var(--muted)", padding: 40, textAlign: "center" }}>
          Loading merchants from Knot…
        </div>
      ) : merchantsError ? (
        <div
          style={{
            background: "rgba(239,68,68,0.1)",
            border: "1px solid var(--danger)",
            borderRadius: "var(--radius)",
            padding: "16px 20px",
            color: "var(--danger)",
            marginBottom: 24,
          }}
        >
          <strong>Could not load merchant list:</strong> {merchantsError}
          <br />
          <span style={{ fontSize: 12, opacity: 0.8 }}>
            Check that the backend is running and KNOT_CLIENT_ID / KNOT_CLIENT_SECRET are set.
          </span>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
          {grouped.map(([category, ms]) => (
            <section key={category}>
              <h2
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--muted)",
                  marginBottom: 12,
                }}
              >
                {category}
              </h2>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                  gap: 12,
                }}
              >
                {ms.map((merchant) => {
                  const s = states[merchant.id];
                  const isLinked = s?.status === "linked";
                  const isBusy =
                    s?.status === "loading_session" || s?.status === "sdk_open";

                  return (
                    <div
                      key={merchant.id}
                      style={{
                        background: "var(--surface)",
                        border: `1px solid ${
                          isLinked ? "var(--success)" : "var(--border)"
                        }`,
                        borderRadius: "var(--radius)",
                        padding: "16px 20px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                        transition: "border-color 0.2s",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                        {merchant.logo && (
                          <img
                            src={merchant.logo}
                            alt={merchant.name}
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: 8,
                              objectFit: "contain",
                              background: "#fff",
                              border: "1px solid var(--border)",
                              padding: 2,
                              flexShrink: 0,
                            }}
                          />
                        )}
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontWeight: 600,
                              fontSize: 14,
                              color: "var(--text)",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {merchant.name}
                          </div>
                          {s?.error && (
                            <div
                              style={{
                                fontSize: 11,
                                color: "var(--danger)",
                                marginTop: 4,
                                wordBreak: "break-word",
                                maxWidth: 200,
                              }}
                            >
                              {s.error === "INVALID_CLIENT_ID: The client ID is invalid."
                                ? "INVALID_CLIENT_ID — check VITE_KNOT_CLIENT_ID matches the dev environment"
                                : s.error === "EXPIRED_SESSION: The session has expired."
                                ? "Session expired — try again"
                                : s.error}
                            </div>
                          )}
                          {isLinked && s?.linkedAt && (
                            <div
                              style={{
                                fontSize: 11,
                                color: "var(--success)",
                                marginTop: 4,
                              }}
                            >
                              Linked {new Date(s.linkedAt).toLocaleTimeString()}
                            </div>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => !isBusy && openSDK(merchant)}
                        disabled={isBusy}
                        style={{
                          background: getButtonColor(s),
                          color: isLinked ? "#fff" : "#fff",
                          border: "none",
                          padding: "8px 16px",
                          borderRadius: 6,
                          fontWeight: 600,
                          fontSize: 12,
                          cursor: isBusy ? "wait" : "pointer",
                          whiteSpace: "nowrap",
                          flexShrink: 0,
                          opacity: isBusy ? 0.7 : 1,
                        }}
                      >
                        {getButtonLabel(s)}
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* SDK Event Log */}
      {eventLog.length > 0 && (
        <section
          style={{
            marginTop: 40,
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
            <span>SDK Event Log</span>
            <button
              onClick={() => setEventLog([])}
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
          <div style={{ maxHeight: 280, overflowY: "auto" }}>
            {eventLog.map((e, i) => (
              <div
                key={i}
                style={{
                  padding: "8px 20px",
                  borderBottom: "1px solid var(--border)",
                  display: "flex",
                  gap: 16,
                  alignItems: "baseline",
                  fontSize: 12,
                }}
              >
                <span style={{ color: "var(--muted)", fontFamily: "monospace", flexShrink: 0 }}>
                  {new Date(e.ts).toLocaleTimeString()}
                </span>
                <span
                  style={{
                    fontFamily: "monospace",
                    fontWeight: 700,
                    color:
                      e.event === "SUCCESS"
                        ? "var(--success)"
                        : e.event === "ERROR"
                        ? "var(--danger)"
                        : e.event === "EXIT"
                        ? "var(--muted)"
                        : "var(--primary)",
                    flexShrink: 0,
                  }}
                >
                  {e.event}
                </span>
                {e.detail && (
                  <span style={{ color: "var(--muted)", minWidth: 0, wordBreak: "break-all" }}>
                    {e.detail}
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
