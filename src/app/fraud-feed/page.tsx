"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { useFraudStream } from "@/hooks/useFraudStream";
import type { FraudEvent } from "@/types";

// Stable rule universe (the known FraudEvent.rule_name union). Any novel rule
// arriving on the stream is unioned in at render; a selected rule is kept visible
// even if it ages out of the buffer.
const KNOWN_RULES = ["amount_threshold", "velocity", "blocked_merchant", "high_risk_currency", "ml_risk"];

const card: CSSProperties = {
  background: "var(--bg-surface)",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-card)",
  boxShadow: "var(--shadow-card)",
};

const ruleTones: Record<string, { color: string; soft: string }> = {
  amount_threshold: { color: "#92400E", soft: "var(--soft-amber)" },
  velocity: { color: "#B91C1C", soft: "var(--soft-critical)" },
  blocked_merchant: { color: "#9A3412", soft: "var(--soft-high)" },
  high_risk_currency: { color: "#6D28D9", soft: "#F5F3FF" },
  ml_risk: { color: "#4338CA", soft: "var(--brand-primary-soft)" },
};

function RuleBadge({ rule }: { rule: string }) {
  const tone = ruleTones[rule] ?? { color: "var(--text-secondary)", soft: "var(--soft-slate)" };
  return (
    <span
      className="mono"
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 9px",
        borderRadius: "var(--radius-chip)",
        background: tone.soft,
        color: tone.color,
        fontSize: 12,
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      {rule}
    </span>
  );
}

const th: CSSProperties = { padding: "11px 20px", textAlign: "left" };
const td: CSSProperties = { padding: "12px 20px", borderTop: "1px solid var(--border-default)" };

