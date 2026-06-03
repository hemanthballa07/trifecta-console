import type { CSSProperties } from "react";
import { loadRateLimitView, type RateLimitView } from "@/lib/rate-limits";
import { PROMETHEUS_BASE } from "@/lib/api";

function fmtInt(n: number) {
  return Math.round(n).toLocaleString();
}
function fmtPct(n: number | null) {
  return n == null ? "—" : `${n.toFixed(1)}%`;
}
function fmtMs(n: number | null) {
  return n == null ? "—" : `${n.toFixed(0)} ms`;
}

const card: CSSProperties = {
  background: "var(--bg-surface)",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-card)",
  boxShadow: "var(--shadow-card)",
};

function Kpi({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ ...card, padding: "18px 20px" }}>
      <p className="t-caption" style={{ margin: 0, marginBottom: 8 }}>{label}</p>
      <p className="mono" style={{ margin: 0, fontSize: 28, fontWeight: 700, color: color ?? "var(--text-primary)" }}>
        {value}
      </p>
    </div>
  );
}

function Pill({ tone, children }: { tone: "ok" | "warn" | "neutral"; children: React.ReactNode }) {
  const tones = {
    ok: { background: "var(--soft-emerald)", color: "#047857" },
    warn: { background: "var(--soft-amber)", color: "#92400E" },
    neutral: { background: "var(--soft-slate)", color: "var(--text-secondary)" },
  } as const;
  return (
    <div style={{ ...tones[tone], padding: "9px 14px", borderRadius: "var(--radius-default)", fontWeight: 600 }}>
      {children}
    </div>
  );
}

const th: CSSProperties = { padding: "11px 20px" };
const td: CSSProperties = { padding: "12px 20px", borderTop: "1px solid var(--border-default)" };

export default async function RateLimitsPage() {
  const view: RateLimitView = await loadRateLimitView();

  return (
    <div style={{ padding: 32, display: "flex", flexDirection: "column", gap: 20, maxWidth: 1120 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: "var(--text-primary)" }}>Rate Limits</h1>
        <p style={{ margin: "3px 0 0", fontSize: 13, color: "var(--text-secondary)" }}>
          Fluxguard gRPC RateLimit · :9099 · via Prometheus — {PROMETHEUS_BASE}
        </p>
      </div>

      {(view.state === "prometheus-down" || view.state === "not-scraped") && (
        <div
          style={{
            background: "var(--soft-amber)",
            border: "1px solid var(--sev-medium)",
            borderRadius: "var(--radius-default)",
            color: "#92400E",
            padding: "11px 16px",
            fontSize: 13,
          }}
        >
          {view.state === "prometheus-down"
            ? "Prometheus unreachable on :9090 — start the Fluxa stack to see metrics."
            : <>fluxguard not running or not scraped — start it on :8091 (its metrics port) and confirm the <span className="mono">fluxguard</span> target is up at {PROMETHEUS_BASE}/targets.</>}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
        <Kpi label="Allowed (total)" value={fmtInt(view.kpis.allowed)} />
        <Kpi label="Denied · 429 (total)" value={fmtInt(view.kpis.denied)} color="var(--txn-rejected)" />
        <Kpi label="Deny rate (5m)" value={fmtPct(view.kpis.denyRatePct)} color="var(--brand-primary)" />
        <Kpi
          label="Fail-open events"
          value={fmtInt(view.kpis.failOpen)}
          color={view.kpis.failOpen > 0 ? "var(--sev-medium)" : "var(--text-primary)"}
        />
      </div>

      <div style={{ ...card, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              <th className="t-caption" style={{ ...th, textAlign: "left" }}>Policy</th>
              <th className="t-caption" style={{ ...th, textAlign: "right" }}>Allowed</th>
              <th className="t-caption" style={{ ...th, textAlign: "right" }}>Denied (429)</th>
              <th className="t-caption" style={{ ...th, textAlign: "right" }}>Deny %</th>
              <th className="t-caption" style={{ ...th, textAlign: "right" }}>p95 latency</th>
            </tr>
          </thead>
          <tbody>
            {view.policies.map((p) => (
              <tr key={p.endpoint}>
                <td className="mono" style={{ ...td, color: "var(--text-primary)", fontWeight: 600 }}>{p.policy}</td>
                <td className="mono" style={{ ...td, textAlign: "right", color: "var(--text-secondary)" }}>{fmtInt(p.allowed)}</td>
                <td className="mono" style={{ ...td, textAlign: "right", color: "var(--txn-rejected)", fontWeight: 600 }}>{fmtInt(p.denied)}</td>
                <td className="mono" style={{ ...td, textAlign: "right", color: "var(--text-secondary)" }}>{fmtPct(p.denyRatePct)}</td>
                <td className="mono" style={{ ...td, textAlign: "right", color: "var(--text-secondary)" }}>{fmtMs(p.p95Ms)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: 13 }}>
        <div style={{ ...card, padding: "9px 14px" }}>
          <span style={{ color: "var(--text-tertiary)" }}>Decision p95 (all): </span>
          <span className="mono" style={{ color: "var(--text-primary)", fontWeight: 600 }}>{fmtMs(view.health.overallP95Ms)}</span>
        </div>
        <Pill tone={view.health.failOpen > 0 ? "warn" : "ok"}>
          {view.health.failOpen > 0
            ? `Redis degraded — failing open (${fmtInt(view.health.failOpen)})`
            : "Redis healthy — no fail-open"}
        </Pill>
        <Pill tone={view.health.fluxguardUp ? "ok" : "neutral"}>
          fluxguard scrape: {view.health.fluxguardUp ? "up" : "down"}
        </Pill>
      </div>

      <div style={{ ...card, padding: "18px 20px" }}>
        <p className="t-caption" style={{ margin: 0, marginBottom: 8 }}>About</p>
        <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>
          Decisions made by fluxguard&apos;s gRPC <span className="mono">RateLimit</span> service for bankops
          (TRANSACTION and OPS release/reject). LOGIN brute-force throttling is enforced but not metered here.
          Metrics are scoped to <span className="mono">endpoint=~&quot;policy:.*&quot;</span>.
        </p>
      </div>
    </div>
  );
}
