import { fetchPrometheusQuery } from "@/lib/api";

const SCOPE = `endpoint=~"policy:.*"`;

// gRPC policy endpoint labels (PolicyRegistry.KEY_*). LOGIN omitted by design:
// its gRPC path uses LoginThrottle, not the engine, so it emits no allowed/denied counters.
export const POLICY_LABELS: Record<string, string> = {
  "policy:transaction": "TRANSACTION",
  "policy:ops_release": "OPS_RELEASE",
  "policy:ops_reject": "OPS_REJECT",
};

// `sum by (endpoint)` collapses the `algorithm` tag so a policy is never split across rows.
// `policy:login` matches SCOPE but emits no series, so it never appears — harmless.
export const QUERIES = {
  allowedTotal: `sum by (endpoint) (rate_limit_allowed_total{${SCOPE}})`,
  deniedTotal: `sum by (endpoint) (rate_limit_denied_total{${SCOPE}})`,
  p95: `histogram_quantile(0.95, sum by (le, endpoint) (rate_limit_duration_seconds_bucket{${SCOPE}}))`,
  failOpen: `sum(rate_limit_failopen_total{${SCOPE}})`,
  overallP95: `histogram_quantile(0.95, sum by (le) (rate_limit_duration_seconds_bucket{${SCOPE}}))`,
  up: `up{job="fluxguard"}`,
} as const;

export type QueryKey = keyof typeof QUERIES;
type PromVec = { metric: Record<string, string>; value: [number, string] }[];
// null = that query rejected (e.g. Prometheus unreachable); [] = reachable but no series.
export type RawResults = Record<QueryKey, PromVec | null>;

export interface PolicyRow {
  endpoint: string;
  policy: string;
  allowed: number;
  denied: number;
  denyRatePct: number | null;
  p95Ms: number | null;
}

export interface RateLimitView {
  state: "ok" | "prometheus-down" | "not-scraped";
  kpis: { allowed: number; denied: number; denyRatePct: number; failOpen: number };
  policies: PolicyRow[];
  health: { overallP95Ms: number | null; failOpen: number; fluxguardUp: boolean };
}

function byEndpoint(r: PromVec | null): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of r ?? []) {
    const v = parseFloat(s.value[1]);
    if (!Number.isNaN(v)) m.set(s.metric.endpoint ?? "", v);
  }
  return m;
}

function scalarFirst(r: PromVec | null): number | null {
  if (!r || r.length === 0) return null;
  const v = parseFloat(r[0].value[1]);
  return Number.isNaN(v) ? null : v;
}

function sumValues(m: Map<string, number>): number {
  let t = 0;
  for (const v of m.values()) t += v;
  return t;
}

function emptyPolicies(): PolicyRow[] {
  return Object.keys(POLICY_LABELS).map((ep) => ({
    endpoint: ep,
    policy: POLICY_LABELS[ep],
    allowed: 0,
    denied: 0,
    denyRatePct: null,
    p95Ms: null,
  }));
}

export function toRateLimitView(raw: RawResults): RateLimitView {
  const keys = Object.keys(QUERIES) as QueryKey[];

  if (keys.every((k) => raw[k] === null)) {
    return {
      state: "prometheus-down",
      kpis: { allowed: 0, denied: 0, denyRatePct: 0, failOpen: 0 },
      policies: emptyPolicies(),
      health: { overallP95Ms: null, failOpen: 0, fluxguardUp: false },
    };
  }

  const fluxguardUp = (raw.up ?? []).some((s) => parseFloat(s.value[1]) === 1);
  const allowedT = byEndpoint(raw.allowedTotal);
  const deniedT = byEndpoint(raw.deniedTotal);

  if (allowedT.size === 0 && deniedT.size === 0 && !fluxguardUp) {
    return {
      state: "not-scraped",
      kpis: { allowed: 0, denied: 0, denyRatePct: 0, failOpen: 0 },
      policies: emptyPolicies(),
      health: { overallP95Ms: null, failOpen: 0, fluxguardUp: false },
    };
  }

  const p95 = byEndpoint(raw.p95);

  const policies: PolicyRow[] = Object.keys(POLICY_LABELS).map((ep) => {
    const aT = allowedT.get(ep) ?? 0;
    const dT = deniedT.get(ep) ?? 0;
    const denom = aT + dT;
    const p95s = p95.get(ep);
    return {
      endpoint: ep,
      policy: POLICY_LABELS[ep],
      allowed: aT,
      denied: dT,
      denyRatePct: denom > 0 ? (dT / denom) * 100 : 0,
      p95Ms: p95s != null ? p95s * 1000 : null,
    };
  });

  const allowedSum = sumValues(allowedT);
  const deniedSum = sumValues(deniedT);
  const denom = allowedSum + deniedSum;
  const overall = scalarFirst(raw.overallP95);
  const failOpen = scalarFirst(raw.failOpen) ?? 0;

  return {
    state: "ok",
    kpis: {
      allowed: allowedSum,
      denied: deniedSum,
      denyRatePct: denom > 0 ? (deniedSum / denom) * 100 : 0,
      failOpen,
    },
    policies,
    health: {
      overallP95Ms: overall != null ? overall * 1000 : null,
      failOpen,
      fluxguardUp,
    },
  };
}

export async function loadRateLimitView(): Promise<RateLimitView> {
  const keys = Object.keys(QUERIES) as QueryKey[];
  const settled = await Promise.allSettled(keys.map((k) => fetchPrometheusQuery(QUERIES[k])));
  const raw = {} as RawResults;
  keys.forEach((k, i) => {
    const s = settled[i];
    raw[k] = s.status === "fulfilled" ? s.value.data.result : null;
  });
  return toRateLimitView(raw);
}
