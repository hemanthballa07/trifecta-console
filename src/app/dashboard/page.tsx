import type { CSSProperties } from "react";
import { fetchHeldTransactions, fetchOpenCases } from "@/lib/api";
import type { Transaction } from "@/types";

async function getStats() {
  try {
    const [heldRes, casesRes] = await Promise.allSettled([fetchHeldTransactions(), fetchOpenCases()]);
    const held = heldRes.status === "fulfilled" ? heldRes.value.content ?? [] : [];
    const cases = casesRes.status === "fulfilled" ? casesRes.value.content ?? [] : [];

    const p1Open = cases.filter((c) => c.priority === "P1" && c.status === "OPEN").length;
    const highSev = cases.filter((c) => c.severity === "HIGH" || c.severity === "CRITICAL").length;
    const now = Date.now();
    const slaRisk = cases.filter((c) => {
      if (!c.slaDueAt) return false;
      return new Date(c.slaDueAt).getTime() - now < 2 * 60 * 60 * 1000;
    }).length;

    return { heldCount: held.length, openCases: cases.length, p1Open, highSev, slaRisk, recentHolds: held.slice(0, 4) };
  } catch {
    return { heldCount: 0, openCases: 0, p1Open: 0, highSev: 0, slaRisk: 0, recentHolds: [] as Transaction[] };
  }
}

const SERVICES = [
  { name: "Fluxa Query (SSE)", port: 8083, probe: "http://localhost:8083/" },
  { name: "Fluxa Fraud gRPC", port: 9095, probe: "http://localhost:9096/metrics" },
  { name: "Fluxguard RateLimit", port: 9099, probe: "http://localhost:8091/actuator/health" },
  { name: "BankOps Backend", port: 8080, probe: "http://localhost:8080/api" },
  { name: "Prometheus", port: 9090, probe: "http://localhost:9090/-/ready" },
  { name: "Grafana", port: 3000, probe: "http://localhost:3000/api/health" },
];

async function probe(url: string): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1500);
    await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    clearTimeout(timer);
    return true;
  } catch {
    return false;
  }
}

async function getServices() {
  const up = await Promise.all(SERVICES.map((s) => probe(s.probe)));
  return SERVICES.map((s, i) => ({ ...s, up: up[i] }));
}

function ago(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return "";
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function money(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

const card: CSSProperties = {
  background: "var(--bg-surface)",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-card)",
  boxShadow: "var(--shadow-card)",
};

function Kpi({ label, value, sub, accent, href }: { label: string; value: number; sub: string; accent: string; href: string }) {
  return (
    <a href={href} style={{ ...card, padding: "18px 20px", borderLeft: `4px solid ${accent}`, textDecoration: "none", display: "block" }}>
      <p className="t-caption" style={{ margin: 0, marginBottom: 8 }}>{label}</p>
      <p className="mono" style={{ margin: 0, fontSize: 28, fontWeight: 700, color: accent, fontFeatureSettings: '"zero" 0' }}>{value}</p>
      <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--text-tertiary)" }}>{sub}</p>
    </a>
  );
}

const sectionTitle: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between" };

export default async function DashboardPage() {
  const [stats, services] = await Promise.all([getStats(), getServices()]);

  return (
    <div style={{ padding: 32, display: "flex", flexDirection: "column", gap: 20, maxWidth: 1120 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: "var(--text-primary)" }}>Dashboard</h1>
        <p style={{ margin: "3px 0 0", fontSize: 13, color: "var(--text-secondary)" }}>
          Live status across fraud · bank ops · rate limits
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
        <Kpi label="Fraud Holds" value={stats.heldCount} sub="transactions awaiting review" accent="var(--txn-held)" href="/fraud-review" />
        <Kpi label="Open Cases" value={stats.openCases} sub="support cases open" accent="var(--txn-released)" href="/cases" />
        <Kpi label="SLA Risk" value={stats.slaRisk} sub="due within 2 hours" accent="var(--txn-rejected)" href="/cases" />
        <Kpi label="High Severity" value={stats.highSev} sub="HIGH or CRITICAL cases" accent="var(--sev-critical)" href="/cases" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.35fr 1fr", gap: 16 }}>
        <section style={{ ...card, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={sectionTitle}>
            <h2 className="t-caption" style={{ margin: 0 }}>Recent Holds</h2>
            <a href="/fraud-review" style={{ fontSize: 12.5, fontWeight: 600, color: "var(--brand-primary)", textDecoration: "none" }}>Review all →</a>
          </div>
          {stats.recentHolds.length === 0 ? (
            <p style={{ margin: "4px 0", fontSize: 13, color: "var(--text-tertiary)" }}>No transactions on hold.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {stats.recentHolds.map((t, i) => (
                <a
                  key={t.id}
                  href="/fraud-review"
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderTop: i ? "1px solid var(--border-default)" : "none", textDecoration: "none" }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--txn-held)", flexShrink: 0 }} />
                    <span className="mono" style={{ fontWeight: 700, color: "var(--text-primary)" }}>{money(t.amount)}</span>
                    <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{t.type.toLowerCase()}</span>
                  </span>
                  <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{ago(t.createdAt)}</span>
                </a>
              ))}
            </div>
          )}
        </section>

        <section style={{ ...card, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
          <h2 className="t-caption" style={{ margin: 0 }}>Service Health</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 11, fontSize: 13 }}>
            {services.map((s) => (
              <div key={s.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 9, color: "var(--text-secondary)" }}>
                  <span
                    title={s.up ? "up" : "down"}
                    style={{ width: 7, height: 7, borderRadius: "50%", background: s.up ? "var(--sla-healthy)" : "var(--text-tertiary)", flexShrink: 0 }}
                  />
                  {s.name}
                </span>
                <span className="mono" style={{ color: "var(--text-tertiary)", fontSize: 12 }}>:{s.port}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section style={{ ...card, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
        <h2 className="t-caption" style={{ margin: 0 }}>Quick Links</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 28px", fontSize: 13 }}>
          {[
            { label: "Fraud Feed (live SSE)", href: "/fraud-feed" },
            { label: "HELD Transactions", href: "/fraud-review" },
            { label: "Cases Queue", href: "/cases" },
            { label: "Rate Limit Telemetry", href: "/rate-limits" },
            { label: "Grafana Dashboard", href: "http://localhost:3000" },
          ].map(({ label, href }) => (
            <a key={label} href={href} style={{ color: "var(--brand-primary)", fontWeight: 500, textDecoration: "none" }}>
              {label} →
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
