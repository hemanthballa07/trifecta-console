import type { SupportCase, Transaction } from "@/types";

// BankOps account 1 is the durable seed account (see bankops LocalDataSeeder).
// Used when a held transaction carries no accountId (e.g. mock review data).
const FALLBACK_ACCOUNT_ID = 1;

// --- Contract-bridging helpers ---------------------------------------------
// BankOps field shapes don't line up 1:1 with the console's view models; these
// pure functions absorb the differences in one tested place.

// BankOps sends `summary`, not `title`. Prefer title, fall back to summary.
export function caseTitle(c: Pick<SupportCase, "title" | "summary">): string {
  return c.title ?? c.summary ?? "—";
}

// Release/reject must target the transaction's own account.
export function txnAccountId(t: Pick<Transaction, "accountId">): number {
  return t.accountId ?? FALLBACK_ACCOUNT_ID;
}

// BankOps omits currency/merchant on transactions; provide display fallbacks.
export function txnCurrency(t: Pick<Transaction, "currency">): string {
  return t.currency ?? "USD";
}

export function txnMerchant(t: Pick<Transaction, "merchant">): string {
  return t.merchant ?? "—";
}
