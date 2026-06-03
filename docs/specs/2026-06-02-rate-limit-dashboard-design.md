# Rate-Limit Dashboard — Design Spec

- **Date:** 2026-06-02
- **Status:** Approved (design) — pending implementation plan
- **Repo (primary):** `trifecta-console` · **Also touches:** `fluxa/deploy/prometheus`
- **Route:** `/rate-limits`

## Open Questions

- **LOGIN metering.** The gRPC LOGIN path uses `LoginThrottle`, which emits no
  `rate_limit_allowed/denied` counters, so LOGIN is currently **excluded** from the metered
  per-policy table. Options: **(a)** leave it excluded and show LOGIN's throttle status
  another way (or omit it), or **(b)** add a one-line `recordAllowed/Denied` call on the gRPC
  LOGIN path in fluxguard — which contradicts the "no new fluxguard backend surface" non-goal.
  **Resolved 2026-06-02 → (a):** LOGIN stays out of the metered table. Rationale: LOGIN's
  IP-keyed, failures-only brute-force semantics differ from token-bucket rate-limiting (a
  shared allowed/denied row would mislead), and this is console-only work that should not
  reopen the frozen fluxguard leg. If charted later, LOGIN gets its own brute-force widget,
  not a row in this table.

## Problem

The console already has a `/rate-limits` route, but it is a 70-line stub disconnected
from the shipped 3rd trifecta leg (fluxguard's gRPC `RateLimit` surface on `:9099`):

- It queries `rate_limit_hits_total` and `rate_limit_active_buckets` — **neither metric
  exists** in fluxguard. Only `rate_limit_allowed_total` is real.
- It ignores the signals that matter: `rate_limit_denied_total` (the 429s),
  `rate_limit_failopen_total`, and the `rate_limit_duration` latency histogram.
- It queries the **fluxa** Prometheus (`:9090`), which scrapes the fluxa services +
  ml-scorer but **not fluxguard** — so even the one valid query returns nothing, and the
  page shows a permanent "Prometheus unreachable" banner.

## Goal

Replace the stub with a real view of the gRPC rate-limit leg: allow vs **deny (429)**,
per-policy breakdown (TRANSACTION / OPS_RELEASE / OPS_REJECT / LOGIN), fail-open events,
and decision-latency p95 — sourced from fluxguard's actual Prometheus metrics, surfaced
through the console's existing single Prometheus source.

### Non-goals (YAGNI)

- No time-series charts — Grafana owns deep charting; the console stays card/table based.
- No new fluxguard backend surface (no SSE decisions feed — that was the rejected
  "Option C"). Reuse existing metrics only.
- No changes to the rate-limit decision logic or the frozen gRPC contract.

## Data source & plumbing

Keep a **single Prometheus source** for the console. Add a scrape job to
`fluxa/deploy/prometheus/prometheus.yml`:

```yaml
  - job_name: fluxguard
    metrics_path: /actuator/prometheus
    static_configs:
      - targets: ["host.docker.internal:8091"]
```

- fluxguard exposes `/actuator/prometheus` (management endpoints include `prometheus`)
  on its HTTP port. It runs on the host at `:8091` (`SERVER_PORT=8091`) to avoid the
  `:8080` clash with bankops. The fluxa Prometheus runs in Docker, so
  `host.docker.internal:8091` reaches it — the same pattern fluxguard's own Prometheus
  uses (`host.docker.internal:8080`). fluxguard sets no separate `management.server.port`,
  so the actuator/Prometheus endpoint rides the **main HTTP port**; the scrape-target port
  must equal fluxguard's `SERVER_PORT` (this spec assumes the documented `:8091` run mode —
  change the target if fluxguard is run on a different port).
- The console continues to query the fluxa Prometheus at `:9090` (`PROMETHEUS_BASE`,
  env `NEXT_PUBLIC_PROMETHEUS_URL`). No new env var, no second data source.

## Metrics reference (all verified to exist)

| Metric | Type | Labels | Used for |
|---|---|---|---|
| `rate_limit_allowed_total` | counter | `endpoint`, `algorithm` | allows |
| `rate_limit_denied_total` | counter | `endpoint`, `algorithm` | **429 denials** |
| `rate_limit_failopen_total` | counter | `endpoint`, `reason` | Redis-down fail-open |
| `rate_limit_duration_seconds_bucket` | histogram | `endpoint`, `algorithm`, `result`, `le` | decision p95 |
| `up{job="fluxguard"}` | gauge | `job` | scrape health |

The `endpoint` label carries the policy identity on the gRPC path (the engine records
metrics with `endpoint = identity.endpoint()`, where the gRPC service sets the identity's
endpoint to the policy's config key). **Confirmed values** (`PolicyRegistry.KEY_*`,
`PolicyRegistry.java:25-34`): `policy:transaction`, `policy:ops_release`,
`policy:ops_reject`, `policy:login`. All gRPC policies are `policy:`-prefixed — distinct
from the HTTP `RateLimitFilter`'s path-valued `endpoint`, which is what makes the
`endpoint=~"policy:.*"` scoping reliable. `policy:login` is listed for completeness but
emits no allowed/denied counters (see Open Questions).

