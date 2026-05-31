"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchHeldTransactions, releaseTransaction, rejectTransaction } from "@/lib/api";
import type { Transaction } from "@/types";

export default function FraudReviewPage() {
  const [rows, setRows] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchHeldTransactions();
      setRows(res.content ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function act(txn: Transaction, action: "release" | "reject") {
    setBusy(txn.id);
    try {
      if (action === "release") await releaseTransaction(1, txn.id);
      else await rejectTransaction(1, txn.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Fraud Review</h1>
          <p className="text-slate-400 text-sm mt-0.5">HELD transactions — release or reject per row</p>
        </div>
        <button
          onClick={load}
          className="px-3 py-1.5 text-sm rounded bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-900/40 border border-red-700 rounded-lg px-4 py-3 text-red-300 text-sm">
          {error}
        </div>
      )}

      <div className="bg-slate-800 rounded-lg overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-slate-900 text-xs text-slate-400 uppercase tracking-wider">
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Merchant</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-500">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-500">No HELD transactions</td></tr>
            ) : rows.map((txn) => (
              <tr key={txn.id} className="border-t border-slate-700 hover:bg-slate-800/60">
                <td className="px-4 py-3 text-sm font-mono text-slate-300">{txn.id}</td>
                <td className="px-4 py-3 text-sm text-slate-300">{txn.type}</td>
                <td className="px-4 py-3 text-sm font-semibold text-amber-300">
                  {txn.currency} {txn.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-3 text-sm text-slate-300">{txn.merchant}</td>
                <td className="px-4 py-3 text-xs text-slate-400">
                  {new Date(txn.createdAt).toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button
                      onClick={() => act(txn, "release")}
                      disabled={busy === txn.id}
                      className="px-3 py-1 text-xs rounded bg-emerald-700 hover:bg-emerald-600 text-white disabled:opacity-50 transition-colors"
                    >
                      Release
                    </button>
                    <button
                      onClick={() => act(txn, "reject")}
                      disabled={busy === txn.id}
                      className="px-3 py-1 text-xs rounded bg-red-800 hover:bg-red-700 text-white disabled:opacity-50 transition-colors"
                    >
                      Reject
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
