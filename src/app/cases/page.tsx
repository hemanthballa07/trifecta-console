import type { CSSProperties } from "react";
import { fetchOpenCases } from "@/lib/api";
import type { SupportCase } from "@/types";
import CasesTable from "@/components/CasesTable";

const card: CSSProperties = {
  background: "var(--bg-surface)",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-card)",
  boxShadow: "var(--shadow-card)",
};

export default async function CasesPage() {
  let cases: SupportCase[] = [];
  let fetchError: string | null = null;

  try {
    const res = await fetchOpenCases();
    cases = res.content ?? [];
  } catch (e) {
    fetchError = e instanceof Error ? e.message : "Failed to load cases";
  }

  return (
    <div style={{ padding: 32, display: "flex", flexDirection: "column", gap: 20, maxWidth: 1120 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: "var(--text-primary)" }}>Cases</h1>
        <p style={{ margin: "3px 0 0", fontSize: 13, color: "var(--text-secondary)" }}>
          Open support cases from BankOps — {cases.length} open
        </p>
      </div>

      {fetchError && (
        <div
          style={{
            background: "var(--soft-critical)",
            border: "1px solid var(--sev-critical)",
            borderRadius: "var(--radius-default)",
            color: "#B91C1C",
            padding: "11px 16px",
            fontSize: 13,
          }}
        >
          {fetchError} — is bankops running on :8080?
        </div>
      )}

      {!fetchError && cases.length === 0 && (
        <div style={{ ...card, padding: "48px 20px", textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>
          No open cases
        </div>
      )}

      {!fetchError && cases.length > 0 && <CasesTable cases={cases} />}
    </div>
  );
}
