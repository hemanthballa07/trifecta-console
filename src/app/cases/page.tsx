import type { CSSProperties } from "react";
import { fetchOpenCases } from "@/lib/api";
import type { SupportCase } from "@/types";

// Date.now() lives in a helper (not the render body) to satisfy react-hooks/purity.
function isSlaAtRisk(slaDueAt: string | null): boolean {
  if (!slaDueAt) return false;
  return new Date(slaDueAt).getTime() - Date.now() < 2 * 60 * 60 * 1000;
}

const card: CSSProperties = {
  background: "var(--bg-surface)",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-card)",
  boxShadow: "var(--shadow-card)",
};

const chip: CSSProperties = {
  display: "inline-flex",
  padding: "2px 9px",
  borderRadius: "var(--radius-chip)",
  fontSize: 12,
  fontWeight: 600,
};

const priorityChip: Record<string, { background: string; color: string }> = {
  P1: { background: "var(--soft-critical)", color: "#B91C1C" },
  P2: { background: "var(--soft-amber)", color: "#92400E" },
  P3: { background: "var(--soft-slate)", color: "var(--text-secondary)" },
};

const severityChip: Record<string, { background: string; color: string }> = {
  CRITICAL: { background: "var(--soft-critical)", color: "#B91C1C" },
  HIGH: { background: "var(--soft-high)", color: "#C2410C" },
  MEDIUM: { background: "var(--soft-amber)", color: "#92400E" },
  LOW: { background: "var(--soft-slate)", color: "var(--text-secondary)" },
};

const statusChip: Record<string, { background: string; color: string }> = {
  OPEN: { background: "var(--soft-amber)", color: "#92400E" },
  IN_PROGRESS: { background: "var(--soft-blue)", color: "#1E40AF" },
  RESOLVED: { background: "var(--soft-emerald)", color: "#047857" },
  CLOSED: { background: "var(--soft-slate)", color: "var(--text-secondary)" },
};

const th: CSSProperties = { padding: "11px 20px", textAlign: "left" };
const td: CSSProperties = { padding: "12px 20px", borderTop: "1px solid var(--border-default)" };

function Chip({ tone, children }: { tone?: { background: string; color: string }; children: React.ReactNode }) {
  return (
    <span style={{ ...chip, background: tone?.background ?? "var(--soft-slate)", color: tone?.color ?? "var(--text-secondary)" }}>
      {children}
    </span>
  );
}

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

      <div style={{ ...card, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              <th className="t-caption" style={th}>ID</th>
              <th className="t-caption" style={th}>Title</th>
              <th className="t-caption" style={th}>Priority</th>
              <th className="t-caption" style={th}>Severity</th>
              <th className="t-caption" style={th}>Status</th>
              <th className="t-caption" style={th}>SLA Due</th>
            </tr>
          </thead>
          <tbody>
            {cases.length === 0 && !fetchError ? (
              <tr>
                <td colSpan={6} style={{ ...td, textAlign: "center", padding: "48px 20px", color: "var(--text-tertiary)" }}>
                  No open cases
                </td>
              </tr>
            ) : (
              cases.map((c) => {
                const due = c.slaDueAt ? new Date(c.slaDueAt) : null;
                const slaRisk = isSlaAtRisk(c.slaDueAt);
                return (
                  <tr key={c.id}>
                    <td className="mono" style={{ ...td, color: "var(--text-tertiary)" }}>{c.id}</td>
                    <td style={{ ...td, color: "var(--text-primary)", maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {c.title}
                    </td>
                    <td style={td}>
                      <Chip tone={priorityChip[c.priority]}>{c.priority}</Chip>
                    </td>
                    <td style={td}>
                      <Chip tone={severityChip[c.severity]}>{c.severity}</Chip>
                    </td>
                    <td style={td}>
                      <Chip tone={statusChip[c.status]}>{c.status}</Chip>
                    </td>
                    <td
                      className="mono"
                      style={{
                        ...td,
                        fontSize: 12,
                        color: slaRisk ? "var(--sla-breached)" : "var(--text-secondary)",
                        fontWeight: slaRisk ? 600 : 400,
                      }}
                    >
                      {due ? due.toLocaleString() : "—"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
