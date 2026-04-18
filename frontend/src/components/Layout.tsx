import React, { ReactNode, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { api } from "../lib/api";

interface NavItem {
  path: string;
  label: string;
  icon: string;
  badge?: number;
}

const NAV_SECTIONS = [
  {
    label: "Overview",
    items: [
      { path: "/", label: "Dashboard", icon: "▦" },
      { path: "/review", label: "Review Queue", icon: "◉" },
    ],
  },
  {
    label: "Operations",
    items: [
      { path: "/simulate", label: "Simulate Expense", icon: "⚡" },
      { path: "/transactions", label: "Transactions", icon: "⇄" },
      { path: "/accounts", label: "Linked Accounts", icon: "⊞" },
      { path: "/link", label: "Link Account", icon: "＋" },
    ],
  },
  {
    label: "Admin",
    items: [
      { path: "/policy", label: "Policy Settings", icon: "◈" },
      { path: "/demo", label: "Dev Tools", icon: "⚙" },
    ],
  },
];

export default function Layout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    api.getReviewCounts().then((c) => setPendingCount(c.pending)).catch(() => {});
    const timer = setInterval(() => {
      api.getReviewCounts().then((c) => setPendingCount(c.pending)).catch(() => {});
    }, 30_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {/* ── Sidebar ────────────────────────────────────────────────────────── */}
      <aside
        style={{
          width: 232,
          background: "var(--surface)",
          borderRight: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          position: "fixed",
          top: 0,
          left: 0,
          bottom: 0,
          zIndex: "var(--z-sticky)" as React.CSSProperties["zIndex"],
          boxShadow: "2px 0 20px rgba(0,0,0,0.3)",
        }}
      >
        {/* Brand */}
        <div
          style={{
            padding: "20px 20px 18px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 9,
                background: "var(--primary-gradient)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 16,
                boxShadow: "0 4px 12px rgba(99,102,241,0.35)",
                flexShrink: 0,
              }}
            >
              💳
            </div>
            <div>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  letterSpacing: -0.2,
                  color: "var(--text)",
                  lineHeight: 1.2,
                }}
              >
                ExpenseGuard
              </div>
              <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 1 }}>
                Policy Platform v1.0
              </div>
            </div>
          </div>
        </div>

        {/* Nav sections */}
        <nav style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
          {NAV_SECTIONS.map((section) => (
            <div key={section.label}>
              <div className="section-label">{section.label}</div>
              {section.items.map((item) => {
                const isActive = pathname === item.path;
                const badge =
                  item.path === "/review" && pendingCount > 0
                    ? pendingCount
                    : undefined;

                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 9,
                      padding: "9px 20px",
                      color: isActive ? "var(--primary-light)" : "var(--text-3)",
                      background: isActive ? "var(--primary-subtle)" : "transparent",
                      borderLeft: `2px solid ${isActive ? "var(--primary)" : "transparent"}`,
                      textDecoration: "none",
                      fontWeight: isActive ? 600 : 400,
                      fontSize: 13,
                      transition: "all var(--t-fast)",
                      borderRadius: "0 6px 6px 0",
                      marginRight: 8,
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        (e.currentTarget as HTMLElement).style.background = "var(--surface-hover)";
                        (e.currentTarget as HTMLElement).style.color = "var(--text-2)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        (e.currentTarget as HTMLElement).style.background = "transparent";
                        (e.currentTarget as HTMLElement).style.color = "var(--text-3)";
                      }
                    }}
                  >
                    <span
                      style={{
                        fontSize: 14,
                        width: 18,
                        textAlign: "center",
                        flexShrink: 0,
                        opacity: isActive ? 1 : 0.7,
                      }}
                    >
                      {item.icon}
                    </span>
                    <span style={{ flex: 1 }}>{item.label}</span>
                    {badge != null && (
                      <span className="nav-badge">{badge}</span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Footer status */}
        <div
          style={{
            padding: "12px 20px",
            borderTop: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            gap: 7,
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: "var(--success)",
              boxShadow: "0 0 6px var(--success)",
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: 11, color: "var(--muted)" }}>
            Supabase · Knot · Photon
          </span>
        </div>
      </aside>

      {/* ── Main content ────────────────────────────────────────────────────── */}
      <main
        style={{
          marginLeft: 232,
          flex: 1,
          padding: "32px 36px",
          minWidth: 0,
          maxWidth: "100%",
          animation: "fadeIn 0.2s ease both",
        }}
      >
        {children}
      </main>
    </div>
  );
}
