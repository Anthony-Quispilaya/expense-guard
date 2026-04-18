import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import Badge from "../components/Badge";
import TransactionDetail from "../components/TransactionDetail";
import { format } from "date-fns";

interface TxRow {
  id: string;
  merchant_name: string | null;
  amount: number;
  currency: string;
  transaction_datetime: string | null;
  source: string;
  created_at: string;
  policy_results: Array<{ classification: string; risk_score: number; reasons: string[] }> | null;
  alerts: Array<{ status: string }> | null;
}

export default function Transactions() {
  const [rows, setRows] = useState<TxRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data, error } = await supabase
        .from("transactions")
        .select("id, merchant_name, amount, currency, transaction_datetime, source, created_at, policy_results(classification, risk_score, reasons), alerts(status)")
        .order("created_at", { ascending: false })
        .limit(100);
      if (!error) setRows((data ?? []) as unknown as TxRow[]);
      setLoading(false);
    }
    load();
  }, []);

  return (
    <div className="animate-in">
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Transactions</h1>
          <p className="page-subtitle">All ingested transactions with policy evaluation results</p>
        </div>
        <div
          style={{
            fontSize: 12,
            color: "var(--muted)",
            background: "var(--surface-2)",
            padding: "6px 12px",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border)",
          }}
        >
          {loading ? "Loading…" : `${rows.length} transactions`}
        </div>
      </div>

      <div className="card" style={{ overflow: "auto" }}>
        <table className="data-table" style={{ minWidth: 860 }}>
          <thead>
            <tr>
              {["Date", "Merchant", "Amount", "Source", "Classification", "Risk", "Top Reason", "Alert"].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={8}>
                  <div className="empty-state" style={{ padding: "40px 32px" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%" }}>
                      {[1,2,3].map((i) => (
                        <div key={i} className="skeleton" style={{ height: 44, borderRadius: 8 }} />
                      ))}
                    </div>
                  </div>
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={8}>
                  <div className="empty-state">
                    <div className="empty-state-icon">📭</div>
                    <div className="empty-state-title">No transactions yet</div>
                    <div className="empty-state-desc">
                      Simulate an expense or link a Knot account to start seeing transactions here.
                    </div>
                  </div>
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const policy = Array.isArray(row.policy_results) ? row.policy_results[0] : null;
              const alert = Array.isArray(row.alerts) ? row.alerts[0] : null;
              const reasons = policy?.reasons ?? [];
              const risk = policy?.risk_score ?? 0;
              return (
                <tr key={row.id} className="clickable" onClick={() => setSelectedTxId(row.id)}>
                  <td style={{ whiteSpace: "nowrap", color: "var(--muted)", fontSize: 12 }}>
                    {row.transaction_datetime
                      ? format(new Date(row.transaction_datetime), "MMM d · HH:mm")
                      : format(new Date(row.created_at), "MMM d · HH:mm")}
                  </td>
                  <td>
                    <div style={{ fontWeight: 500, color: "var(--text)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {row.merchant_name ?? (
                        <span style={{ color: "var(--muted)", fontStyle: "italic" }}>Unknown</span>
                      )}
                    </div>
                  </td>
                  <td style={{ fontFamily: "var(--font-mono)", fontWeight: 500, whiteSpace: "nowrap" }}>
                    ${Number(row.amount).toFixed(2)}
                    <span style={{ color: "var(--muted-2)", fontSize: 11, marginLeft: 4 }}>{row.currency}</span>
                  </td>
                  <td><Badge value={row.source} /></td>
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
                  <td style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12, color: "var(--muted)" }}>
                    {reasons[0] ?? "—"}
                  </td>
                  <td>
                    {alert ? <Badge value={alert.status} /> : <span style={{ color: "var(--muted-2)" }}>—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <TransactionDetail txId={selectedTxId} onClose={() => setSelectedTxId(null)} />
    </div>
  );
}
