import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import Badge from "../components/Badge";
import { formatDistanceToNow } from "date-fns";

interface AccountRow {
  id: string;
  merchant_name: string | null;
  merchant_id: string | null;
  provider: string;
  status: string;
  knot_account_id: string | null;
  last_synced_at: string | null;
  created_at: string;
}

export default function LinkedAccounts() {
  const [rows, setRows] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data, error } = await supabase
        .from("linked_accounts")
        .select("*")
        .order("created_at", { ascending: false });
      if (!error) setRows((data ?? []) as AccountRow[]);
      setLoading(false);
    }
    load();
  }, []);

  return (
    <div className="animate-in">
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Linked Accounts</h1>
          <p className="page-subtitle">Merchant accounts connected through Knot</p>
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
          {loading ? "Loading…" : `${rows.length} accounts`}
        </div>
      </div>

      <div className="card" style={{ overflow: "auto" }}>
        <table className="data-table">
          <thead>
            <tr>
              {["Merchant", "Merchant ID", "Provider", "Status", "Last Synced", "Linked"].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6}>
                  <div className="empty-state" style={{ padding: "40px 32px" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%" }}>
                      {[1,2].map((i) => (
                        <div key={i} className="skeleton" style={{ height: 44, borderRadius: 8 }} />
                      ))}
                    </div>
                  </div>
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <div className="empty-state">
                    <div className="empty-state-icon">🔗</div>
                    <div className="empty-state-title">No linked accounts</div>
                    <div className="empty-state-desc">
                      Connect a merchant account via Knot to start monitoring transactions automatically.
                    </div>
                  </div>
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <div style={{ fontWeight: 500, color: "var(--text)" }}>
                    {row.merchant_name ?? <span style={{ color: "var(--muted)", fontStyle: "italic" }}>—</span>}
                  </div>
                </td>
                <td style={{ color: "var(--muted)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
                  {row.merchant_id ?? "—"}
                </td>
                <td><Badge value={row.provider} /></td>
                <td><Badge value={row.status} /></td>
                <td style={{ color: "var(--muted)", fontSize: 12 }}>
                  {row.last_synced_at
                    ? formatDistanceToNow(new Date(row.last_synced_at), { addSuffix: true })
                    : <span style={{ color: "var(--muted-2)" }}>Never</span>}
                </td>
                <td style={{ color: "var(--muted)", fontSize: 12 }}>
                  {formatDistanceToNow(new Date(row.created_at), { addSuffix: true })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
