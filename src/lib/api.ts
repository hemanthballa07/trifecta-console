export const FLUXA_BASE = process.env.NEXT_PUBLIC_FLUXA_URL ?? "http://localhost:8083";
export const BANKOPS_BASE = process.env.NEXT_PUBLIC_BANKOPS_URL ?? "http://localhost:8080/api";
export const PROMETHEUS_BASE = process.env.NEXT_PUBLIC_PROMETHEUS_URL ?? "http://localhost:9090";

async function apiFetch<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  return res.json() as Promise<T>;
}

export async function fetchHeldTransactions() {
  return apiFetch<{ content: import("@/types").Transaction[] }>(
    `${BANKOPS_BASE}/transactions?status=HELD`
  );
}

export async function fetchOpenCases() {
  return apiFetch<{ content: import("@/types").SupportCase[] }>(
    `${BANKOPS_BASE}/cases?status=OPEN&size=100`
  );
}

export async function releaseTransaction(accountId: number, txnId: number) {
  const res = await fetch(
    `${BANKOPS_BASE}/accounts/${accountId}/transactions/${txnId}/release`,
    { method: "POST", headers: { "Content-Type": "application/json" } }
  );
  if (!res.ok) throw new Error(`Release failed: ${res.status}`);
}

export async function rejectTransaction(accountId: number, txnId: number) {
  const res = await fetch(
    `${BANKOPS_BASE}/accounts/${accountId}/transactions/${txnId}/reject`,
    { method: "POST", headers: { "Content-Type": "application/json" } }
  );
  if (!res.ok) throw new Error(`Reject failed: ${res.status}`);
}

export async function fetchPrometheusQuery(query: string) {
  const url = `${PROMETHEUS_BASE}/api/v1/query?query=${encodeURIComponent(query)}`;
  return apiFetch<{ data: { result: { metric: Record<string, string>; value: [number, string] }[] } }>(url);
}
