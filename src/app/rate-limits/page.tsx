import { fetchPrometheusQuery, PROMETHEUS_BASE } from "@/lib/api";

interface PrometheusResult {
  metric: Record<string, string>;
  value: [number, string];
}

async function getFluxguardMetrics() {
  const queries = [
    { label: "Rate limit hits (total)", query: "sum(rate_limit_hits_total)" },
    { label: "Requests allowed (total)", query: "sum(rate_limit_allowed_total)" },
    { label: "Active token buckets", query: "rate_limit_active_buckets" },
  ];

  const results = await Promise.allSettled(queries.map((q) => fetchPrometheusQuery(q.query)));

  return queries.map((q, i) => {
    const r = results[i];
    if (r.status === "rejected") return { label: q.label, value: "—", error: true };
    const first = r.value.data?.result?.[0] as PrometheusResult | undefined;
    return { label: q.label, value: first ? parseFloat(first.value[1]).toFixed(2) : "0", error: false };
  });
}

export default async function RateLimitsPage() {
  let metrics: { label: string; value: string; error: boolean }[] = [];
  let unavailable = false;

  try {
    metrics = await getFluxguardMetrics();
  } catch {
    unavailable = true;
  }

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-100">Rate Limits</h1>
        <p className="text-slate-400 text-sm mt-0.5">
          Fluxguard telemetry via Prometheus — {PROMETHEUS_BASE}
        </p>
      </div>

      {unavailable && (
        <div className="bg-amber-900/40 border border-amber-700 rounded-lg px-4 py-3 text-amber-300 text-sm">
          Prometheus unreachable on :9090 — start the Fluxa stack or Fluxguard to see metrics.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {metrics.map(({ label, value, error }) => (
          <div key={label} className="bg-slate-800 rounded-lg p-5 border-l-4 border-blue-500">
            <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">{label}</p>
            <p className={`text-3xl font-bold ${error ? "text-slate-500" : "text-blue-400"}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="bg-slate-800 rounded-lg p-5 space-y-3">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">About Fluxguard</h2>
        <p className="text-slate-400 text-sm leading-relaxed">
          Fluxguard is a distributed rate limiter using Redis Lua scripts to implement token-bucket and
          sliding-window algorithms. Its Prometheus metrics surface here when the service is running.
          Start it from the <span className="font-mono text-slate-300">fluxguard/</span> repo and ensure
          Prometheus is scraping its metrics endpoint.
        </p>
      </div>
    </div>
  );
}
