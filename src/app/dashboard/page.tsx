import { KpiCard } from "@/components/KpiCard";
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

export default async function DashboardPage() {
  const stats = await getStats();

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-slate-100">Dashboard</h1>
        <p className="text-slate-400 text-sm mt-0.5">Live status across fraud · bank ops · rate limits</p>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard label="Fraud Holds" value={stats.heldCount} sub="transactions awaiting review" accent="amber" />
        <KpiCard label="Open Cases" value={stats.openCases} sub="support cases open" accent="blue" />
        <KpiCard label="SLA Risk" value={stats.slaRisk} sub="due within 2 hours" accent="red" />
        <KpiCard label="High Severity" value={stats.highSev} sub="HIGH or CRITICAL cases" accent="red" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <section className="bg-slate-800 rounded-lg p-5 space-y-3">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Services</h2>
          <div className="space-y-2 text-sm">
            {[
              { name: "Fluxa Query", port: "8083" },
              { name: "Fluxa Fraud gRPC", port: "9095" },
              { name: "BankOps Backend", port: "8080" },
              { name: "Prometheus", port: "9090" },
              { name: "Grafana", port: "3000" },
            ].map(({ name, port }) => (
              <div key={name} className="flex items-center justify-between text-slate-300">
                <span>{name}</span>
                <span className="text-slate-500 font-mono text-xs">:{port}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-slate-800 rounded-lg p-5 space-y-3">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Quick Links</h2>
          <div className="space-y-2 text-sm">
            {[
              { label: "Fraud Feed (live SSE)", href: "/fraud-feed" },
              { label: "HELD Transactions", href: "/fraud-review" },
              { label: "Cases Queue", href: "/cases" },
              { label: "Rate Limit Telemetry", href: "/rate-limits" },
              { label: "Grafana Dashboard", href: "http://localhost:3000" },
            ].map(({ label, href }) => (
              <a key={label} href={href} className="block text-amber-400 hover:text-amber-300 transition-colors">
                {label} →
              </a>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
