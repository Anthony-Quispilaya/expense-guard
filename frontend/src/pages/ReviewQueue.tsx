import React, { useEffect, useState, useCallback } from "react";
import { formatDistanceToNow } from "date-fns";
import { api, type ReviewQueueItem, type ReviewRecord } from "../lib/api";
import TransactionDetail from "../components/TransactionDetail";
import Badge from "../components/Badge";

const TABS = [
  { key: "pending",       label: "Needs Review",  color: "var(--warning)" },
  { key: "approved",      label: "Approved",      color: "var(--success)" },
  { key: "rejected",      label: "Rejected",      color: "var(--danger)"  },
  { key: "needs_receipt", label: "Needs Receipt", color: "var(--primary-light)" },
  { key: "",              label: "All Flagged",   color: "var(--muted)"   },
] as const;

const REVIEW_STYLES: Record<string, { color: string; label: string }> = {
  pending:           { color: "#f59e0b", label: "Pending" },
  approved:          { color: "#10b981", label: "Approved" },
  rejected:          { color: "#ef4444", label: "Rejected" },
  needs_receipt:     { color: "#818cf8", label: "Needs Receipt" },
  needs_explanation: { color: "#a78bfa", label: "Needs Explanation" },
};

export default function ReviewQueue() {
  const [tab, setTab] = useState<string>("pending");
  const [items, setItems] = useState<ReviewQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null);
  const [counts, setCounts] = useState({ total_flagged: 0, pending: 0, reviewed: 0 });
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [queueRes, countsRes] = await Promise.all([
        api.listReviews(tab || undefined),
        api.getReviewCounts(),
      ]);
      setItems(queueRes.items);
      setCounts(countsRes);
    } catch (err) {
      console.error("ReviewQueue load error", err);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  function handleReviewSaved(review: ReviewRecord) {
    setItems((prev) =>
      prev.map((item) =>
        item.transaction_id === review.transaction_id
          ? { ...item, review }
          : item
      )
    );
    load();
  }

  async function quickReview(txId: string, status: ReviewRecord["status"], e: React.MouseEvent) {
    e.stopPropagation();
    setActionLoading(txId + status);
    try {
      await api.submitReview(txId, { status });
      load();
    } catch (err) {
      console.error("Quick review failed", err);
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="animate-in">
      {/* Page header */}
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Review Queue</h1>
          <p className="page-subtitle">Flagged expenses awaiting a review decision</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <StatPill icon="⚑" label="Flagged" value={counts.total_flagged} color="var(--warning)" />
          <StatPill icon="⏳" label="Pending" value={counts.pending} color="var(--danger)" />
          <StatPill icon="✓" label="Reviewed" value={counts.reviewed} color="var(--success)" />
        </div>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: 2,
          marginBottom: 20,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          padding: 4,
          width: "fit-content",
        }}
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: "6px 14px",
              borderRadius: 7,
              border: "none",
              fontSize: 12,
              fontWeight: tab === t.key ? 600 : 400,
              background: tab === t.key ? "var(--surface-3)" : "transparent",
              color: tab === t.key ? t.color : "var(--muted)",
              cursor: "pointer",
              transition: "all var(--t-fast)",
              boxShadow: tab === t.key ? "var(--shadow-xs)" : "none",
              whiteSpace: "nowrap",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="card" style={{ overflow: "hidden" }}>
        {loading ? (
          <div className="empty-state" style={{ padding: "48px 32px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%", maxWidth: 400 }}>
              {[1,2,3].map((i) => (
                <div key={i} className="skeleton" style={{ height: 48, borderRadius: 8 }} />
              ))}
            </div>
          </div>
        ) : items.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              {tab === "pending" ? "🎉" : tab === "approved" ? "✅" : "📋"}
            </div>
            <div className="empty-state-title">
              {tab === "pending"
                ? "Review queue is clear"
                : `No ${tab.replace("_", " ")} items`}
            </div>
            <div className="empty-state-desc">
              {tab === "pending"
                ? "All flagged transactions have been reviewed. Great work!"
                : "Items will appear here once transactions are reviewed."}
            </div>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                {["When", "Merchant", "Amount", "Classification", "Risk", "Top Reason", "Status", "Actions"].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const tx = item.transaction;
                const reviewStatus = item.review?.status ?? "pending";
                const reviewStyle = REVIEW_STYLES[reviewStatus];
                const risk = item.risk_score;
                return (
                  <tr
                    key={item.transaction_id}
                    className="clickable"
                    onClick={() => setSelectedTxId(item.transaction_id)}
                  >
                    <td style={{ color: "var(--muted)", fontSize: 12, whiteSpace: "nowrap" }}>
                      {tx
                        ? formatDistanceToNow(new Date(tx.created_at), { addSuffix: true })
                        : "—"}
                    </td>
                    <td>
                      <div style={{ fontWeight: 500, color: "var(--text)", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {tx?.merchant_name ?? (
                          <span style={{ color: "var(--muted)", fontStyle: "italic" }}>Unknown</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span style={{ fontFamily: "var(--font-mono)", fontWeight: 500 }}>
                        ${Number(tx?.amount ?? 0).toFixed(2)}
                      </span>
                    </td>
                    <td>
                      <Badge value={item.classification} />
                    </td>
                    <td>
                      <div className="risk-bar-wrap">
                        <div className="risk-bar-track">
                          <div
                            className="risk-bar-fill"
                            style={{
                              width: `${risk}%`,
                              background: risk >= 55 ? "var(--danger)" : "var(--warning)",
                            }}
                          />
                        </div>
                        <span className="risk-score-label">{risk}</span>
                      </div>
                    </td>
                    <td style={{
                      maxWidth: 220,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      fontSize: 12,
                      color: "var(--muted)",
                    }}>
                      {(item.reasons ?? [])[0] ?? "—"}
                    </td>
                    <td>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          fontSize: 11,
                          fontWeight: 600,
                          padding: "3px 9px",
                          borderRadius: 20,
                          background: `${reviewStyle?.color ?? "var(--muted)"}12`,
                          color: reviewStyle?.color ?? "var(--muted)",
                          border: `1px solid ${reviewStyle?.color ?? "var(--muted)"}28`,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {reviewStyle?.label ?? reviewStatus}
                      </span>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: "flex", gap: 4 }}>
                        <QuickBtn
                          emoji="✅"
                          label="Approve"
                          active={reviewStatus === "approved"}
                          activeColor="#10b981"
                          loading={actionLoading === item.transaction_id + "approved"}
                          onClick={(e) => quickReview(item.transaction_id, "approved", e)}
                        />
                        <QuickBtn
                          emoji="❌"
                          label="Reject"
                          active={reviewStatus === "rejected"}
                          activeColor="#ef4444"
                          loading={actionLoading === item.transaction_id + "rejected"}
                          onClick={(e) => quickReview(item.transaction_id, "rejected", e)}
                        />
                        <QuickBtn
                          emoji="📋"
                          label="Needs Receipt"
                          active={reviewStatus === "needs_receipt"}
                          activeColor="#818cf8"
                          loading={actionLoading === item.transaction_id + "needs_receipt"}
                          onClick={(e) => quickReview(item.transaction_id, "needs_receipt", e)}
                        />
                        <QuickBtn
                          emoji="🔍"
                          label="View details"
                          active={false}
                          activeColor="var(--muted)"
                          loading={false}
                          onClick={(e) => { e.stopPropagation(); setSelectedTxId(item.transaction_id); }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <TransactionDetail
        txId={selectedTxId}
        onClose={() => setSelectedTxId(null)}
        onReviewSaved={handleReviewSaved}
      />
    </div>
  );
}

function StatPill({
  icon,
  label,
  value,
  color,
}: {
  icon: string;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        padding: "8px 14px",
        display: "flex",
        alignItems: "center",
        gap: 8,
        boxShadow: "var(--shadow-xs)",
      }}
    >
      <span style={{ fontSize: 13 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
        <div style={{ fontSize: 16, fontWeight: 700, color, lineHeight: 1.2 }}>{value}</div>
      </div>
    </div>
  );
}

function QuickBtn({
  emoji,
  label,
  active,
  activeColor,
  loading,
  onClick,
}: {
  emoji: string;
  label: string;
  active: boolean;
  activeColor: string;
  loading: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      title={label}
      onClick={onClick}
      disabled={loading}
      style={{
        width: 28,
        height: 28,
        borderRadius: 7,
        border: active
          ? `1px solid ${activeColor}40`
          : "1px solid var(--border)",
        background: active
          ? `${activeColor}15`
          : "var(--surface-2)",
        cursor: loading ? "not-allowed" : "pointer",
        fontSize: 12,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: loading ? 0.6 : 1,
        transition: "all var(--t-fast)",
      }}
      onMouseEnter={(e) => {
        if (!active && !loading) {
          (e.currentTarget as HTMLElement).style.background = "var(--surface-3)";
          (e.currentTarget as HTMLElement).style.borderColor = "var(--border-strong)";
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          (e.currentTarget as HTMLElement).style.background = "var(--surface-2)";
          (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
        }
      }}
    >
      {loading ? "…" : emoji}
    </button>
  );
}
