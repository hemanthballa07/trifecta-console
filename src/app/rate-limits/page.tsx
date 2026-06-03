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

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`bg-slate-800 rounded-lg p-5 border-l-4 ${accent ? "border-rose-500" : "border-blue-500"}`}>
      <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-3xl font-bold ${accent ? "text-rose-400" : "text-blue-400"}`}>{value}</p>
    </div>
  );
}

export default async function RateLimitsPage() {
  const view: RateLimitView = await loadRateLimitView();

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-100">Rate Limits</h1>
        <p className="text-slate-400 text-sm mt-0.5">
          Fluxguard gRPC RateLimit · :9099 · via Prometheus — {PROMETHEUS_BASE}
        </p>
      </div>

      {view.state === "prometheus-down" && (
        <div className="bg-amber-900/40 border border-amber-700 rounded-lg px-4 py-3 text-amber-300 text-sm">
          Prometheus unreachable on :9090 — start the Fluxa stack to see metrics.
        </div>
      )}
      {view.state === "not-scraped" && (
        <div className="bg-amber-900/40 border border-amber-700 rounded-lg px-4 py-3 text-amber-300 text-sm">
          fluxguard not running or not scraped — start it on :8091 and confirm the
          <span className="font-mono"> fluxguard </span> target is up at {PROMETHEUS_BASE}/targets.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Kpi label="Allowed (total)" value={fmtInt(view.kpis.allowed)} />
        <Kpi label="Denied · 429 (total)" value={fmtInt(view.kpis.denied)} accent />
        <Kpi label="Deny rate (5m)" value={fmtPct(view.kpis.denyRatePct)} />
        <Kpi label="Fail-open events" value={fmtInt(view.kpis.failOpen)} />
      </div>

      <div className="bg-slate-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-400 text-xs uppercase tracking-wider border-b border-slate-700">
              <th className="px-5 py-3 font-medium">Policy</th>
              <th className="px-5 py-3 font-medium text-right">Allowed</th>
              <th className="px-5 py-3 font-medium text-right">Denied (429)</th>
              <th className="px-5 py-3 font-medium text-right">Deny %</th>
              <th className="px-5 py-3 font-medium text-right">p95 latency</th>
            </tr>
          </thead>
          <tbody>
            {view.policies.map((p) => (
              <tr key={p.endpoint} className="border-b border-slate-800/60 last:border-0">
                <td className="px-5 py-3 font-mono text-slate-200">{p.policy}</td>
                <td className="px-5 py-3 text-right text-slate-300">{fmtInt(p.allowed)}</td>
                <td className="px-5 py-3 text-right text-rose-400">{fmtInt(p.denied)}</td>
                <td className="px-5 py-3 text-right text-slate-300">{fmtPct(p.denyRatePct)}</td>
                <td className="px-5 py-3 text-right text-slate-300">{fmtMs(p.p95Ms)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-4 text-sm">
        <div className="bg-slate-800 rounded-lg px-4 py-3">
          <span className="text-slate-400">Decision p95 (all): </span>
          <span className="text-slate-200 font-medium">{fmtMs(view.health.overallP95Ms)}</span>
        </div>
        <div className={`rounded-lg px-4 py-3 ${view.health.failOpen > 0 ? "bg-amber-900/40 text-amber-300" : "bg-slate-800 text-slate-200"}`}>
          {view.health.failOpen > 0
            ? `Redis degraded — failing open (${fmtInt(view.health.failOpen)})`
            : "Redis healthy — no fail-open"}
        </div>
        <div className={`rounded-lg px-4 py-3 ${view.health.fluxguardUp ? "bg-slate-800 text-emerald-400" : "bg-slate-800 text-slate-500"}`}>
          fluxguard scrape: {view.health.fluxguardUp ? "up" : "down"}
        </div>
      </div>

      <div className="bg-slate-800 rounded-lg p-5 space-y-2">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">About</h2>
        <p className="text-slate-400 text-sm leading-relaxed">
          Decisions made by fluxguard&apos;s gRPC <span className="font-mono">RateLimit</span> service for
          bankops (TRANSACTION and OPS release/reject). LOGIN brute-force throttling is enforced but not
          metered here. Metrics are scoped to <span className="font-mono">endpoint=~&quot;policy:.*&quot;</span>.
        </p>
      </div>
    </div>
  );
}
