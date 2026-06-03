# Rate-Limit Dashboard Implementation Plan

> Implementation tasks below use checkbox (`- [ ]`) tracking. Each step is one action — write/adjust code, test, then commit.

**Goal:** Replace the disconnected `/rate-limits` stub in trifecta-console with a real dashboard of fluxguard's gRPC rate-limit leg (allow vs deny-429, per-policy breakdown, fail-open, decision p95), fed by a single Prometheus that now also scrapes fluxguard.

**Architecture:** Two repos. In **fluxa**, add a `fluxguard` scrape job to the existing Prometheus. In **trifecta-console**, put all PromQL + the Prometheus-result→view-model mapping in a pure, unit-tested module (`src/lib/rate-limits.ts`); the page (`src/app/rate-limits/page.tsx`) is a thin server component that calls the loader and renders. All queries scope to `endpoint=~"policy:.*"` (the gRPC policies' confirmed label prefix) so the HTTP filter's path-valued decisions are excluded. LOGIN is intentionally excluded (it emits no allowed/denied counters — see spec Open Questions, resolved (a)).

**Tech Stack:** Next.js 16.2.6 (App Router, async server components), React 19, TypeScript 5, Tailwind v4, vitest (added by this plan), Prometheus.

**Spec:** `docs/specs/2026-06-02-rate-limit-dashboard-design.md`.

---

## File structure

| File | Repo | Responsibility |
|---|---|---|
| `src/lib/rate-limits.ts` | trifecta-console | **NEW** — PromQL query set + pure `toRateLimitView` mapping + `loadRateLimitView` fetch wrapper. The only logic-bearing file; fully unit-tested. |
| `src/lib/rate-limits.test.ts` | trifecta-console | **NEW** — vitest unit tests for `toRateLimitView`. |
| `vitest.config.ts` | trifecta-console | **NEW** — minimal vitest config with the `@/` → `src` alias. |
| `package.json` | trifecta-console | **MODIFY** — add `vitest` devDep + `"test"` script. |
| `src/app/rate-limits/page.tsx` | trifecta-console | **REWRITE** — thin async server component: `loadRateLimitView()` → render KPIs, per-policy table, health strip, degraded states. |
| `deploy/prometheus/prometheus.yml` | fluxa | **MODIFY** — add the `fluxguard` scrape job. |

---

## Task 1: Add the vitest test harness

**Files:**
- Modify: `trifecta-console/package.json`
- Create: `trifecta-console/vitest.config.ts`

- [ ] **Step 1: Install vitest**

Run (in `trifecta-console/`):
```bash
npm install -D vitest
```
Expected: `vitest` added under devDependencies; `npm install` exits 0.

- [ ] **Step 2: Add the test script**

Modify `package.json` `scripts` block to:
```json
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "test": "vitest run"
  },
```

- [ ] **Step 3: Create the vitest config (resolves the `@/` alias)**

Create `vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: { environment: "node" },
});
```

- [ ] **Step 4: Verify the runner works (no tests yet)**

Run: `npm test`
Expected: vitest runs and reports "No test files found" (exit code may be non-zero; that is fine until Task 2 adds a test).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "test: add vitest runner for console unit tests"
```

---

## Task 2: The pure mapping module (TDD)

**Files:**
- Create: `trifecta-console/src/lib/rate-limits.ts`
- Test: `trifecta-console/src/lib/rate-limits.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/rate-limits.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { toRateLimitView, type RawResults } from "@/lib/rate-limits";

// Helper: build a Prometheus instant-vector result entry.
const vec = (endpoint: string, value: number) => ({
  metric: { endpoint },
  value: [0, String(value)] as [number, string],
});
const scalar = (value: number) => ({ metric: {}, value: [0, String(value)] as [number, string] });

// All keys present, with realistic post-burst numbers.
const okRaw = (): RawResults => ({
  allowedTotal: [vec("policy:transaction", 21), vec("policy:ops_release", 5)],
  deniedTotal: [vec("policy:transaction", 9), vec("policy:ops_release", 0)],
  allowedRate: [vec("policy:transaction", 7), vec("policy:ops_release", 1)],
  deniedRate: [vec("policy:transaction", 3), vec("policy:ops_release", 0)],
  p95: [vec("policy:transaction", 0.019)], // seconds
  failOpen: [scalar(2)],
  overallP95: [scalar(0.021)],
  up: [scalar(1)],
});

describe("toRateLimitView", () => {
  it("maps an ok result into KPIs, rows, and health", () => {
    const v = toRateLimitView(okRaw());
    expect(v.state).toBe("ok");
    expect(v.kpis.allowed).toBe(26);
    expect(v.kpis.denied).toBe(9);
    // deny-rate over the 5m window: dR / (aR + dR) = 3 / (8 + 3) = 27.27%
    expect(v.kpis.denyRatePct).toBeCloseTo(27.27, 1);
    expect(v.kpis.failOpen).toBe(2);
    const txn = v.policies.find((p) => p.endpoint === "policy:transaction")!;
    expect(txn.policy).toBe("TRANSACTION");
    expect(txn.denied).toBe(9);
    expect(txn.p95Ms).toBeCloseTo(19, 0); // 0.019s -> 19ms
    // LOGIN is never a row
    expect(v.policies.find((p) => p.endpoint === "policy:login")).toBeUndefined();
    expect(v.health.fluxguardUp).toBe(true);
    expect(v.health.overallP95Ms).toBeCloseTo(21, 0);
  });

  it("reports prometheus-down when every query rejected (null)", () => {
    const raw = Object.fromEntries(
      Object.keys(okRaw()).map((k) => [k, null])
    ) as RawResults;
    expect(toRateLimitView(raw).state).toBe("prometheus-down");
  });

  it("reports not-scraped when prometheus is up but fluxguard has no series and target is down", () => {
    const raw = Object.fromEntries(
      Object.keys(okRaw()).map((k) => [k, []])
    ) as RawResults;
    expect(toRateLimitView(raw).state).toBe("not-scraped");
  });

  it("renders 0% deny-rate and null p95 under zero traffic (up=1, empty counters)", () => {
    const raw = Object.fromEntries(
      Object.keys(okRaw()).map((k) => [k, k === "up" ? [scalar(1)] : []])
    ) as RawResults;
    const v = toRateLimitView(raw);
    expect(v.state).toBe("ok");
    expect(v.kpis.denyRatePct).toBe(0);
    expect(v.policies.find((p) => p.endpoint === "policy:transaction")!.p95Ms).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '@/lib/rate-limits'` (module not created yet).

- [ ] **Step 3: Write the implementation**

Create `src/lib/rate-limits.ts`:
```ts
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
  allowedRate: `sum by (endpoint) (rate(rate_limit_allowed_total{${SCOPE}}[5m]))`,
  deniedRate: `sum by (endpoint) (rate(rate_limit_denied_total{${SCOPE}}[5m]))`,
  p95: `histogram_quantile(0.95, sum by (le, endpoint) (rate(rate_limit_duration_seconds_bucket{${SCOPE}}[5m])))`,
  failOpen: `sum(rate_limit_failopen_total{${SCOPE}})`,
  overallP95: `histogram_quantile(0.95, sum by (le) (rate(rate_limit_duration_seconds_bucket{${SCOPE}}[5m])))`,
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

  const allowedR = byEndpoint(raw.allowedRate);
  const deniedR = byEndpoint(raw.deniedRate);
  const p95 = byEndpoint(raw.p95);

  const policies: PolicyRow[] = Object.keys(POLICY_LABELS).map((ep) => {
    const aR = allowedR.get(ep) ?? 0;
    const dR = deniedR.get(ep) ?? 0;
    const denom = aR + dR;
    const p95s = p95.get(ep);
    return {
      endpoint: ep,
      policy: POLICY_LABELS[ep],
      allowed: allowedT.get(ep) ?? 0,
      denied: deniedT.get(ep) ?? 0,
      denyRatePct: denom > 0 ? (dR / denom) * 100 : 0,
      p95Ms: p95s != null ? p95s * 1000 : null,
    };
  });

  const aRSum = sumValues(allowedR);
  const dRSum = sumValues(deniedR);
  const denom = aRSum + dRSum;
  const overall = scalarFirst(raw.overallP95);
  const failOpen = scalarFirst(raw.failOpen) ?? 0;

  return {
    state: "ok",
    kpis: {
      allowed: sumValues(allowedT),
      denied: sumValues(deniedT),
      denyRatePct: denom > 0 ? (dRSum / denom) * 100 : 0,
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS — all 4 tests in `rate-limits.test.ts` green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rate-limits.ts src/lib/rate-limits.test.ts
git commit -m "feat(rate-limits): pure PromQL query set + view-model mapping with tests"
```

---

## Task 3: Rebuild the page

**Files:**
- Modify (rewrite): `trifecta-console/src/app/rate-limits/page.tsx`

- [ ] **Step 1: Rewrite the page**

Replace the entire contents of `src/app/rate-limits/page.tsx` with:
```tsx
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
```

- [ ] **Step 2: Typecheck + lint + build**

Run:
```bash
npx tsc --noEmit
npm run lint
npm run build
```
Expected: tsc clean; lint clean; `next build` succeeds (the page is a server component with no type errors).

- [ ] **Step 3: Commit**

```bash
git add src/app/rate-limits/page.tsx
git commit -m "feat(rate-limits): real gRPC rate-limit dashboard (KPIs, per-policy table, health)"
```

---

## Task 4: Scrape fluxguard from the Fluxa Prometheus

**Files:**
- Modify: `fluxa/deploy/prometheus/prometheus.yml`

- [ ] **Step 1: Add the scrape job**

Append to the `scrape_configs:` list in `fluxa/deploy/prometheus/prometheus.yml` (match the existing two-space indentation):
```yaml
  - job_name: fluxguard
    metrics_path: /actuator/prometheus
    static_configs:
      - targets: ["host.docker.internal:8091"]
```
Note: the target port must equal fluxguard's `SERVER_PORT` (documented `:8091` to avoid the bankops `:8080` clash); the actuator/Prometheus endpoint rides fluxguard's main HTTP port.

- [ ] **Step 2: Validate the YAML**

Run (in `fluxa/`):
```bash
ruby -ryaml -e "YAML.load_file('deploy/prometheus/prometheus.yml'); puts 'ok'"
```
Expected: `ok`.

- [ ] **Step 3: Reload Prometheus and confirm the target**

Run (with the Fluxa stack up):
```bash
docker compose restart prometheus
```
Then confirm at `http://localhost:9090/targets` that the `fluxguard` job is listed (state `up` if fluxguard is running on :8091, `down` otherwise — both are acceptable for this step; `down` simply means start fluxguard).

- [ ] **Step 4: Commit (fluxa repo)**

```bash
git add deploy/prometheus/prometheus.yml
git commit -m "feat(prometheus): scrape fluxguard /actuator/prometheus for the console rate-limit view"
```

---

## Task 5: End-to-end verification + docs

**Files:**
- Modify: `trifecta-console` STATUS/notes as the repo convention dictates (only if such a file exists; otherwise skip).

- [ ] **Step 1: Bring up the full stack**

- Fluxa stack up (Prometheus on :9090, reloaded per Task 4).
- fluxguard running on the host: `SERVER_PORT=8091 <fluxguard run command>` (see the fluxguard repo's run instructions).
- bankops running on :8080 (JDK 21).
- trifecta-console: `npm run dev -- --port 3001`.

- [ ] **Step 2: Confirm the metric labels on the live target**

Run:
```bash
curl -s http://localhost:8091/actuator/prometheus | grep -E 'rate_limit_(allowed|denied)_total' | head
```
Expected: lines with `endpoint="policy:transaction"` (and, after ops actions, `policy:ops_release` / `policy:ops_reject`). If a single policy appears under multiple `algorithm` values, the `sum by (endpoint)` in the queries already collapses them — no change needed.

- [ ] **Step 3: Drive a burst and observe**

Issue the proven 30-deposit burst as one principal against bankops (`POST /api/accounts/1/transactions`), which calls fluxguard `CheckLimit` before fraud-eval. Then load `http://localhost:3001/rate-limits` and confirm:
- Denied (429) KPI and the TRANSACTION row's Denied climb (~9 of 30).
- Deny rate (5m) is non-zero; p95 shows a millisecond value.
- "fluxguard scrape: up".

- [ ] **Step 4: Confirm graceful degradation**

Stop fluxguard, refresh `/rate-limits`: expect the "fluxguard not running or not scraped" banner and "—"/0 values (not a crash). Stop the Fluxa Prometheus: expect the "Prometheus unreachable" banner.

- [ ] **Step 5: Final commit (if any STATUS/docs were updated)**

```bash
git add -A
git commit -m "docs(rate-limits): note dashboard verification"
```

---

## Self-Review

**Spec coverage:**
- Data plumbing (scrape job, single :9090 source) → Task 4. ✓
- KPI row (Allowed / Denied-429 / Deny-rate-5m / Fail-open) → Task 3 + `toRateLimitView` KPIs. ✓
- Per-policy table (TRANSACTION/OPS_*, allowed/denied/deny%/p95), LOGIN excluded → Task 2 (`POLICY_LABELS`) + Task 3. ✓
- Health strip (overall p95, fail-open amber, scrape up) → Task 3. ✓
- Query scoping `endpoint=~"policy:.*"`; `sum by (endpoint)` collapses `algorithm` → Task 2 `QUERIES`. ✓
- Degradation: prometheus-down / not-scraped / zero-traffic (no NaN) → Task 2 state machine + Task 3 banners + Task 2 zero-traffic test. ✓
- Windowing: totals cumulative, deny-rate + p95 over 5m → `QUERIES` + mapping. ✓
- Confirmed endpoint literals + live-burst check + algorithm aggregation → Task 5 Step 2 + baked-in `sum by (endpoint)`. ✓
- Test harness reality (no runner today) → Task 1 adds vitest; mapping extracted to a pure fn. ✓

**Placeholder scan:** No TBD/TODO; all code blocks are complete; commands have expected output. ✓

**Type consistency:** `RawResults`, `RateLimitView`, `PolicyRow`, `QUERIES`/`QueryKey`, `toRateLimitView`, `loadRateLimitView` are defined in Task 2 and used identically in Tasks 2–3. The page imports only `loadRateLimitView` + `RateLimitView` + `PROMETHEUS_BASE`. ✓