function FraudRow({ fe }: { fe: FraudEvent }) {
  const ts = new Date(fe.flagged_at);
  const corrShort = fe.correlation_id ? fe.correlation_id.slice(0, 8) : "—";
  const mlHigh = fe.ml_score >= 0.87;
  return (
    <tr>
      <td className="mono" style={{ ...td, fontSize: 12, color: "var(--text-tertiary)", whiteSpace: "nowrap" }}>
        {ts.toLocaleTimeString()}
      </td>
      <td className="mono" style={{ ...td, fontSize: 12, color: "var(--text-tertiary)" }} title={fe.correlation_id}>
        {corrShort}
      </td>
      <td className="mono" style={{ ...td, color: "var(--text-primary)" }}>{fe.user_id}</td>
      <td className="mono" style={{ ...td, color: "var(--txn-rejected)", fontWeight: 600, whiteSpace: "nowrap" }}>
        {fe.currency} {fe.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
      </td>
      <td style={{ ...td, color: "var(--text-secondary)" }}>{fe.merchant}</td>
      <td style={td}><RuleBadge rule={fe.rule_name} /></td>
      <td style={{ ...td, whiteSpace: "nowrap" }}>
        {fe.ml_score > 0 ? (
          <span
            title={`ML risk score ${fe.ml_score.toFixed(4)}`}
            className="mono"
            style={{
              display: "inline-flex",
              padding: "2px 9px",
              borderRadius: "var(--radius-chip)",
              fontSize: 12,
              fontWeight: 600,
              background: mlHigh ? "var(--soft-critical)" : "var(--soft-slate)",
              color: mlHigh ? "#B91C1C" : "var(--text-secondary)",
            }}
          >
            {(fe.ml_score * 100).toFixed(0)}%
          </span>
        ) : (
          <span style={{ color: "var(--text-tertiary)" }} title="scorer unavailable / rules-only">—</span>
        )}
      </td>
      <td
        className="mono"
        style={{ ...td, fontSize: 12, color: "var(--text-tertiary)", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
        title={fe.rule_value}
      >
        {fe.rule_value}
      </td>
    </tr>
  );
}

const statusTones: Record<string, { color: string; soft: string; label: string }> = {
  connecting: { color: "#92400E", soft: "var(--soft-amber)", label: "Connecting" },
  live: { color: "#047857", soft: "var(--soft-emerald)", label: "Live" },
  error: { color: "#B91C1C", soft: "var(--soft-critical)", label: "Error" },
  closed: { color: "var(--text-secondary)", soft: "var(--soft-slate)", label: "Closed" },
};

function RuleFilterChip({ rule, active, onClick }: { rule: string; active: boolean; onClick: () => void }) {
  const tone = rule === "all" ? null : ruleTones[rule] ?? { color: "var(--text-secondary)", soft: "var(--soft-slate)" };
  return (
    <button
      type="button"
      onClick={onClick}
      className={rule === "all" ? undefined : "mono"}
      style={{
        cursor: "pointer",
        padding: "2px 9px",
        borderRadius: "var(--radius-chip)",
        fontSize: 12,
        fontWeight: 600,
        border: "1px solid var(--border-default)",
        background: active ? tone?.soft ?? "var(--brand-primary)" : "var(--bg-surface)",
        color: active ? tone?.color ?? "#FFFFFF" : "var(--text-secondary)",
      }}
    >
      {rule === "all" ? "All" : rule}
    </button>
  );
}

export default function FraudFeedPage() {
  const { events, status } = useFraudStream(50);
  const st = statusTones[status] ?? statusTones.closed;
  const [rule, setRule] = useState("all");

  const rules = useMemo(() => {
    const set = new Set<string>(KNOWN_RULES);
    for (const e of events) set.add(e.rule_name);
    if (rule !== "all") set.add(rule);
    return [...set];
  }, [events, rule]);

  const visible = useMemo(
    () => events.filter((e) => rule === "all" || e.rule_name === rule),
    [events, rule]
  );

  return (
    <div style={{ padding: 32, display: "flex", flexDirection: "column", gap: 20, maxWidth: 1120 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: "var(--text-primary)" }}>Fraud Feed</h1>
          <p style={{ margin: "3px 0 0", fontSize: 13, color: "var(--text-secondary)" }}>
            Live stream from Fluxa query service — SSE on :8083/fraud-events
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "var(--text-secondary)" }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "2px 9px",
              borderRadius: "var(--radius-chip)",
              background: st.soft,
              color: st.color,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {status === "live" ? (
              <span className="live-dot" />
            ) : (
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: st.color }} />
            )}
            {st.label}
          </span>
          <span className="mono" style={{ color: "var(--text-tertiary)" }}>{visible.length} of {events.length} events</span>
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <span className="t-caption" style={{ color: "var(--text-tertiary)" }}>Rule</span>
        <RuleFilterChip rule="all" active={rule === "all"} onClick={() => setRule("all")} />
        {rules.map((r) => (
          <RuleFilterChip key={r} rule={r} active={rule === r} onClick={() => setRule(r)} />
        ))}
      </div>

      <div style={{ ...card, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              <th className="t-caption" style={th}>Time</th>
              <th className="t-caption" style={th}>Corr ID</th>
              <th className="t-caption" style={th}>User</th>
              <th className="t-caption" style={th}>Amount</th>
              <th className="t-caption" style={th}>Merchant</th>
              <th className="t-caption" style={th}>Rule</th>
              <th className="t-caption" style={th}>ML</th>
              <th className="t-caption" style={th}>Detail</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ ...td, padding: "48px 20px", textAlign: "center", color: "var(--text-tertiary)" }}>
                  {status === "connecting" ? "Connecting to Fluxa…" : "No fraud events yet"}
                </td>
              </tr>
            ) : visible.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ ...td, padding: "48px 20px", textAlign: "center", color: "var(--text-tertiary)" }}>
                  No events match the <span className="mono">{rule}</span> rule.
                </td>
              </tr>
            ) : (
              visible.map((fe) => <FraudRow key={fe.flag_id} fe={fe} />)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
