import React from "react";

interface StatCardProps {
  label: string;
  value: number | string;
  color?: string;
  loading?: boolean;
  icon?: string;
  trend?: string;
  trendUp?: boolean;
}

export default function StatCard({
  label,
  value,
  color = "var(--primary-light)",
  loading,
  icon,
  trend,
  trendUp,
}: StatCardProps) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        padding: "18px 20px 16px",
        boxShadow: "var(--shadow-sm)",
        position: "relative",
        overflow: "hidden",
        transition: "box-shadow var(--t), border-color var(--t)",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-md)";
        (e.currentTarget as HTMLElement).style.borderColor = "var(--border-strong)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-sm)";
        (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
      }}
    >
      {/* Top accent line */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          background: color,
          opacity: 0.7,
          borderRadius: "var(--radius-lg) var(--radius-lg) 0 0",
        }}
      />

      {/* Header row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <div
          style={{
            fontSize: 11,
            color: "var(--muted)",
            textTransform: "uppercase",
            letterSpacing: "0.07em",
            fontWeight: 600,
          }}
        >
          {label}
        </div>
        {icon && (
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              background: `${color}18`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 14,
              border: `1px solid ${color}25`,
            }}
          >
            {icon}
          </div>
        )}
      </div>

      {/* Value */}
      {loading ? (
        <div
          className="skeleton"
          style={{ height: 32, width: "55%", borderRadius: 6, marginBottom: 8 }}
        />
      ) : (
        <div
          style={{
            fontSize: 28,
            fontWeight: 700,
            color,
            lineHeight: 1,
            letterSpacing: -0.5,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {value}
        </div>
      )}

      {/* Trend */}
      {trend && !loading && (
        <div
          style={{
            fontSize: 11,
            color: trendUp === false ? "var(--danger)" : trendUp ? "var(--success)" : "var(--muted)",
            marginTop: 6,
            display: "flex",
            alignItems: "center",
            gap: 3,
          }}
        >
          {trendUp === true && "↑ "}
          {trendUp === false && "↓ "}
          {trend}
        </div>
      )}
    </div>
  );
}
