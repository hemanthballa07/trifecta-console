export const FLUXA_BASE = process.env.NEXT_PUBLIC_FLUXA_URL ?? "http://localhost:8083";
export const BANKOPS_BASE = process.env.NEXT_PUBLIC_BANKOPS_URL ?? "http://localhost:8080/api";
export const PROMETHEUS_BASE = process.env.NEXT_PUBLIC_PROMETHEUS_URL ?? "http://localhost:9090";

async function apiFetch<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  return res.json() as Promise<T>;
}

// bankops returns a bare JSON array for these; the console treats them as a
// { content } page, so normalize both shapes (array or Spring Page) here.
export async function fetchHeldTransactions() {
  const d = await apiFetch<
    import("@/types").Transaction[] | { content?: import("@/types").Transaction[] }
  >(`${BANKOPS_BASE}/transactions?status=HELD`);
  return { content: Array.isArray(d) ? d : d.content ?? [] };
}

export async function fetchOpenCases() {
  const d = await apiFetch<
    import("@/types").SupportCase[] | { content?: import("@/types").SupportCase[] }
  >(`${BANKOPS_BASE}/cases?status=OPEN&size=100`);
  return { content: Array.isArray(d) ? d : d.content ?? [] };
}

// BankOps release/reject accept an optional ReviewTransactionRequest body
// ({ actorId, notes }) that feeds the audit timeline. Send the reviewer + reason
// instead of an empty body so the decision is attributable and the reason persists.
export interface ReviewBody {
  actorId?: string;
  notes?: string;
}

export async function releaseTransaction(accountId: number, txnId: number, review?: ReviewBody) {
  const res = await fetch(
    `${BANKOPS_BASE}/accounts/${accountId}/transactions/${txnId}/release`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(review ?? {}) }
  );
  if (!res.ok) throw new Error(`Release failed: ${res.status}`);
}

export async function rejectTransaction(accountId: number, txnId: number, review?: ReviewBody) {
  const res = await fetch(
    `${BANKOPS_BASE}/accounts/${accountId}/transactions/${txnId}/reject`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(review ?? {}) }
  );
  if (!res.ok) throw new Error(`Reject failed: ${res.status}`);
}

export async function fetchPrometheusQuery(query: string) {
  const url = `${PROMETHEUS_BASE}/api/v1/query?query=${encodeURIComponent(query)}`;
  return apiFetch<{ data: { result: { metric: Record<string, string>; value: [number, string] }[] } }>(url);
}
