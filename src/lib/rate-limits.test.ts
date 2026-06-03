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
  p95: [vec("policy:transaction", 0.019)], // seconds (cumulative-bucket p95)
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
    // lifetime deny-rate: denied / (allowed + denied) = 9 / (26 + 9) = 25.71%
    expect(v.kpis.denyRatePct).toBeCloseTo(25.71, 1);
    expect(v.kpis.failOpen).toBe(2);
    const txn = v.policies.find((p) => p.endpoint === "policy:transaction")!;
    expect(txn.policy).toBe("TRANSACTION");
    expect(txn.denied).toBe(9);
    expect(txn.denyRatePct).toBeCloseTo(30, 0); // lifetime: 9 / (21 + 9)
    expect(txn.p95Ms).toBeCloseTo(19, 0); // 0.019s -> 19ms
    // LOGIN is never a row
    expect(v.policies.find((p) => p.endpoint === "policy:login")).toBeUndefined();
    expect(v.health.fluxguardUp).toBe(true);
    expect(v.health.overallP95Ms).toBeCloseTo(21, 0);
  });

  it("reports prometheus-down when every query rejected (null)", () => {
    const raw = Object.fromEntries(
      Object.keys(okRaw()).map((k) => [k, null])
    ) as unknown as RawResults;
    expect(toRateLimitView(raw).state).toBe("prometheus-down");
  });

  it("reports not-scraped when prometheus is up but fluxguard has no series and target is down", () => {
    const raw = Object.fromEntries(
      Object.keys(okRaw()).map((k) => [k, []])
    ) as unknown as RawResults;
    expect(toRateLimitView(raw).state).toBe("not-scraped");
  });

  it("reports not-scraped when the fluxguard scrape target is configured but down (up=0)", () => {
    const raw = Object.fromEntries(
      Object.keys(okRaw()).map((k) => [k, k === "up" ? [scalar(0)] : []])
    ) as unknown as RawResults;
    expect(toRateLimitView(raw).state).toBe("not-scraped");
  });

  it("renders 0% deny-rate and null p95 under zero traffic (up=1, empty counters)", () => {
    const raw = Object.fromEntries(
      Object.keys(okRaw()).map((k) => [k, k === "up" ? [scalar(1)] : []])
    ) as unknown as RawResults;
    const v = toRateLimitView(raw);
    expect(v.state).toBe("ok");
    expect(v.kpis.denyRatePct).toBe(0);
    expect(v.policies.find((p) => p.endpoint === "policy:transaction")!.p95Ms).toBeNull();
  });
});
