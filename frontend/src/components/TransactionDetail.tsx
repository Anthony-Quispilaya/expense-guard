import React, { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { format } from "date-fns";
import { api, type TransactionDetail, type ReviewRecord } from "../lib/api";
import Badge from "./Badge";

interface Props {
  txId: string | null;
  onClose: () => void;
  onReviewSaved?: (review: ReviewRecord) => void;
}

const CLS_COLOR: Record<string, string> = {
  approved: "var(--success)",
  suspicious: "var(--warning)",
  likely_personal: "var(--danger)",
};

const REVIEW_OPTIONS: { value: ReviewRecord["status"]; label: string; color: string; icon: string }[] = [
  { value: "approved",          label: "Approve",          color: "#10b981", icon: "✅" },
  { value: "rejected",          label: "Reject",           color: "#ef4444", icon: "❌" },
  { value: "needs_receipt",     label: "Needs Receipt",    color: "#818cf8", icon: "📋" },
  { value: "needs_explanation", label: "Needs Explanation",color: "#a78bfa", icon: "💬" },
  { value: "pending",           label: "Pending",          color: "#f59e0b", icon: "⏳" },
];

export default function TransactionDetailDrawer({ txId, onClose, onReviewSaved }: Props) {
  const [detail, setDetail] = useState<TransactionDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reviewStatus, setReviewStatus] = useState<ReviewRecord["status"]>("pending");
  const [reviewNote, setReviewNote] = useState("");
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!txId) { setDetail(null); return; }
    setLoading(true);
    setDetail(null);
    setSaveMsg(null);
    api.getTransactionDetail(txId)
      .then((d) => {
        setDetail(d);
        setReviewStatus(d.review?.status ?? "pending");
        setReviewNote(d.review?.reviewer_note ?? "");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [txId]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  async function handleSaveReview() {
    if (!txId) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const { review } = await api.submitReview(txId, {
        status: reviewStatus,
        reviewer_note: reviewNote.trim() || null,
      });
      setDetail((d) => d ? { ...d, review } : d);
      setSaveMsg("saved");
      onReviewSaved?.(review);
    } catch (err) {
      setSaveMsg("error");
    } finally {
      setSaving(false);
    }
  }

  if (!txId) return null;

  const tx = detail?.transaction;
  const policy = detail?.policy;
  const cls = policy?.classification ?? "";
  const risk = policy?.risk_score ?? 0;

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: "var(--z-drawer)" as React.CSSProperties["zIndex"],
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.6)",
          backdropFilter: "blur(2px)",
          animation: "fadeIn 0.2s ease both",
        }}
      />

      {/* Drawer panel */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: 520,
          maxWidth: "95vw",
          height: "100vh",
          background: "var(--surface)",
          borderLeft: "1px solid var(--border-strong)",
          boxShadow: "var(--shadow-drawer)",
          display: "flex",
          flexDirection: "column",
          animation: "slideInRight 0.28s cubic-bezier(0.25,0.46,0.45,0.94) both",
          overflowY: "auto",
        }}
      >
        {/* Drawer header */}
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            background: "var(--surface-2)",
            position: "sticky",
            top: 0,
            zIndex: 2,
            gap: 12,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {tx?.merchant_name ?? "Transaction Detail"}
            </div>
            {tx && (
              <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 3, display: "flex", alignItems: "center", gap: 8 }}>
                <span>
                  {tx.transaction_datetime
                    ? format(new Date(tx.transaction_datetime), "MMM d, yyyy · HH:mm")
                    : format(new Date(tx.created_at), "MMM d, yyyy · HH:mm")}
                </span>
                <span style={{ width: 3, height: 3, borderRadius: "50%", background: "var(--muted-2)" }} />
                <Badge value={tx.source} size="sm" />
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              background: "var(--surface-3)",
              border: "1px solid var(--border)",
              color: "var(--muted)",
              width: 30,
              height: 30,
              borderRadius: 8,
              cursor: "pointer",
              fontSize: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              transition: "all var(--t-fast)",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = "var(--surface-active)";
              (e.currentTarget as HTMLElement).style.color = "var(--text)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "var(--surface-3)";
              (e.currentTarget as HTMLElement).style.color = "var(--muted)";
            }}
          >
            ×
          </button>
        </div>

        {loading && (
          <div className="empty-state">
            <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
              {[1,2,3].map((i) => (
                <div key={i} className="skeleton" style={{ height: i === 1 ? 80 : 56, borderRadius: 10 }} />
              ))}
            </div>
          </div>
        )}

        {!loading && detail && (
          <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Amount + Classification */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {/* Amount */}
              <div
                style={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                  padding: "14px 16px",
                }}
              >
                <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                  Amount
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 24, color: "var(--text)" }}>
                  ${Number(tx?.amount).toFixed(2)}
                </div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>{tx?.currency}</div>
              </div>

              {/* Classification */}
              <div
                style={{
                  background: "var(--surface-2)",
                  border: `1px solid ${CLS_COLOR[cls] ? `${CLS_COLOR[cls]}40` : "var(--border)"}`,
                  borderRadius: "var(--radius)",
                  padding: "14px 16px",
                }}
              >
                <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                  Classification
                </div>
                <Badge value={cls || "approved"} size="md" />
                {policy && (
                  <div className="risk-bar-wrap" style={{ marginTop: 10 }}>
                    <div className="risk-bar-track" style={{ minWidth: 0, flex: 1 }}>
                      <div
                        className="risk-bar-fill"
                        style={{
                          width: `${risk}%`,
                          background: risk >= 55 ? "var(--danger)" : risk >= 25 ? "var(--warning)" : "var(--success)",
                        }}
                      />
                    </div>
                    <span className="risk-score-label">{risk}/100</span>
                  </div>
                )}
              </div>
            </div>

            {/* Policy violations */}
            {policy && (policy.reasons ?? []).length > 0 && (
              <Section title="Policy Violations" icon="⚑">
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {(policy.reasons as string[]).map((r, i) => (
                    <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <span
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: 4,
                          background: `${CLS_COLOR[cls] ?? "var(--warning)"}18`,
                          border: `1px solid ${CLS_COLOR[cls] ?? "var(--warning)"}30`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 9,
                          color: CLS_COLOR[cls] ?? "var(--warning)",
                          flexShrink: 0,
                          marginTop: 2,
                        }}
                      >
                        !
                      </span>
                      <span style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.5 }}>{r}</span>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Line items */}
            {detail.items.length > 0 && (
              <Section title={`Line Items (${detail.items.length})`} icon="☰">
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <tbody>
                    {detail.items.map((item) => (
                      <tr
                        key={item.id}
                        style={{ borderBottom: "1px solid var(--border-subtle)" }}
                      >
                        <td style={{ padding: "8px 0" }}>
                          <div style={{ fontWeight: 500, fontSize: 13 }}>{item.name ?? "—"}</div>
                          {item.description && (
                            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{item.description}</div>
                          )}
                          {item.seller_name && (
                            <div style={{ fontSize: 11, color: "var(--muted)" }}>via {item.seller_name}</div>
                          )}
                        </td>
                        <td style={{ padding: "8px 0", textAlign: "right", whiteSpace: "nowrap" }}>
                          {item.quantity && (
                            <span style={{ color: "var(--muted)", fontSize: 12 }}>×{item.quantity} </span>
                          )}
                          {item.unit_price != null && (
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>
                              ${Number(item.unit_price).toFixed(2)}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Section>
            )}

            {/* Alert history */}
            {detail.alerts.length > 0 && (
              <Section title="Alert History" icon="🔔">
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {detail.alerts.map((alert) => (
                    <div
                      key={alert.id}
                      style={{
                        display: "flex",
                        gap: 10,
                        alignItems: "center",
                        padding: "8px 10px",
                        background: "var(--surface-3)",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--border-subtle)",
                      }}
                    >
                      <span style={{ fontSize: 14 }}>
                        {alert.status === "sent" ? "🔔" : alert.status === "failed" ? "❌" : "—"}
                      </span>
                      <div style={{ flex: 1, fontSize: 12 }}>
                        <span style={{ fontWeight: 600, color: "var(--text-2)" }}>
                          {alert.channel ?? "photon"}
                        </span>
                        <Badge value={alert.status} size="sm" />
                        {alert.sent_at && (
                          <span style={{ color: "var(--muted)", marginLeft: 8 }}>
                            {format(new Date(alert.sent_at), "MMM d · HH:mm")}
                          </span>
                        )}
                      </div>
                      {alert.error_message && (
                        <span style={{ color: "var(--danger)", fontSize: 11 }}>{alert.error_message}</span>
                      )}
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Review decision */}
            <Section title="Review Decision" icon="◉">
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {/* Status options */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {REVIEW_OPTIONS.map((opt) => {
                    const isActive = reviewStatus === opt.value;
                    return (
                      <button
                        key={opt.value}
                        onClick={() => setReviewStatus(opt.value)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 5,
                          padding: "6px 12px",
                          borderRadius: 20,
                          fontSize: 12,
                          fontWeight: isActive ? 600 : 400,
                          cursor: "pointer",
                          border: isActive
                            ? `1px solid ${opt.color}50`
                            : "1px solid var(--border)",
                          background: isActive
                            ? `${opt.color}12`
                            : "var(--surface-2)",
                          color: isActive ? opt.color : "var(--muted)",
                          transition: "all var(--t-fast)",
                        }}
                      >
                        <span style={{ fontSize: 11 }}>{opt.icon}</span>
                        {opt.label}
                      </button>
                    );
                  })}
                </div>

                {/* Reviewer note */}
                <textarea
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  placeholder="Add a reviewer note (optional)…"
                  rows={3}
                  style={{
                    padding: "10px 12px",
                    borderRadius: "var(--radius-sm)",
                    fontSize: 13,
                    border: "1px solid var(--border-strong)",
                    background: "var(--surface-2)",
                    color: "var(--text)",
                    resize: "vertical",
                    fontFamily: "var(--font)",
                    lineHeight: 1.6,
                    width: "100%",
                  }}
                />

                {/* Last reviewed info */}
                {detail.review?.reviewed_at && (
                  <div style={{ fontSize: 11, color: "var(--muted)", display: "flex", alignItems: "center", gap: 4 }}>
                    <span>Last reviewed</span>
                    <strong>{format(new Date(detail.review.reviewed_at), "MMM d, yyyy 'at' HH:mm")}</strong>
                    {detail.review.reviewed_by && (
                      <><span>by</span><strong>{detail.review.reviewed_by}</strong></>
                    )}
                  </div>
                )}

                {/* Save button */}
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <button
                    onClick={handleSaveReview}
                    disabled={saving}
                    className="btn btn-primary"
                    style={{ fontSize: 13 }}
                  >
                    {saving ? "Saving…" : "Save Review"}
                  </button>
                  {saveMsg === "saved" && (
                    <span style={{ fontSize: 12, color: "var(--success)", display: "flex", alignItems: "center", gap: 4 }}>
                      ✓ Review saved
                    </span>
                  )}
                  {saveMsg === "error" && (
                    <span style={{ fontSize: 12, color: "var(--danger)" }}>Save failed — try again</span>
                  )}
                </div>
              </div>
            </Section>

          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "11px 16px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          gap: 7,
          background: "var(--surface-3)",
        }}
      >
        <span style={{ fontSize: 12, opacity: 0.7 }}>{icon}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
          {title}
        </span>
      </div>
      <div style={{ padding: "14px 16px" }}>{children}</div>
    </div>
  );
}
