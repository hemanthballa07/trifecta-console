import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchOpenCases, fetchHeldTransactions } from "@/lib/api";

// BankOps returns a bare JSON array for these endpoints; older/other backends
// return a Spring `{ content }` page. api.ts normalizes both. These tests pin
// that normalization — the shape gotcha that caused the dashboard-zeros bug.

afterEach(() => vi.unstubAllGlobals());

function stubFetch(body: unknown, ok = true, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok,
      status,
      statusText: ok ? "OK" : "Error",
      json: async () => body,
    }))
  );
}

describe("fetchOpenCases normalization", () => {
  it("wraps a bare BankOps array as { content }", async () => {
    stubFetch([{ id: 1, status: "NEW", severity: "HIGH", summary: "Fraud held" }]);
    const r = await fetchOpenCases();
    expect(r.content).toHaveLength(1);
    expect(r.content[0].id).toBe(1);
  });

  it("passes through a Spring { content } page", async () => {
    stubFetch({ content: [{ id: 2 }], totalElements: 1 });
    expect((await fetchOpenCases()).content[0].id).toBe(2);
  });

  it("returns { content: [] } when content is missing / not an array", async () => {
    stubFetch({ totalElements: 0 });
    expect((await fetchOpenCases()).content).toEqual([]);
  });
});

describe("fetchHeldTransactions normalization", () => {
  it("wraps a bare array as { content }, preserving accountId", async () => {
    stubFetch([{ id: 4, accountId: 1, amount: 58000, status: "HELD", type: "DEPOSIT" }]);
    const r = await fetchHeldTransactions();
    expect(r.content).toHaveLength(1);
    expect(r.content[0].accountId).toBe(1);
  });

  it("returns { content: [] } for an empty array", async () => {
    stubFetch([]);
    expect((await fetchHeldTransactions()).content).toEqual([]);
  });
});

describe("apiFetch error handling", () => {
  it("throws on a non-ok response (carries the status)", async () => {
    stubFetch(null, false, 500);
    await expect(fetchOpenCases()).rejects.toThrow(/500/);
  });
});
