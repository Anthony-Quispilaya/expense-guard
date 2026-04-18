import React, { useEffect, useState } from "react";
import { api, type PolicyConfig } from "../lib/api";

const MIGRATION_SQL = `CREATE TABLE IF NOT EXISTS reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','needs_receipt','needs_explanation')),
  reviewer_note TEXT,
  reviewed_by TEXT NOT NULL DEFAULT 'reviewer',
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (transaction_id)
);
CREATE INDEX IF NOT EXISTS idx_reviews_transaction_id ON reviews (transaction_id);
CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews (status);
CREATE TABLE IF NOT EXISTS policy_config (
  id INTEGER DEFAULT 1 PRIMARY KEY CHECK (id = 1),
  high_amount_threshold NUMERIC NOT NULL DEFAULT 500,
  personal_keywords TEXT[] NOT NULL DEFAULT ARRAY['alcohol','wine','beer','gaming','casino','spa ','massage','luxury','tobacco'],
  suspicious_merchant_patterns TEXT[] NOT NULL DEFAULT ARRAY['unknown','misc','generic'],
  unusual_hour_start INTEGER NOT NULL DEFAULT 0,
  unusual_hour_end INTEGER NOT NULL DEFAULT 5,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO policy_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;`;

export default function PolicySettings() {
  const [config, setConfig] = useState<PolicyConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [migrationNeeded, setMigrationNeeded] = useState(false);
  const [copied, setCopied] = useState(false);

  const [threshold, setThreshold] = useState(500);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [kwInput, setKwInput] = useState("");
  const [patterns, setPatterns] = useState<string[]>([]);
  const [patInput, setPatInput] = useState("");
  const [hourStart, setHourStart] = useState(0);
  const [hourEnd, setHourEnd] = useState(5);

  useEffect(() => {
    api.getPolicyConfig()
      .then(({ config: c }) => {
        setConfig(c);
        setThreshold(c.high_amount_threshold);
        setKeywords(c.personal_keywords);
        setPatterns(c.suspicious_merchant_patterns);
        setHourStart(c.unusual_hour_start);
        setHourEnd(c.unusual_hour_end);
        if (!c.updated_at) setMigrationNeeded(true);
      })
      .catch(() => setMigrationNeeded(true))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaveMsg(null);
    try {
      const { config: saved } = await api.updatePolicyConfig({
        high_amount_threshold: threshold,
        personal_keywords: keywords,
        suspicious_merchant_patterns: patterns,
        unusual_hour_start: hourStart,
        unusual_hour_end: hourEnd,
      });
      setConfig(saved);
      setSaveMsg("saved");
      setMigrationNeeded(false);
    } catch {
      setSaveMsg("error");
      setMigrationNeeded(true);
    } finally {
      setSaving(false);
    }
  }

  function addKeyword() {
    const kw = kwInput.trim();
    if (kw && !keywords.includes(kw)) setKeywords((p) => [...p, kw]);
    setKwInput("");
  }
  function addPattern() {
    const p = patInput.trim();
    if (p && !patterns.includes(p)) setPatterns((p2) => [...p2, p]);
    setPatInput("");
  }
  function copySQL() {
    navigator.clipboard.writeText(MIGRATION_SQL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="animate-in">
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Policy Settings</h1>
          <p className="page-subtitle">
            Configure expense classification rules — changes apply to new transactions immediately
          </p>
        </div>
        {config?.updated_at && (
          <div style={{ fontSize: 11, color: "var(--muted)", background: "var(--surface-2)", padding: "6px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
            Updated {new Date(config.updated_at).toLocaleString()}
          </div>
        )}
      </div>

      {migrationNeeded && (
        <div
          style={{
            background: "var(--warning-bg)",
            border: "1px solid var(--warning-border)",
            borderRadius: "var(--radius)",
            padding: "16px 20px",
            marginBottom: 24,
          }}
        >
          <div style={{ fontWeight: 700, color: "var(--warning)", fontSize: 13, marginBottom: 6 }}>
            ⚠️ Database migration required
          </div>
          <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 12 }}>
            Run this SQL in your{" "}
            <a href="https://supabase.com/dashboard/project/esruzpcvkqbexgaznpvi/sql" target="_blank" rel="noreferrer">
              Supabase SQL Editor
            </a>{" "}
            to enable Policy Settings and Review Queue:
          </div>
          <pre style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            padding: "12px 14px",
            fontSize: 10,
            overflowX: "auto",
            maxHeight: 140,
            color: "var(--muted)",
            marginBottom: 12,
            lineHeight: 1.7,
          }}>
            {MIGRATION_SQL}
          </pre>
          <button
            onClick={copySQL}
            className="btn btn-ghost"
            style={{ fontSize: 12 }}
          >
            {copied ? "✓ Copied!" : "Copy SQL"}
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {[1,2,3].map((i) => (
            <div key={i} className="skeleton" style={{ height: 120, borderRadius: 14 }} />
          ))}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Row 1: threshold + hours */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <SettingCard
              title="High Amount Threshold"
              description="Transactions above this amount receive a +25 risk score."
              icon="💰"
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: "var(--muted)", fontSize: 16, fontFamily: "var(--font-mono)" }}>$</span>
                <input
                  type="number"
                  min={1}
                  max={1000000}
                  value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value))}
                  style={{ width: 120, fontFamily: "var(--font-mono)", fontWeight: 600 }}
                />
                <span style={{ color: "var(--muted)", fontSize: 12 }}>USD</span>
              </div>
            </SettingCard>

            <SettingCard
              title="Unusual Hours Window"
              description="Transactions in this time window receive a +20 risk score."
              icon="🕐"
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                  <span style={{ color: "var(--muted)", fontSize: 12 }}>From</span>
                  <input
                    type="number" min={0} max={23} value={hourStart}
                    onChange={(e) => setHourStart(Number(e.target.value))}
                    style={{ width: 56, textAlign: "center", fontFamily: "var(--font-mono)" }}
                  />
                  <span style={{ color: "var(--muted)", fontSize: 12 }}>:00</span>
                </label>
                <span style={{ color: "var(--muted)" }}>→</span>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                  <input
                    type="number" min={0} max={23} value={hourEnd}
                    onChange={(e) => setHourEnd(Number(e.target.value))}
                    style={{ width: 56, textAlign: "center", fontFamily: "var(--font-mono)" }}
                  />
                  <span style={{ color: "var(--muted)", fontSize: 12 }}>:00</span>
                </label>
              </div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 8 }}>
                Currently: {String(hourStart).padStart(2,"0")}:00 – {String(hourEnd).padStart(2,"0")}:00
              </div>
            </SettingCard>
          </div>

          {/* Personal keywords */}
          <SettingCard
            title="Personal / Lifestyle Keywords"
            description="Merchants or items matching any keyword are classified as 'Likely Personal' with +55 risk score."
            icon="🚫"
          >
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12, minHeight: 28 }}>
              {keywords.map((kw) => (
                <span
                  key={kw}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    background: "rgba(239,68,68,0.08)",
                    border: "1px solid rgba(239,68,68,0.22)",
                    color: "#ef4444",
                    borderRadius: 20,
                    padding: "3px 10px",
                    fontSize: 12,
                  }}
                >
                  {kw}
                  <button
                    onClick={() => setKeywords((p) => p.filter((k) => k !== kw))}
                    style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 13, lineHeight: 1, padding: 0 }}
                  >×</button>
                </span>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={kwInput}
                onChange={(e) => setKwInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addKeyword()}
                placeholder="Add keyword and press Enter…"
                style={{ flex: 1 }}
              />
              <button onClick={addKeyword} className="btn btn-ghost" style={{ fontSize: 12 }}>
                + Add
              </button>
            </div>
          </SettingCard>

          {/* Suspicious patterns */}
          <SettingCard
            title="Suspicious Merchant Patterns"
            description="Merchants matching these patterns with no item detail are classified as 'Suspicious' with +35 risk score."
            icon="⚠"
          >
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12, minHeight: 28 }}>
              {patterns.map((p) => (
                <span
                  key={p}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    background: "rgba(245,158,11,0.08)",
                    border: "1px solid rgba(245,158,11,0.22)",
                    color: "#f59e0b",
                    borderRadius: 20,
                    padding: "3px 10px",
                    fontSize: 12,
                  }}
                >
                  {p}
                  <button
                    onClick={() => setPatterns((prev) => prev.filter((x) => x !== p))}
                    style={{ background: "none", border: "none", color: "#f59e0b", cursor: "pointer", fontSize: 13, lineHeight: 1, padding: 0 }}
                  >×</button>
                </span>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={patInput}
                onChange={(e) => setPatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addPattern()}
                placeholder="Add pattern and press Enter…"
                style={{ flex: 1 }}
              />
              <button onClick={addPattern} className="btn btn-ghost" style={{ fontSize: 12 }}>
                + Add
              </button>
            </div>
          </SettingCard>

          {/* Save */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, paddingTop: 4 }}>
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn btn-primary"
              style={{ padding: "10px 28px", fontSize: 14 }}
            >
              {saving ? "Saving…" : "Save Policy Settings"}
            </button>
            {saveMsg === "saved" && (
              <span style={{ fontSize: 13, color: "var(--success)", display: "flex", alignItems: "center", gap: 5 }}>
                ✓ Settings saved — new transactions use these rules immediately
              </span>
            )}
            {saveMsg === "error" && (
              <span style={{ fontSize: 13, color: "var(--danger)" }}>
                Save failed — run the migration SQL above first
              </span>
            )}
          </div>

        </div>
      )}
    </div>
  );
}

function SettingCard({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        padding: "20px 22px",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 16 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: "var(--surface-3)",
            border: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 15,
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>{title}</div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2, lineHeight: 1.5 }}>{description}</div>
        </div>
      </div>
      {children}
    </div>
  );
}
