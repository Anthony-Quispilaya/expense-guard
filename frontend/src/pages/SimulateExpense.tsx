/**
 * SimulateExpense — interactive expense submission with live policy preview
 * and an iMessage-style Photon alert overlay for flagged transactions.
 */
import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SimResult {
  simulated: boolean;
  transaction_id: string;
  merchant: string;
  amount: number;
  policyClassification: "approved" | "suspicious" | "likely_personal";
  riskScore: number;
  reasons: string[];
  requiresReview: boolean;
  alertStatus: string;
  alertMessage: string | null;
}

interface PhotonToast {
  id: number;
  message: string;
  merchant: string;
  amount: string;
  classification: "suspicious" | "likely_personal";
  visible: boolean;
}

interface Item {
  name: string;
  qty: string;
  price: string;
}

// ── Presets ───────────────────────────────────────────────────────────────────

const PRESETS = [
  {
    label: "✅ Office Supplies",
    color: "#22c55e",
    expected: "approved",
    values: {
      merchant: "Staples",
      amount: "45.99",
      hour: "10",
      items: [{ name: "Printer Paper (500 sheets)", qty: "2", price: "12.99" }],
    },
  },
  {
    label: "✅ Team Lunch",
    color: "#22c55e",
    expected: "approved",
    values: {
      merchant: "Panera Bread",
      amount: "67.50",
      hour: "12",
      items: [{ name: "Team lunch order", qty: "5", price: "13.50" }],
    },
  },
  {
    label: "⚠️ High-Value Unknown",
    color: "#f59e0b",
    expected: "suspicious",
    values: {
      merchant: "Generic Services LLC",
      amount: "892.50",
      hour: "2",
      items: [],
    },
  },
  {
    label: "⚠️ Late Night Purchase",
    color: "#f59e0b",
    expected: "suspicious",
    values: {
      merchant: "Best Buy",
      amount: "549.00",
      hour: "3",
      items: [{ name: "Gaming headset", qty: "1", price: "549.00" }],
    },
  },
  {
    label: "🚨 Alcohol / Personal",
    color: "#ef4444",
    expected: "likely_personal",
    values: {
      merchant: "Total Wine & More",
      amount: "87.43",
      hour: "19",
      items: [
        { name: "Cabernet Sauvignon 750ml", qty: "2", price: "28.99" },
        { name: "Whiskey 1L", qty: "1", price: "54.99" },
      ],
    },
  },
  {
    label: "🚨 Spa / Entertainment",
    color: "#ef4444",
    expected: "likely_personal",
    values: {
      merchant: "The Spa at Ritz Carlton",
      amount: "320.00",
      hour: "14",
      items: [{ name: "Luxury spa massage treatment", qty: "1", price: "320.00" }],
    },
  },
];

// ── Live policy preview (client-side mirror of backend rules) ────────────────

const PERSONAL_KEYWORDS = [
  "alcohol","liquor","wine","beer","spirits","brewery","winery","distillery",
  "bar ","pub ","nightclub","vape","tobacco","luxury","gaming","casino",
  "cosmetics","beauty supply","nail salon","jewelry","spa ","massage","tattoo",
  "adult","dispensary","cannabis","gym membership","personal care",
];

