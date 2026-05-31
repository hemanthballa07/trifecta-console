"use client";

import { useFraudStream } from "@/hooks/useFraudStream";
import type { FraudEvent } from "@/types";

const ruleColors: Record<string, string> = {
  amount_threshold: "bg-amber-900/50 text-amber-300 border-amber-700",
  velocity: "bg-red-900/50 text-red-300 border-red-700",
  blocked_merchant: "bg-orange-900/50 text-orange-300 border-orange-700",
  high_risk_currency: "bg-purple-900/50 text-purple-300 border-purple-700",
};

function RuleBadge({ rule }: { rule: string }) {
  const cls = ruleColors[rule] ?? "bg-slate-700 text-slate-300 border-slate-600";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-mono ${cls}`}>
      {rule}
    </span>
  );
}

function FraudRow({ fe }: { fe: FraudEvent }) {
  const ts = new Date(fe.flagged_at);
  return (
    <tr className="border-t border-slate-700 hover:bg-slate-800/60 transition-colors">
      <td className="px-4 py-3 text-xs text-slate-400 font-mono whitespace-nowrap">
        {ts.toLocaleTimeString()}
      </td>
      <td className="px-4 py-3 text-sm text-slate-200 font-mono">{fe.user_id}</td>
      <td className="px-4 py-3 text-sm text-slate-100 font-semibold whitespace-nowrap">
        {fe.currency} {fe.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
      </td>
      <td className="px-4 py-3 text-sm text-slate-300">{fe.merchant}</td>
      <td className="px-4 py-3"><RuleBadge rule={fe.rule_name} /></td>
      <td className="px-4 py-3 text-xs text-slate-500 max-w-xs truncate" title={fe.rule_value}>
        {fe.rule_value}
      </td>
    </tr>
  );
}

const statusDot: Record<string, string> = {
  connecting: "bg-yellow-400 animate-pulse",
  live: "bg-emerald-400 animate-pulse",
  error: "bg-red-500",
  closed: "bg-slate-500",
};

export default function FraudFeedPage() {
  const { events, status } = useFraudStream(50);

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Fraud Feed</h1>
          <p className="text-slate-400 text-sm mt-0.5">Live stream from Fluxa query service — SSE on :8083/fraud-events</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <span className={`w-2 h-2 rounded-full ${statusDot[status]}`} />
          <span className="capitalize">{status}</span>
          <span className="text-slate-600">·</span>
          <span>{events.length} events</span>
        </div>
      </div>

      <div className="bg-slate-800 rounded-lg overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-slate-900 text-xs text-slate-400 uppercase tracking-wider">
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Merchant</th>
              <th className="px-4 py-3">Rule</th>
              <th className="px-4 py-3">Detail</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                  {status === "connecting" ? "Connecting to Fluxa…" : "No fraud events yet"}
                </td>
              </tr>
            ) : (
              events.map((fe) => <FraudRow key={fe.flag_id} fe={fe} />)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
