import { describe, expect, it } from "vitest";
import { caseTitle, txnAccountId, txnCurrency, txnMerchant } from "@/lib/bankops";

describe("caseTitle", () => {
  it("prefers title when present", () => {
    expect(caseTitle({ title: "Manual review", summary: "x" })).toBe("Manual review");
  });
  it("falls back to BankOps summary when title is absent", () => {
    expect(caseTitle({ title: null, summary: "Fraud held: tx abc" })).toBe("Fraud held: tx abc");
    expect(caseTitle({ summary: "Fraud held: tx abc" })).toBe("Fraud held: tx abc");
  });
  it("renders an em dash when neither is present", () => {
    expect(caseTitle({})).toBe("—");
  });
});

describe("txnAccountId", () => {
  it("uses the transaction's own accountId", () => {
    expect(txnAccountId({ accountId: 7 })).toBe(7);
  });
  it("falls back to the seed account (1) when absent", () => {
    expect(txnAccountId({})).toBe(1);
  });
});

describe("txnCurrency / txnMerchant", () => {
  it("default currency is USD when BankOps omits it", () => {
    expect(txnCurrency({ currency: "EUR" })).toBe("EUR");
    expect(txnCurrency({})).toBe("USD");
  });
  it("default merchant is an em dash when BankOps omits it", () => {
    expect(txnMerchant({ merchant: "QuickCart" })).toBe("QuickCart");
    expect(txnMerchant({})).toBe("—");
  });
});
