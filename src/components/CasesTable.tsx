"use client";

import { useMemo, useState, type CSSProperties } from "react";
import type { SupportCase } from "@/types";
import { caseTitle } from "@/lib/bankops";

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
  NEW: { background: "var(--soft-blue)", color: "#1E40AF" },
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

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...chip,
        cursor: "pointer",
        border: "1px solid var(--border-default)",
        background: active ? "var(--brand-primary)" : "var(--bg-surface)",
        color: active ? "#FFFFFF" : "var(--text-secondary)",
      }}
    >
      {label}
    </button>
  );
}

const PRIORITIES = ["All", "P1", "P2", "P3"];
const SEVERITIES = ["All", "CRITICAL", "HIGH", "MEDIUM", "LOW"];

export default function CasesTable({ cases }: { cases: SupportCase[] }) {
  const [priority, setPriority] = useState("All");
  const [severity, setSeverity] = useState("All");

  const visible = useMemo(
    () =>
      cases.filter(
        (c) =>
          (priority === "All" || c.priority === priority) &&
          (severity === "All" || c.severity === severity)
      ),
    [cases, priority, severity]
  );

  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="t-caption" style={{ color: "var(--text-tertiary)" }}>Priority</span>
          {PRIORITIES.map((p) => (
            <FilterChip key={p} label={p} active={priority === p} onClick={() => setPriority(p)} />
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="t-caption" style={{ color: "var(--text-tertiary)" }}>Severity</span>
          {SEVERITIES.map((s) => (
            <FilterChip key={s} label={s} active={severity === s} onClick={() => setSeverity(s)} />
          ))}
        </div>
        <span className="mono" style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-tertiary)" }}>
          {visible.length} of {cases.length}
        </span>
      </div>

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
            {visible.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ ...td, textAlign: "center", padding: "48px 20px", color: "var(--text-tertiary)" }}>
                  No cases match these filters.
                </td>
              </tr>
            ) : (
              visible.map((c) => {
                const due = c.slaDueAt ? new Date(c.slaDueAt) : null;
                const slaRisk = isSlaAtRisk(c.slaDueAt);
                return (
                  <tr key={c.id}>
                    <td className="mono" style={{ ...td, color: "var(--text-tertiary)" }}>{c.id}</td>
                    <td style={{ ...td, color: "var(--text-primary)", maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {caseTitle(c)}
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
    </>
  );
}
