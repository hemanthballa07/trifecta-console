import { fetchOpenCases } from "@/lib/api";
import type { SupportCase } from "@/types";

const priorityColor: Record<string, string> = {
  P1: "text-red-400 bg-red-900/40 border-red-700",
  P2: "text-amber-400 bg-amber-900/40 border-amber-700",
  P3: "text-slate-400 bg-slate-700 border-slate-600",
};

const severityColor: Record<string, string> = {
  CRITICAL: "text-red-300",
  HIGH: "text-orange-300",
  MEDIUM: "text-amber-300",
  LOW: "text-slate-400",
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
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-100">Cases</h1>
        <p className="text-slate-400 text-sm mt-0.5">Open support cases from BankOps — {cases.length} open</p>
      </div>

      {fetchError && (
        <div className="bg-red-900/40 border border-red-700 rounded-lg px-4 py-3 text-red-300 text-sm">
          {fetchError} — is bankops running on :8080?
        </div>
      )}

      <div className="bg-slate-800 rounded-lg overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-slate-900 text-xs text-slate-400 uppercase tracking-wider">
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Priority</th>
              <th className="px-4 py-3">Severity</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">SLA Due</th>
            </tr>
          </thead>
          <tbody>
            {cases.length === 0 && !fetchError ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-500">No open cases</td></tr>
            ) : cases.map((c) => {
              const due = c.slaDueAt ? new Date(c.slaDueAt) : null;
              const slaRisk = due && due.getTime() - Date.now() < 2 * 60 * 60 * 1000;
              return (
                <tr key={c.id} className="border-t border-slate-700 hover:bg-slate-800/60">
                  <td className="px-4 py-3 text-sm font-mono text-slate-400">{c.id}</td>
                  <td className="px-4 py-3 text-sm text-slate-200 max-w-xs truncate">{c.title}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded border text-xs font-mono ${priorityColor[c.priority] ?? "text-slate-400"}`}>
                      {c.priority}
                    </span>
                  </td>
                  <td className={`px-4 py-3 text-sm font-medium ${severityColor[c.severity] ?? "text-slate-400"}`}>
                    {c.severity}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-300">{c.status}</td>
                  <td className={`px-4 py-3 text-xs ${slaRisk ? "text-red-400 font-semibold" : "text-slate-400"}`}>
                    {due ? due.toLocaleString() : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