function livePreview(merchant: string, amount: string, hour: string, items: Item[]) {
  const allText = [
    merchant,
    ...items.map((i) => i.name),
  ].join(" ").toLowerCase();

  const reasons: string[] = [];
  let risk = 0;

  const personalKw = PERSONAL_KEYWORDS.find((kw) => allText.includes(kw));
  if (personalKw) {
    reasons.push(`Personal keyword: "${personalKw}"`);
    risk += 55;
  }

  const amt = parseFloat(amount) || 0;
  if (amt > 500) {
    reasons.push(`Amount $${amt.toFixed(2)} exceeds $500 threshold`);
    risk += 25;
  }

  const h = parseInt(hour) || 12;
  if (h >= 0 && h < 5) {
    reasons.push(`Unusual hour: ${h}:00`);
    risk += 20;
  }

  const noMerchant = !merchant.trim() || ["unknown","misc","generic"].some((p) => merchant.toLowerCase().includes(p));
  const noItems = items.length === 0;
  if (noMerchant && noItems) {
    reasons.push("Unknown merchant with no item detail");
    risk += 35;
  }

  risk = Math.min(100, risk);

  let classification: "approved" | "suspicious" | "likely_personal" = "approved";
  if (personalKw) classification = "likely_personal";
  else if (risk >= 30) classification = "suspicious";

  return { classification, risk, reasons };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SimulateExpense() {
  const [merchant, setMerchant] = useState("Staples");
  const [amount, setAmount] = useState("45.99");
  const [hour, setHour] = useState("10");
  const [items, setItems] = useState<Item[]>([{ name: "Printer Paper (500 sheets)", qty: "2", price: "12.99" }]);
  const [submitting, setSubmitting] = useState(false);
  const [history, setHistory] = useState<SimResult[]>([]);
  const [toasts, setToasts] = useState<PhotonToast[]>([]);
  const toastCounter = useRef(0);

  const preview = livePreview(merchant, amount, hour, items);

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function applyPreset(p: (typeof PRESETS)[0]) {
    setMerchant(p.values.merchant);
    setAmount(p.values.amount);
    setHour(p.values.hour);
    setItems(p.values.items);
  }

  function addItem() {
    setItems((prev) => [...prev, { name: "", qty: "1", price: "" }]);
  }

  function removeItem(i: number) {
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateItem(i: number, field: keyof Item, value: string) {
    setItems((prev) => prev.map((item, idx) => (idx === i ? { ...item, [field]: value } : item)));
  }

  function showToast(result: SimResult) {
    const id = ++toastCounter.current;
    const toast: PhotonToast = {
      id,
      message: result.alertMessage ?? "",
      merchant: result.merchant ?? "Unknown",
      amount: `$${Number(result.amount).toFixed(2)}`,
      classification: result.policyClassification as "suspicious" | "likely_personal",
      visible: true,
    };
    setToasts((prev) => [toast, ...prev.slice(0, 2)]);
    // Auto-dismiss after 8 seconds
    setTimeout(() => {
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, visible: false } : t)));
    }, 8000);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = {
        type: preview.classification,
        merchant_name: merchant,
        amount: parseFloat(amount) || 0,
        include_items: items.length > 0,
        custom_payload: {
          datetime: (() => {
            const d = new Date();
            d.setHours(parseInt(hour) || 12, 0, 0, 0);
            return d.toISOString();
          })(),
          products: items
            .filter((i) => i.name.trim())
            .map((i) => ({
              name: i.name,
              quantity: parseInt(i.qty) || 1,
              price: {
                total: i.price || "0.00",
                unit_price: i.price || "0.00",
                sub_total: null,
              },
              eligibility: [],
            })),
        },
      };

      const res = await fetch("/api/demo/simulate-transaction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data: SimResult = await res.json();

      setHistory((prev) => [data, ...prev]);

      // Show Photon alert toast for flagged transactions
      if (data.requiresReview && data.alertMessage) {
        showToast(data);
      }
    } catch (err) {
      console.error("Simulation failed", err);
    } finally {
      setSubmitting(false);
    }
  }

  const classColor = {
    approved: "#22c55e",
    suspicious: "#f59e0b",
    likely_personal: "#ef4444",
  };

  const classLabel = {
    approved: "✅ Approved",
    suspicious: "⚠️ Suspicious",
    likely_personal: "🚨 Likely Personal",
  };

  return (
    <div className="animate-in">
      {/* ── Photon iMessage Toast Stack (portal to body) ───────────────────────── */}
      {createPortal(
        <div
          style={{
            position: "fixed",
            top: 24,
            right: 24,
            zIndex: 99999,
            display: "flex",
            flexDirection: "column",
            gap: 12,
            pointerEvents: "none",
          }}
        >
          {toasts.filter((t) => t.visible).map((toast) => (
            <PhotonAlert
              key={toast.id}
              toast={toast}
              onDismiss={() =>
                setToasts((prev) =>
                  prev.map((t) => (t.id === toast.id ? { ...t, visible: false } : t))
                )
              }
            />
          ))}
        </div>,
        document.body
      )}

      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Simulate Expense</h1>
          <p className="page-subtitle">
            Submit a test expense through the full policy pipeline: evaluation → Supabase → Photon alert
          </p>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 24, alignItems: "start" }}>

        {/* ── Left: Form ──────────────────────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Quick presets */}
          <section style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 20, boxShadow: "var(--shadow-sm)" }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 14 }}>
              Quick Scenarios
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  onClick={() => applyPreset(p)}
                  style={{
                    background: `${p.color}0d`,
                    border: `1px solid ${p.color}30`,
                    borderRadius: 20,
                    padding: "6px 14px",
                    fontSize: 12,
                    fontWeight: 600,
                    color: p.color,
                    cursor: "pointer",
                    transition: "all var(--t-fast)",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = `${p.color}18`;
                    (e.currentTarget as HTMLElement).style.borderColor = `${p.color}50`;
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = `${p.color}0d`;
                    (e.currentTarget as HTMLElement).style.borderColor = `${p.color}30`;
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </section>

          {/* Form */}
          <form onSubmit={handleSubmit}>
            <section style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 20, display: "flex", flexDirection: "column", gap: 16, boxShadow: "var(--shadow-sm)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted)" }}>
                Expense Details
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>MERCHANT NAME</span>
                  <input
                    value={merchant}
                    onChange={(e) => setMerchant(e.target.value)}
                    placeholder="e.g. Staples, Amazon"
                    required
                    style={inputStyle}
                  />
                </label>

                <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>AMOUNT (USD)</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    required
                    style={inputStyle}
                  />
                </label>
              </div>

              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>
                  TRANSACTION HOUR (0–23) — business hours: 8–18, unusual: 0–4
                </span>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <input
                    type="range"
                    min={0}
                    max={23}
                    value={hour}
                    onChange={(e) => setHour(e.target.value)}
                    style={{ flex: 1, accentColor: parseInt(hour) < 5 ? "#ef4444" : "var(--primary)" }}
                  />
                  <span style={{
                    fontFamily: "monospace",
                    fontWeight: 700,
                    fontSize: 14,
                    color: parseInt(hour) < 5 ? "#ef4444" : "var(--text)",
                    width: 48,
                    textAlign: "right",
                  }}>
                    {String(parseInt(hour)).padStart(2, "0")}:00
                    {parseInt(hour) < 5 ? " ⚠" : ""}
                  </span>
                </div>
              </label>

              {/* Line items */}
              <div>
                <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, marginBottom: 8 }}>
                  ITEMS (optional — affects personal keyword detection)
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {items.map((item, i) => (
                    <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 56px 72px 28px", gap: 8, alignItems: "center" }}>
                      <input
                        value={item.name}
                        onChange={(e) => updateItem(i, "name", e.target.value)}
                        placeholder="Item name"
                        style={inputStyle}
                      />
                      <input
                        type="number"
                        min="1"
                        value={item.qty}
                        onChange={(e) => updateItem(i, "qty", e.target.value)}
                        placeholder="Qty"
                        style={{ ...inputStyle, textAlign: "center" }}
                      />
                      <input
                        value={item.price}
                        onChange={(e) => updateItem(i, "price", e.target.value)}
                        placeholder="$0.00"
                        style={{ ...inputStyle, textAlign: "right" }}
                      />
                      <button
                        type="button"
                        onClick={() => removeItem(i)}
                        style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer", fontSize: 16 }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addItem}
                    style={{ background: "var(--surface-2)", border: "1px dashed var(--border-strong)", borderRadius: "var(--radius-sm)", padding: "7px 14px", fontSize: 12, color: "var(--muted)", cursor: "pointer", textAlign: "left", transition: "all var(--t-fast)" }}
                  >
                    + Add item
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="btn btn-primary"
                style={{ padding: "12px 28px", fontSize: 14, justifyContent: "center" }}
              >
                {submitting ? "Processing…" : "⚡ Submit Expense"}
              </button>
            </section>
          </form>
        </div>

        {/* ── Right: Live Preview ──────────────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Policy preview */}
          <section style={{
            background: "var(--surface)",
            border: `1px solid ${classColor[preview.classification]}50`,
            borderRadius: "var(--radius-lg)",
            padding: 20,
            boxShadow: `var(--shadow-sm), 0 0 24px ${classColor[preview.classification]}0a`,
            transition: "border-color 0.25s, box-shadow 0.25s",
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 14 }}>
              Live Policy Preview
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: classColor[preview.classification], marginBottom: 10 }}>
              {classLabel[preview.classification]}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div style={{ flex: 1, height: 6, background: "var(--surface-3)", borderRadius: 3, overflow: "hidden" }}>
                <div style={{
                  width: `${preview.risk}%`,
                  height: "100%",
                  background: preview.risk >= 55 ? "var(--danger)" : preview.risk >= 30 ? "var(--warning)" : "var(--success)",
                  borderRadius: 3,
                  transition: "width 0.3s ease, background 0.3s ease",
                }} />
              </div>
              <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 13, color: "var(--text)", minWidth: 32, textAlign: "right" }}>
                {preview.risk}
              </span>
            </div>
            {preview.reasons.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {preview.reasons.map((r, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <span style={{ color: classColor[preview.classification], fontSize: 11, marginTop: 3, flexShrink: 0 }}>▸</span>
                    <span style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.5 }}>{r}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: 12, color: "var(--success)", margin: 0 }}>✓ No policy flags — this expense looks clean.</p>
            )}
            {preview.classification !== "approved" && (
              <div style={{ marginTop: 14, padding: "8px 12px", background: "rgba(239,68,68,0.07)", borderRadius: "var(--radius-sm)", fontSize: 11, color: "var(--danger)", border: "1px solid rgba(239,68,68,0.2)" }}>
                🔔 Photon alert will fire when submitted
              </div>
            )}
          </section>

          {/* Photon info */}
          <section style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 20, boxShadow: "var(--shadow-sm)" }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 12 }}>
              Alert Channels
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "rgba(88,101,242,0.08)", borderRadius: "var(--radius-sm)", border: "1px solid rgba(88,101,242,0.2)" }}>
                <span style={{ fontSize: 16 }}>🔔</span>
                <div>
                  <strong style={{ color: "#7289da", fontSize: 13 }}>Discord</strong>
                  <div style={{ fontSize: 11, color: "var(--muted)" }}>webhook · active</div>
                </div>
                <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 700, color: "var(--success)", background: "var(--success-bg)", padding: "2px 8px", borderRadius: 10, border: "1px solid var(--success-border)" }}>LIVE</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "var(--surface-2)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", opacity: 0.5 }}>
                <span style={{ fontSize: 16 }}>📱</span>
                <div>
                  <strong style={{ fontSize: 13 }}>iMessage</strong>
                  <div style={{ fontSize: 11, color: "var(--muted)" }}>macOS only · unavailable on Linux</div>
                </div>
                <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 700, color: "var(--muted)", background: "var(--surface-3)", padding: "2px 8px", borderRadius: 10 }}>N/A</span>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* ── Submission History ───────────────────────────────────────────────── */}
      {history.length > 0 && (
        <section style={{ marginTop: 28, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden", boxShadow: "var(--shadow-sm)" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <span style={{ fontWeight: 700, fontSize: 14 }}>Submission History</span>
              <span style={{ fontSize: 12, color: "var(--muted)", marginLeft: 8 }}>{history.length} this session</span>
            </div>
            <button
              onClick={() => setHistory([])}
              className="btn btn-ghost"
              style={{ fontSize: 11, padding: "4px 10px" }}
            >
              Clear
            </button>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                {["Merchant","Amount","Policy","Risk","Alert"].map(h => <th key={h}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {history.map((r, i) => (
                <tr key={i}>
                  <td>
                    <div style={{ fontWeight: 500, color: "var(--text)" }}>{r.merchant}</div>
                    {r.reasons?.length > 0 && (
                      <div style={{ color: "var(--muted)", fontSize: 11, marginTop: 2 }}>
                        {r.reasons.slice(0, 1).join(" · ")}
                      </div>
                    )}
                  </td>
                  <td style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>
                    ${Number(r.amount).toFixed(2)}
                  </td>
                  <td>
                    <span style={{ fontWeight: 700, fontSize: 12, color: classColor[r.policyClassification] }}>
                      {classLabel[r.policyClassification]}
                    </span>
                  </td>
                  <td>
                    <div className="risk-bar-wrap">
                      <div className="risk-bar-track" style={{ minWidth: 40 }}>
                        <div className="risk-bar-fill" style={{
                          width: `${r.riskScore}%`,
                          background: r.riskScore >= 55 ? "var(--danger)" : r.riskScore >= 30 ? "var(--warning)" : "var(--success)",
                        }} />
                      </div>
                      <span className="risk-score-label">{r.riskScore}</span>
                    </div>
                  </td>
                  <td>
                    <span style={{
                      fontSize: 11,
                      fontWeight: 600,
                      padding: "2px 9px",
                      borderRadius: 20,
                      background: r.alertStatus === "sent" ? "var(--success-bg)" : "var(--surface-3)",
                      color: r.alertStatus === "sent" ? "var(--success)" : "var(--muted)",
                      border: r.alertStatus === "sent" ? "1px solid var(--success-border)" : "1px solid var(--border)",
                    }}>
                      {r.alertStatus === "sent" ? "🔔 Sent"
                        : r.alertStatus === "platform_unsupported" ? "Simulated"
                        : r.alertStatus === "skipped" ? "—"
                        : r.alertStatus}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

// ── iMessage-style Photon Alert Toast ─────────────────────────────────────────

function PhotonAlert({ toast, onDismiss }: { toast: PhotonToast; onDismiss: () => void }) {
  const isSuspicious = toast.classification === "suspicious";
  const lines = toast.message.split("\n").filter(Boolean);

  return (
    <div
      style={{
        width: 320,
        background: "#1c1c1e",
        borderRadius: 16,
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        overflow: "hidden",
        pointerEvents: "auto",
        animation: "slideIn 0.35s ease",
      }}
    >
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(110%); opacity: 0; }
          to   { transform: translateX(0);   opacity: 1; }
        }
      `}</style>

      {/* Header bar */}
      <div style={{
        background: isSuspicious ? "#f59e0b" : "#ef4444",
        padding: "8px 14px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16 }}>📱</span>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#000", opacity: 0.7 }}>PHOTON · iMESSAGE ALERT</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#000" }}>
              {isSuspicious ? "⚠️ Suspicious Transaction" : "🚨 Expense Policy Violation"}
            </div>
          </div>
        </div>
        <button
          onClick={onDismiss}
          style={{ background: "none", border: "none", color: "rgba(0,0,0,0.6)", cursor: "pointer", fontSize: 18, lineHeight: 1 }}
        >
          ×
        </button>
      </div>

      {/* Message bubble */}
      <div style={{ padding: "14px 16px", background: "#1c1c1e" }}>
        <div style={{
          background: "#2c2c2e",
          borderRadius: 12,
          padding: "10px 14px",
          position: "relative",
        }}>
          {lines.map((line, i) => (
            <div key={i} style={{
              fontSize: line === "Expense Alert" ? 13 : 12,
              fontWeight: line === "Expense Alert" ? 700 : 400,
              color: line === "Expense Alert" ? "#fff" : i === 0 ? "#fff" : "#ababab",
              marginBottom: i === 0 ? 6 : 2,
              lineHeight: 1.5,
            }}>
              {line}
            </div>
          ))}
        </div>
        <div style={{ textAlign: "right", fontSize: 10, color: "#636366", marginTop: 6 }}>
          now · via Photon iMessage Kit
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 6,
  border: "1px solid var(--border-strong)",
  background: "var(--surface-2)",
  color: "var(--text)",
  fontSize: 13,
  width: "100%",
  boxSizing: "border-box",
  fontFamily: "var(--font)",
  outline: "none",
  transition: "border-color 0.1s ease",
};