## Page design (Next.js server component)

Mirrors the existing card/table console pages (e.g. `/dashboard`, the current stub).

**Query scoping:** every query on this page filters `endpoint=~"policy:.*"`, so decisions
from the HTTP `RateLimitFilter` (which records the *same* metric names via the same engine
but with path-valued `endpoint`) are excluded — only gRPC policy decisions are counted.

1. **Header** — "Rate Limits" + subtitle "Fluxguard gRPC RateLimit · :9099 · via Prometheus".
2. **KPI row (4 cards):** Allowed (total) · **Denied / 429 (total)** [accent border] ·
   Deny-rate % **over a 5m window**
   (`sum(rate(rate_limit_denied_total{endpoint=~"policy:.*"}[5m])) / (sum(rate(rate_limit_allowed_total{endpoint=~"policy:.*"}[5m])) + sum(rate(rate_limit_denied_total{endpoint=~"policy:.*"}[5m])))`)
   · Fail-open events (total). The Allowed / Denied / Fail-open cards are cumulative totals;
   every rate-based figure on the page uses a **5m** window.
3. **Per-policy table:** one row per metered gRPC policy `endpoint` — `policy:transaction`,
   `policy:ops_release`, `policy:ops_reject`. **LOGIN is excluded** from this table: its gRPC
   path runs through `LoginThrottle`, not `engine.decide()`, so it emits no
   allowed/denied/duration counters (verified `LoginThrottle.java`; see Open Questions).
   Columns = Allowed, Denied (429), Deny %, p95 decision latency
   (`histogram_quantile(0.95, sum by (le, endpoint) (rate(rate_limit_duration_seconds_bucket{endpoint=~"policy:.*"}[5m])))`).
4. **Health strip:** overall decision p95; fail-open count (amber when > 0 →
   "Redis degraded — failing open"); `fluxguard` scrape indicator from `up{job="fluxguard"}`.
5. Slim "About Fluxguard" note retained.

## Error handling & degradation

- Reuse `fetchPrometheusQuery` + `Promise.allSettled` (per-query isolation).
- Prometheus unreachable → keep the existing amber "Prometheus unreachable on :9090"
  banner.
- Prometheus up but fluxguard not scraped / not running (`up{job="fluxguard"}` absent or
  `0`, queries empty) → cards render "—" with a distinct hint: "fluxguard not running or
  not scraped — start it on :8091". This is visibly different from "Prometheus down".
- Zero traffic (fluxguard up + scraped, but no decisions yet): deny-rate renders `0%` when
  `allowed + denied == 0` (no `0/0` NaN), and `histogram_quantile` over no samples renders
  `—`. Distinct from both states above.
- `cache: "no-store"` (already the pattern) so a page refresh reflects current counters.

## Testing

- **Unit (console):** extract the Prometheus-result → view-model mapping into a pure
  exported function in `lib/api.ts`. trifecta-console has **no test runner today**
  (`package.json` has no `test` script, jest, or vitest), so this step explicitly includes
  adding vitest + an `npm test` script as a named setup task. If that setup is out of scope
  for this change, descope to a `tsc --noEmit` typecheck plus the manual verification below,
  and state that choice in the PR.
- **Config:** validate `prometheus.yml` parses; confirm the `fluxguard` target reports
  `up` at `:9090/targets`.
- **Manual:** run the fluxa stack + fluxguard (`:8091`) + bankops, drive a deposit burst
  (the proven 30→~21+9×429 scenario), and watch `Denied` climb on the page and the
  per-policy table populate.

## Files touched

- `fluxa/deploy/prometheus/prometheus.yml` — add the `fluxguard` scrape job.
- `trifecta-console/src/app/rate-limits/page.tsx` — rebuild.
- `trifecta-console/src/lib/api.ts` — add a couple of typed query helpers (deny-rate, p95).
- `trifecta-console/src/app/rate-limits/_components/` (optional) — small card + table
  components if the page grows past ~120 lines.

## Open assumption to verify during implementation

The `endpoint` label values are now confirmed from source (see Metrics reference). Remaining
implementation-time checks: (1) after a live burst, confirm `rate_limit_denied_total` carries
`endpoint="policy:transaction"` (etc.) as expected by hitting
`http://localhost:8091/actuator/prometheus`; (2) confirm the `algorithm` tag (`token_bucket`
for TRANSACTION/OPS) does not split a single policy across multiple rows — if it does,
aggregate with `sum without (algorithm)`.

## Decisions

- Health strip (#4) is **included** (small, high signal).
- Spec lives under `docs/specs/`.
