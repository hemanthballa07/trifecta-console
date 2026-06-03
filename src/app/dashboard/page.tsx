import type { CSSProperties } from "react";
import { fetchHeldTransactions, fetchOpenCases } from "@/lib/api";
import type { SupportCase } from "@/types";

async function getStats() {
  try {
    const [heldRes, casesRes] = await Promise.allSettled([
      fetchHeldTransactions(),
      fetchOpenCases(),
    ]);

    const held = heldRes.status === "fulfilled" ? heldRes.value.content ?? [] : [];
    const cases = casesRes.status === "fulfilled" ? casesRes.value.content ?? [] : [];

    const p1Open = cases.filter((c: SupportCase) => c.priority === "P1" && c.status === "OPEN").length;
    const highSev = cases.filter((c: SupportCase) => c.severity === "HIGH" || c.severity === "CRITICAL").length;

    const now = Date.now();
    const slaRisk = cases.filter((c: SupportCase) => {
      if (!c.slaDueAt) return false;
      const due = new Date(c.slaDueAt).getTime();
      return due - now < 2 * 60 * 60 * 1000;
    }).length;

    return { heldCount: held.length, openCases: cases.length, p1Open, highSev, slaRisk };
  } catch {
    return { heldCount: 0, openCases: 0, p1Open: 0, highSev: 0, slaRisk: 0 };
  }
}

const card: CSSProperties = {
  background: "var(--bg-surface)",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-card)",
  boxShadow: "var(--shadow-card)",
};

function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent: string;
}) {
  return (
    <div style={{ ...card, padding: "18px 20px", borderLeft: `4px solid ${accent}` }}>
      <p className="t-caption" style={{ margin: 0, marginBottom: 8 }}>{label}</p>
      <p className="mono" style={{ margin: 0, fontSize: 28, fontWeight: 700, color: accent }}>
        {value}
      </p>
      {sub && <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--text-tertiary)" }}>{sub}</p>}
    </div>
  );
}

export default async function DashboardPage() {
  const stats = await getStats();

  return (
    <div style={{ padding: 32, display: "flex", flexDirection: "column", gap: 20, maxWidth: 1120 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: "var(--text-primary)" }}>Dashboard</h1>
        <p style={{ margin: "3px 0 0", fontSize: 13, color: "var(--text-secondary)" }}>
          Live status across fraud · bank ops · rate limits
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
        <KpiCard label="Fraud Holds" value={stats.heldCount} sub="transactions awaiting review" accent="var(--txn-held)" />
        <KpiCard label="Open Cases" value={stats.openCases} sub="support cases open" accent="var(--txn-released)" />
        <KpiCard label="SLA Risk" value={stats.slaRisk} sub="due within 2 hours" accent="var(--txn-rejected)" />
        <KpiCard label="High Severity" value={stats.highSev} sub="HIGH or CRITICAL cases" accent="var(--sev-critical)" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
        <section style={{ ...card, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
          <h2 className="t-caption" style={{ margin: 0 }}>Services</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13 }}>
            {[
              { name: "Fluxa Query", port: "8083" },
              { name: "Fluxa Fraud gRPC", port: "9095" },
              { name: "BankOps Backend", port: "8080" },
              { name: "Prometheus", port: "9090" },
              { name: "Grafana", port: "3000" },
            ].map(({ name, port }) => (
              <div
                key={name}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "var(--text-secondary)" }}
              >
                <span>{name}</span>
                <span className="mono" style={{ color: "var(--text-tertiary)", fontSize: 12 }}>:{port}</span>
              </div>
            ))}
          </div>
        </section>

        <section style={{ ...card, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
          <h2 className="t-caption" style={{ margin: 0 }}>Quick Links</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13 }}>
            {[
              { label: "Fraud Feed (live SSE)", href: "/fraud-feed" },
              { label: "HELD Transactions", href: "/fraud-review" },
              { label: "Cases Queue", href: "/cases" },
              { label: "Rate Limit Telemetry", href: "/rate-limits" },
              { label: "Grafana Dashboard", href: "http://localhost:3000" },
            ].map(({ label, href }) => (
              <a
                key={label}
                href={href}
                style={{ display: "block", color: "var(--brand-primary)", fontWeight: 500, textDecoration: "none" }}
              >
                {label} →
              </a>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
