import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { api } from "../lib/api";
import StatCard from "../components/StatCard";
import Badge from "../components/Badge";
import TransactionDetail from "../components/TransactionDetail";
import { formatDistanceToNow } from "date-fns";

interface RecentRow {
  id: string;
  merchant_name: string | null;
  amount: number;
  created_at: string;
  policy_results: { classification: string; risk_score: number } | null;
  alerts: { status: string } | null;
}

export default function Dashboard() {
  const [counts, setCounts] = useState({
    accounts: 0,
    transactions: 0,
    flagged: 0,
    alerts: 0,
    pendingReview: 0,
  });
  const [recent, setRecent] = useState<RecentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [acctRes, txRes, flaggedRes, alertRes, recentRes, reviewCountsRes] =
          await Promise.all([
            supabase.from("linked_accounts").select("id", { count: "exact", head: true }),
            supabase.from("transactions").select("id", { count: "exact", head: true }),
            supabase
              .from("policy_results")
              .select("id", { count: "exact", head: true })
              .in("classification", ["suspicious", "likely_personal"]),
            supabase
              .from("alerts")
              .select("id", { count: "exact", head: true })
              .eq("status", "sent"),
            supabase
              .from("transactions")
              .select(
                "id, merchant_name, amount, created_at, policy_results(classification, risk_score), alerts(status)"
              )
              .order("created_at", { ascending: false })
              .limit(10),
            api.getReviewCounts().catch(() => ({ total_flagged: 0, pending: 0, reviewed: 0 })),
          ]);

        setCounts({
          accounts: acctRes.count ?? 0,
          transactions: txRes.count ?? 0,
          flagged: flaggedRes.count ?? 0,
          alerts: alertRes.count ?? 0,
          pendingReview: reviewCountsRes.pending ?? 0,
        });

        setRecent((recentRes.data ?? []) as unknown as RecentRow[]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const flaggedPct = counts.transactions > 0
    ? Math.round((counts.flagged / counts.transactions) * 100)
    : 0;

  return (
    <div className="animate-in">
      {/* Page header */}
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Real-time expense monitoring overview</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              background: "var(--success-bg)",
              border: "1px solid var(--success-border)",
              borderRadius: 20,
              fontSize: 11,
              color: "var(--success)",
              fontWeight: 600,
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--success)", boxShadow: "0 0 6px var(--success)" }} />
            Live monitoring
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="stats-grid">
        <StatCard
          label="Linked Accounts"
          value={counts.accounts}
          loading={loading}
          icon="⊞"
          color="var(--primary-light)"
        />
        <StatCard
          label="Transactions"
          value={counts.transactions}
          loading={loading}
          icon="⇄"
          color="var(--info)"
        />
        <StatCard
          label="Flagged"
          value={counts.flagged}
          loading={loading}
          icon="⚠"
          color="var(--warning)"
          trend={counts.transactions > 0 ? `${flaggedPct}% of total` : undefined}
        />
        <StatCard
          label="Alerts Sent"
          value={counts.alerts}
          loading={loading}
          icon="🔔"
          color="var(--success)"
        />
        <StatCard
          label="Pending Review"
          value={counts.pendingReview}
          loading={loading}
          icon="◉"
          color={counts.pendingReview > 0 ? "var(--danger)" : "var(--success)"}
          trend={counts.pendingReview > 0 ? "Action required" : "All caught up"}
          trendUp={counts.pendingReview > 0 ? false : undefined}
        />
      </div>

      {/* Recent transactions */}
      <div className="card" style={{ overflow: "hidden" }}>
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Recent Transactions</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 1 }}>
              Click any row to view full details
            </div>
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--muted)",
              background: "var(--surface-2)",
              padding: "4px 10px",
              borderRadius: 20,
              border: "1px solid var(--border)",
            }}
          >
            Last {recent.length} transactions
          </div>
        </div>

        <table className="data-table">
          <thead>
            <tr>
              {["Merchant", "Amount", "Classification", "Risk", "Alert", "Time"].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6}>
                  <div className="empty-state" style={{ padding: "40px 32px" }}>
                    <div className="skeleton" style={{ width: 120, height: 14, marginBottom: 8 }} />
                    <div className="skeleton" style={{ width: 80, height: 12 }} />
                  </div>
                </td>
              </tr>
            )}
            {!loading && recent.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <div className="empty-state">
                    <div className="empty-state-icon">📭</div>
                    <div className="empty-state-title">No transactions yet</div>
                    <div className="empty-state-desc">
                      Use the Simulate Expense page to create your first transaction and see it appear here.
                    </div>
                  </div>
                </td>
              </tr>
            )}
            {recent.map((row) => {
              const policy = Array.isArray(row.policy_results)
                ? row.policy_results[0]
                : row.policy_results;
              const alert = Array.isArray(row.alerts)
                ? row.alerts[0]
                : row.alerts;
              const risk = policy?.risk_score ?? 0;
              return (
                <tr
                  key={row.id}
                  className="clickable"
                  onClick={() => setSelectedTxId(row.id)}
                >
                  <td>
                    <div style={{ fontWeight: 500, color: "var(--text)", fontSize: 13 }}>
                      {row.merchant_name ?? (
                        <span style={{ color: "var(--muted)", fontStyle: "italic" }}>Unknown Merchant</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <span style={{ fontFamily: "var(--font-mono)", fontWeight: 500, color: "var(--text)" }}>
                      ${Number(row.amount).toFixed(2)}
                    </span>
                  </td>
                  <td>
                    {policy ? <Badge value={policy.classification} /> : <span style={{ color: "var(--muted-2)" }}>—</span>}
                  </td>
                  <td>
                    {policy ? (
                      <div className="risk-bar-wrap">
                        <div className="risk-bar-track">
                          <div
                            className="risk-bar-fill"
                            style={{
                              width: `${risk}%`,
                              background: risk >= 55 ? "var(--danger)" : risk >= 25 ? "var(--warning)" : "var(--success)",
                            }}
                          />
                        </div>
                        <span className="risk-score-label">{risk}</span>
                      </div>
                    ) : (
                      <span style={{ color: "var(--muted-2)" }}>—</span>
                    )}
                  </td>
                  <td>
                    {alert ? <Badge value={alert.status} /> : <span style={{ color: "var(--muted-2)" }}>—</span>}
                  </td>
                  <td style={{ color: "var(--muted)", fontSize: 12 }}>
                    {formatDistanceToNow(new Date(row.created_at), { addSuffix: true })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <TransactionDetail
        txId={selectedTxId}
        onClose={() => setSelectedTxId(null)}
      />
    </div>
  );
}
