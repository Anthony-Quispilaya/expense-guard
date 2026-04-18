import React from "react";

interface BadgeProps {
  value: string;
  size?: "sm" | "md";
}

interface BadgeStyle {
  bg: string;
  text: string;
  border: string;
  icon?: string;
}

const STYLES: Record<string, BadgeStyle> = {
  approved:             { bg: "rgba(16,185,129,0.1)",   text: "#10b981", border: "rgba(16,185,129,0.25)",  icon: "✓" },
  suspicious:           { bg: "rgba(245,158,11,0.1)",   text: "#f59e0b", border: "rgba(245,158,11,0.3)",   icon: "⚠" },
  likely_personal:      { bg: "rgba(239,68,68,0.1)",    text: "#ef4444", border: "rgba(239,68,68,0.25)",   icon: "⚑" },
  sent:                 { bg: "rgba(16,185,129,0.1)",   text: "#10b981", border: "rgba(16,185,129,0.25)",  icon: "↑" },
  failed:               { bg: "rgba(239,68,68,0.1)",    text: "#ef4444", border: "rgba(239,68,68,0.25)",   icon: "✕" },
  skipped:              { bg: "rgba(100,116,139,0.12)", text: "#64748b", border: "rgba(100,116,139,0.2)",  icon: "—" },
  platform_unsupported: { bg: "rgba(245,158,11,0.1)",   text: "#f59e0b", border: "rgba(245,158,11,0.25)"              },
  simulated:            { bg: "rgba(59,130,246,0.1)",   text: "#3b82f6", border: "rgba(59,130,246,0.25)",  icon: "◎" },
  connected:            { bg: "rgba(16,185,129,0.1)",   text: "#10b981", border: "rgba(16,185,129,0.25)",  icon: "●" },
  disconnected:         { bg: "rgba(239,68,68,0.1)",    text: "#ef4444", border: "rgba(239,68,68,0.25)",   icon: "○" },
  knot:                 { bg: "rgba(99,102,241,0.1)",   text: "#818cf8", border: "rgba(99,102,241,0.25)"              },
  simulation:           { bg: "rgba(59,130,246,0.1)",   text: "#3b82f6", border: "rgba(59,130,246,0.25)",  icon: "◎" },
  pending:              { bg: "rgba(245,158,11,0.08)",  text: "#f59e0b", border: "rgba(245,158,11,0.2)",   icon: "⏳" },
  rejected:             { bg: "rgba(239,68,68,0.1)",    text: "#ef4444", border: "rgba(239,68,68,0.25)",   icon: "✕" },
  needs_receipt:        { bg: "rgba(99,102,241,0.1)",   text: "#818cf8", border: "rgba(99,102,241,0.25)",  icon: "📋" },
  needs_explanation:    { bg: "rgba(139,92,246,0.1)",   text: "#a78bfa", border: "rgba(139,92,246,0.25)",  icon: "💬" },
};

const LABELS: Record<string, string> = {
  likely_personal: "Likely Personal",
  platform_unsupported: "Platform N/A",
  needs_receipt: "Needs Receipt",
  needs_explanation: "Needs Explanation",
};

export default function Badge({ value, size = "sm" }: BadgeProps) {
  const style = STYLES[value] ?? {
    bg: "rgba(100,116,139,0.1)",
    text: "#64748b",
    border: "rgba(100,116,139,0.18)",
  };
  const label = LABELS[value] ?? value.replace(/_/g, " ");

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        background: style.bg,
        color: style.text,
        border: `1px solid ${style.border}`,
        padding: size === "sm" ? "2px 8px" : "4px 10px",
        borderRadius: 20,
        fontSize: size === "sm" ? 11 : 12,
        fontWeight: 600,
        letterSpacing: "0.03em",
        whiteSpace: "nowrap",
      }}
    >
      {style.icon && (
        <span style={{ fontSize: size === "sm" ? 9 : 11, lineHeight: 1 }}>
          {style.icon}
        </span>
      )}
      {label}
    </span>
  );
}
