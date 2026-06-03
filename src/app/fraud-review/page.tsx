"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useFraudStream } from "@/hooks/useFraudStream";
import { releaseTransaction, rejectTransaction, BANKOPS_BASE } from "@/lib/api";
import type { FraudEvent } from "@/types";

// ── Types ────────────────────────────────────────────────────────────────────

interface Signal {
  ruleId: string;
  ruleName: string;
  severity: "critical" | "high" | "medium" | "low";
  headline: string;
  thresholdLabel: string;
  evidence: { id: string; amount?: number; time: string; self?: boolean }[];
  updatedAgo: string;
}

// The console has no authenticated user; attribute decisions to the console
// itself so the BankOps audit timeline records provenance instead of null.
const CONSOLE_ACTOR = "trifecta-console";

interface HeldItem {
  id: string;
  accountId?: number;
  txnId: string;
  correlationId: string;
  amount: number;
  currency: string;
  merchant: string;
  ageMins: number;
  sla: "healthy" | "atrisk" | "breached";
  signals: Signal[];
  customer: { name: string; initials: string; acctMask: string };
  from: { label: string; sub: string };
  to: { label: string; sub: string };
  channel: string;
  device: string;
  ip: string;
  geo: { flag: string; city: string };
  related: { account: RelRow[]; ip: RelRow[]; merchant: RelRow[]; history: RelRow[] };
  priorityScore: number;
  unread?: boolean;
  _justArrived?: boolean;
}

interface RelRow { date: string; amount?: number; party: string; status: string }

// ── Constants ────────────────────────────────────────────────────────────────

const REASON_CODES = {
  reject: ["Confirmed fraud", "Suspicious activity — insufficient evidence to release", "Customer declined to verify", "Rule policy — auto-reject", "AML hold"],
  release: ["Customer verified", "False positive — confirmed legitimate", "Supervisor approved", "Duplicate hold cleared"],
};

const RULE_MAP: Record<string, { ruleName: string; severity: Signal["severity"]; ruleId: string }> = {
  amount_threshold: { ruleName: "Amount threshold exceeded", severity: "high", ruleId: "amt-001" },
  velocity: { ruleName: "Velocity exceeded", severity: "critical", ruleId: "vel-001" },
  blocked_merchant: { ruleName: "Merchant on watchlist", severity: "high", ruleId: "lst-001" },
  high_risk_currency: { ruleName: "High-risk currency", severity: "medium", ruleId: "cur-001" },
};

const SEV = {
  critical: { color: "var(--sev-critical)", soft: "var(--soft-critical)", label: "Critical" },
  high: { color: "var(--sev-high)", soft: "var(--soft-high)", label: "High" },
  medium: { color: "var(--sev-medium)", soft: "var(--soft-amber)", label: "Medium" },
  low: { color: "var(--sev-low)", soft: "var(--soft-slate)", label: "Low" },
};

const SLA_CFG = {
  healthy: { color: "var(--sla-healthy)", soft: "var(--soft-emerald)", label: "On track" },
  atrisk: { color: "var(--sla-atrisk)", soft: "var(--soft-amber)", label: "At risk" },
  breached: { color: "var(--sla-breached)", soft: "var(--soft-critical)", label: "Breached" },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function slaFromAge(m: number): HeldItem["sla"] {
  return m > 120 ? "breached" : m > 60 ? "atrisk" : "healthy";
}

function slaLabel(m: number) {
  return m >= 60 ? Math.floor(m / 60) + "h " + (m % 60) + "m" : m + "m";
}

function mapFraudEventsToSignals(events: FraudEvent[]): Signal[] {
  return events.map((fe) => {
    const cfg = RULE_MAP[fe.rule_name] ?? { ruleName: fe.rule_name, severity: "medium" as const, ruleId: "unknown" };
    const amtMatch = fe.rule_value.match(/amount=([\d.]+)/);
    const thrMatch = fe.rule_value.match(/threshold=([\d.]+)/);
    const cntMatch = fe.rule_value.match(/count=(\d+)/);
    const maxMatch = fe.rule_value.match(/max=(\d+)/);
    const headline =
      fe.rule_name === "amount_threshold" && amtMatch ? `${fmt(parseFloat(amtMatch[1]))} charged` :
      fe.rule_name === "velocity" && cntMatch ? `${cntMatch[1]} transactions in window` :
      fe.rule_name === "blocked_merchant" ? `Merchant "${fe.merchant}" flagged` :
      fe.rule_value;
    const threshold =
      fe.rule_name === "amount_threshold" && thrMatch ? `Threshold: ${fmt(parseFloat(thrMatch[1]))}` :
      fe.rule_name === "velocity" && maxMatch ? `Threshold: ${maxMatch[1]} per window` :
      fe.rule_value;
    return {
      ruleId: cfg.ruleId,
      ruleName: cfg.ruleName,
      severity: cfg.severity,
      headline,
      thresholdLabel: threshold,
      evidence: [{ id: fe.flag_id.slice(0, 8), time: new Date(fe.flagged_at).toLocaleTimeString(), self: true }],
      updatedAgo: "just now",
    };
  });
}

function initials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

// ── Mock data (design reference, used as fallback) ───────────────────────────

const MOCK_HELD: HeldItem[] = [
  {
    id: "h-1", txnId: "TXN-91182", correlationId: "1d00449f-5517-44aa-9a4c-abeda2924085",
    amount: 12450, currency: "USD", merchant: "QuickCart LLC", ageMins: 12,
    sla: "healthy", priorityScore: 92, unread: true,
    customer: { name: "Jane Doe", initials: "JD", acctMask: "••••4421" },
    from: { label: "Jane Doe", sub: "••••4421" }, to: { label: "QuickCart LLC", sub: "Merchant" },
    channel: "Card not present", device: "iOS 18 · Safari", ip: "198.51.100.42", geo: { flag: "🇺🇸", city: "Miami, FL" },
    signals: [
      { ruleId: "vel-001", ruleName: "Velocity exceeded", severity: "critical", headline: "5 transactions in 60s", thresholdLabel: "Threshold: 3 in 60s", updatedAgo: "3d ago",
        evidence: [{ id: "TXN-91180", amount: 120, time: "14:22:01" }, { id: "TXN-91181", amount: 340, time: "14:22:11" }, { id: "THIS TXN", amount: 12450, time: "14:22:33", self: true }] },
      { ruleId: "geo-014", ruleName: "Geo / IP mismatch", severity: "high", headline: "Charge 2,140 mi from home region", thresholdLabel: "Threshold: 500 mi from last known location", updatedAgo: "11d ago",
        evidence: [{ id: "Home region", time: "Chicago, IL" }, { id: "Charge origin", time: "Miami, FL" }, { id: "Last login", time: "Chicago · 38m ago" }] },
      { ruleId: "amt-007", ruleName: "Amount anomaly", severity: "medium", headline: "14× the 90-day average ticket", thresholdLabel: "Threshold: 8× rolling average", updatedAgo: "6d ago",
        evidence: [{ id: "90-day avg", amount: 889, time: "per txn" }, { id: "This charge", amount: 12450, time: "card-not-present", self: true }] },
    ],
    related: {
      account: [{ date: "May 28 · 14:22", amount: 12450, party: "QuickCart LLC", status: "HELD" }, { date: "May 28 · 09:11", amount: 84.2, party: "Blue Bottle Coffee", status: "Approved" }, { date: "May 27 · 19:48", amount: 1240, party: "Delta Air Lines", status: "Approved" }],
      ip: [{ date: "May 28 · 14:22", amount: 12450, party: "QuickCart LLC", status: "HELD" }, { date: "May 28 · 14:19", amount: 2100, party: "QuickCart LLC", status: "Pending" }],
      merchant: [{ date: "May 28 · 14:22", amount: 12450, party: "Jane Doe", status: "HELD" }, { date: "May 28 · 12:01", amount: 4900, party: "M. Okonkwo", status: "Rejected" }],
      history: [{ date: "Apr 2024", party: "Account opened", status: "Approved" }, { date: "Nov 2024", amount: 3400, party: "Dispute · resolved no-fraud", status: "Released" }],
    },
  },
  {
    id: "h-2", txnId: "TXN-88120", correlationId: "a2f81b3e-0011-44cc-8b30-1a2b3c4d5e6f",
    amount: 2975, currency: "USD", merchant: "DigiGoods", ageMins: 78,
    sla: "atrisk", priorityScore: 71,
    customer: { name: "Marcus O.", initials: "MO", acctMask: "••••8812" },
    from: { label: "Marcus O.", sub: "••••8812" }, to: { label: "DigiGoods", sub: "Merchant" },
    channel: "Online", device: "Android 14", ip: "203.0.113.5", geo: { flag: "🇺🇸", city: "Austin, TX" },
    signals: [
      { ruleId: "aml-009", ruleName: "Possible structuring", severity: "high", headline: "4 charges just under $3,000", thresholdLabel: "Threshold: 3+ charges within 5% of reporting limit", updatedAgo: "5d ago",
        evidence: [{ id: "TXN-88120", amount: 2950, time: "Mon 09:14" }, { id: "THIS TXN", amount: 2975, time: "Tue 09:03", self: true }] },
    ],
    related: { account: [], ip: [], merchant: [], history: [] },
  },
  {
    id: "h-3", txnId: "TXN-77001", correlationId: "c3d4e5f6-1122-44cc-9a3b-fedcba987654",
    amount: 850, currency: "USD", merchant: "SteamGames", ageMins: 145,
    sla: "breached", priorityScore: 55,
    customer: { name: "Yuki T.", initials: "YT", acctMask: "••••7700" },
    from: { label: "Yuki T.", sub: "••••7700" }, to: { label: "SteamGames", sub: "Merchant" },
    channel: "Card not present", device: "MacOS · Chrome", ip: "192.0.2.1", geo: { flag: "🇯🇵", city: "Tokyo" },
    signals: [
      { ruleId: "dev-003", ruleName: "Unrecognized device", severity: "medium", headline: "First charge from this device fingerprint", thresholdLabel: "Policy: step-up review for new device + amount > $500", updatedAgo: "2d ago",
        evidence: [{ id: "Device", time: "MacOS · Chrome · fp a9b3…" }, { id: "First seen", time: "3 min before charge" }] },
    ],
    related: { account: [], ip: [], merchant: [], history: [] },
  },
];

// ── Primitive components ──────────────────────────────────────────────────────

function Avatar({ initials: i, size = 32, tone = "slate" }: { initials: string; size?: number; tone?: "indigo" | "slate" | "amber" }) {
  const tones = { indigo: ["#E0E7FF", "#4338CA"], slate: ["#E2E8F0", "#334155"], amber: ["#FEF3C7", "#B45309"] };
  const [bg, fg] = tones[tone];
  return <span style={{ width: size, height: size, borderRadius: "50%", background: bg, color: fg, display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: size * 0.38, flexShrink: 0 }}>{i}</span>;
}

function Pill({ color, soft, children, size = "md" }: { color: string; soft: string; children: React.ReactNode; size?: "sm" | "md" }) {
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: size === "sm" ? "1px 7px" : "2px 9px", borderRadius: "var(--radius-chip)", background: soft, color, fontSize: size === "sm" ? 11 : 12, fontWeight: 600, whiteSpace: "nowrap" }}>{children}</span>;
}

function SLAChip({ sla, ageMins }: { sla: HeldItem["sla"]; ageMins: number }) {
  const c = SLA_CFG[sla];
  return <Pill color={c.color} soft={c.soft} size="sm"><span style={{ width: 5, height: 5, borderRadius: "50%", background: c.color }} />{slaLabel(ageMins)}</Pill>;
}

function SevBadge({ severity }: { severity: Signal["severity"] }) {
  const s = SEV[severity];
  return <Pill color={s.color} soft={s.soft} size="sm"><span style={{ width: 5, height: 5, borderRadius: "50%", background: s.color }} />{s.label}</Pill>;
}

function TxnBadge({ status }: { status: string }) {
  const map: Record<string, { color: string; soft: string }> = {
    HELD: { color: "var(--txn-held)", soft: "var(--soft-amber)" },
    Approved: { color: "var(--txn-approved)", soft: "var(--soft-emerald)" },
    Released: { color: "var(--txn-released)", soft: "var(--soft-blue)" },
    Rejected: { color: "var(--txn-rejected)", soft: "var(--soft-critical)" },
    Pending: { color: "var(--txn-pending)", soft: "var(--soft-slate)" },
  };
  const s = map[status] ?? map.Pending;
  return <Pill color={s.color} soft={s.soft} size="sm">{status}</Pill>;
}

// ── SignalCard ────────────────────────────────────────────────────────────────

function SignalCard({ signal }: { signal: Signal }) {
  const [open, setOpen] = useState(false);
  const s = SEV[signal.severity];
  return (
    <div style={{ border: "1px solid var(--border-default)", borderRadius: "var(--radius-card)", background: "var(--bg-surface)", borderLeft: `3px solid ${s.color}`, overflow: "hidden" }}>
      <div style={{ padding: "12px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
          <span className="t-caption" style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{signal.ruleName}</span>
          <SevBadge severity={signal.severity} />
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{signal.headline}</div>
        <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 10 }}>{signal.thresholdLabel}</div>
        <button onClick={() => setOpen((o) => !o)} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12.5, fontWeight: 600, color: "var(--brand-primary)", background: "transparent", border: "none", padding: 0, cursor: "pointer" }}>
          <svg style={{ width: 13, height: 13, transform: open ? "rotate(90deg)" : "none", transition: "transform 0.12s" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
          {signal.evidence.length} pieces of evidence
        </button>
        {open && (
          <ul style={{ listStyle: "none", margin: "8px 0 0", padding: 0 }}>
            {signal.evidence.map((e, i) => (
              <li key={i} style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "3px 0", fontSize: 12.5, color: e.self ? "var(--text-primary)" : "var(--text-secondary)", fontWeight: e.self ? 600 : 400 }}>
                <span style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--text-tertiary)", flexShrink: 0, marginTop: 5 }} />
                <span className="mono" style={{ color: e.self ? "var(--brand-primary)" : "var(--text-primary)", whiteSpace: "nowrap" }}>{e.id}</span>
                {e.amount != null && <span className="mono" style={{ color: "var(--text-secondary)" }}>({fmt(e.amount)})</span>}
                <span style={{ color: "var(--text-tertiary)", marginLeft: "auto", whiteSpace: "nowrap" }}>{e.time}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 14px", borderTop: "1px solid var(--border-default)", background: "var(--bg-canvas)", fontSize: 11.5, color: "var(--text-tertiary)" }}>
        <span className="mono">Rule {signal.ruleId}</span>
        <span>·</span>
        <span>Updated {signal.updatedAgo}</span>
      </div>
    </div>
  );
}

// ── TxnHeader ────────────────────────────────────────────────────────────────

function Copyable({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button onClick={() => { setDone(true); setTimeout(() => setDone(false), 1100); navigator.clipboard.writeText(text).catch(() => {}); }}
      style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "transparent", border: "none", padding: 0, color: "inherit", font: "inherit", cursor: "pointer" }}>
      <span className="mono">{text}</span>
      <svg style={{ width: 13, height: 13, color: done ? "var(--sla-healthy)" : "var(--text-tertiary)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        {done ? <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /> : <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />}
      </svg>
    </button>
  );
}

function MetaItem({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
      {icon}
      <span>{label}:</span>
      <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{value}</span>
    </div>
  );
}

function TxnHeader({ h }: { h: HeldItem }) {
  return (
    <div style={{ border: "1px solid var(--border-default)", borderRadius: "var(--radius-card)", background: "var(--bg-surface)", overflow: "hidden" }}>
      {/* top strip */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderBottom: "1px solid var(--border-default)", background: "var(--bg-canvas)", flexWrap: "wrap" }}>
        <span style={{ color: "var(--text-tertiary)", fontSize: 12 }}><Copyable text={h.txnId} /></span>
        <TxnBadge status="HELD" />
        <span style={{ color: "var(--text-tertiary)", fontSize: 12 }}>
          {Math.floor(h.ageMins / 60) > 0 ? `${Math.floor(h.ageMins / 60)}h ` : ""}{h.ageMins % 60}m ago
        </span>
        <div style={{ marginLeft: "auto", color: "var(--text-tertiary)", fontSize: 12, display: "inline-flex", gap: 6, alignItems: "center" }}>
          <span>corr</span>
          <Copyable text={h.correlationId.slice(0, 16) + "…"} />
        </div>
      </div>
      {/* hero */}
      <div style={{ display: "flex", gap: 24, padding: 16, flexWrap: "wrap" }}>
        <div style={{ minWidth: 180 }}>
          <div className="mono" style={{ fontSize: 34, fontWeight: 600, letterSpacing: "-0.01em", lineHeight: 1.1 }}>{fmt(h.amount)}</div>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>{h.currency} · {h.channel}</div>
        </div>
        <div style={{ flex: 1, minWidth: 240, display: "flex", flexDirection: "column", gap: 10, justifyContent: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="t-caption" style={{ width: 36 }}>From</span>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{h.from.label}</span>
            <span className="mono" style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{h.from.sub}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="t-caption" style={{ width: 36 }}>To</span>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{h.to.label}</span>
            <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{h.to.sub}</span>
          </div>
        </div>
      </div>
      {/* meta row */}
      <div style={{ display: "flex", gap: 18, padding: "10px 16px", borderTop: "1px solid var(--border-default)", flexWrap: "wrap" }}>
        <MetaItem label="Channel" value={h.channel} />
        <MetaItem label="Device" value={h.device} />
        <MetaItem label="IP" value={h.ip} />
        <MetaItem label="Geo" value={`${h.geo.flag} ${h.geo.city}`} />
      </div>
    </div>
  );
}

// ── Related context tabs ─────────────────────────────────────────────────────

const REL_TABS = [
  { id: "account" as const, label: "Same account" },
  { id: "ip" as const, label: "Same IP" },
  { id: "merchant" as const, label: "Same merchant" },
  { id: "history" as const, label: "Customer history" },
];

function RelatedContext({ h }: { h: HeldItem }) {
  const [tab, setTab] = useState<"account" | "ip" | "merchant" | "history">("account");
  const rows = h.related[tab];
  return (
    <div style={{ border: "1px solid var(--border-default)", borderRadius: "var(--radius-card)", background: "var(--bg-surface)", overflow: "hidden" }}>
      <div style={{ display: "flex", gap: 2, borderBottom: "1px solid var(--border-default)", padding: "0 8px" }}>
        {REL_TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: "10px 12px", fontSize: 13, fontWeight: tab === t.id ? 600 : 500, background: "transparent", border: "none", color: tab === t.id ? "var(--text-primary)" : "var(--text-secondary)", borderBottom: `2px solid ${tab === t.id ? "var(--brand-primary)" : "transparent"}`, marginBottom: -1, cursor: "pointer" }}>
            {t.label}
          </button>
        ))}
      </div>
      <div style={{ padding: 4 }}>
        {rows.length === 0 ? (
          <div style={{ padding: 20, textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>No related transactions.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr>{["Date", "Amount", "Counterparty", "Status"].map((c, i) => <th key={c} style={{ textAlign: i === 1 ? "right" : "left", padding: "6px 10px", color: "var(--text-tertiary)", fontWeight: 600, fontSize: 11, letterSpacing: "0.04em", textTransform: "uppercase", borderBottom: "1px solid var(--border-default)" }}>{c}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--border-default)" }}>
                  <td style={{ padding: "7px 10px", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{r.date}</td>
                  <td className="mono" style={{ padding: "7px 10px", textAlign: "right", fontWeight: 500 }}>{r.amount != null ? fmt(r.amount) : "—"}</td>
                  <td style={{ padding: "7px 10px" }}>{r.party}</td>
                  <td style={{ padding: "7px 10px" }}><TxnBadge status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Decision bar ─────────────────────────────────────────────────────────────

function Btn({ kind = "secondary", children, onClick, kbd }: { kind?: "primary" | "danger" | "secondary" | "tertiary" | "ghostDanger"; children: React.ReactNode; onClick: () => void; kbd?: string }) {
  const [hover, setHover] = useState(false);
  const styles = {
    primary: { bg: hover ? "var(--brand-primary-hover)" : "var(--brand-primary)", fg: "#fff", bd: "transparent" },
    danger: { bg: hover ? "#B91C1C" : "var(--sev-critical)", fg: "#fff", bd: "transparent" },
    secondary: { bg: hover ? "var(--bg-surface-2)" : "var(--bg-surface)", fg: "var(--text-primary)", bd: "var(--border-strong)" },
    tertiary: { bg: hover ? "var(--bg-surface-2)" : "transparent", fg: "var(--text-secondary)", bd: "transparent" },
    ghostDanger: { bg: hover ? "var(--soft-critical)" : "transparent", fg: "var(--sev-critical)", bd: "var(--border-default)" },
  }[kind];
  return (
    <button onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 36, padding: "0 14px", background: styles.bg, color: styles.fg, border: `1px solid ${styles.bd}`, borderRadius: "var(--radius-default)", fontSize: 13.5, fontWeight: 600, transition: "background 0.12s", whiteSpace: "nowrap", cursor: "pointer" }}>
      {children}
      {kbd && <span className="kbd" style={{ color: styles.fg, marginLeft: 2 }}>{kbd}</span>}
    </button>
  );
}

function DecisionBar({ onAction, stats }: { onAction: (a: string) => void; stats: { decided: number; avg: string } }) {
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, background: "var(--bg-surface)", borderTop: "1px solid var(--border-default)", boxShadow: "var(--shadow-up)", padding: "0 20px", height: 64, display: "flex", alignItems: "center", gap: 10, zIndex: 20 }}>
      <div style={{ fontSize: 12, color: "var(--text-tertiary)", lineHeight: 1.3, flexShrink: 0 }}>
        <div><strong style={{ color: "var(--text-primary)" }}>{stats.decided}</strong> decided today</div>
        <div>Avg {stats.avg}</div>
      </div>
      <div style={{ flex: 1 }} />
      <Btn kind="tertiary" kbd="N" onClick={() => onAction("note")}>Note</Btn>
      <Btn kind="tertiary" kbd="E" onClick={() => onAction("escalate")}>Escalate</Btn>
      <Btn kind="secondary" kbd="H" onClick={() => onAction("hold")}>Hold for verification</Btn>
      <Btn kind="ghostDanger" kbd="J" onClick={() => onAction("reject")}>Reject</Btn>
      <Btn kind="primary" kbd="R" onClick={() => onAction("release")}>Release</Btn>
    </div>
  );
}

// ── Decision modal ───────────────────────────────────────────────────────────

function DecisionModal({ type, h, onClose, onConfirm }: { type: string; h: HeldItem; onClose: () => void; onConfirm: (type: string, p: Record<string, string | boolean>) => void }) {
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [supervisor, setSupervisor] = useState(false);
  const [route, setRoute] = useState("Senior Analyst");
  const [channel, setChannel] = useState("SMS");

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  const bigRelease = type === "release" && h.amount > 10000;
  const codes = type === "reject" ? REASON_CODES.reject : REASON_CODES.release;
  const needReason = type === "reject" || bigRelease;
  const blocked = (needReason && !reason) || (type === "note" && !note.trim());

  const cfg: Record<string, { title: string; subtitle: string; confirm: string; kind: "primary" | "danger"; iconColor: string; iconSoft: string }> = {
    reject: { title: "Reject this transaction?", subtitle: "The charge is declined. This can't be undone.", confirm: "Reject", kind: "danger", iconColor: "var(--sev-critical)", iconSoft: "var(--soft-critical)" },
    release: { title: "Release this transaction?", subtitle: "The hold is cleared and the charge settles.", confirm: "Release", kind: "primary", iconColor: "var(--sla-healthy)", iconSoft: "var(--soft-emerald)" },
    escalate: { title: "Escalate this hold", subtitle: "Route to another reviewer. The hold stays open.", confirm: "Escalate", kind: "primary", iconColor: "var(--brand-primary)", iconSoft: "var(--brand-primary-soft)" },
    hold: { title: "Hold for customer verification", subtitle: "Reach out before deciding. The hold stays open.", confirm: "Send and hold", kind: "primary", iconColor: "var(--txn-released)", iconSoft: "var(--soft-blue)" },
    note: { title: "Add a note", subtitle: "Visible to other reviewers on this hold.", confirm: "Add note", kind: "primary", iconColor: "var(--text-secondary)", iconSoft: "var(--bg-surface-2)" },
  };
  const c = cfg[type] ?? cfg.note;

  const inp = { width: "100%", height: 38, padding: "0 11px", fontSize: 13.5, color: "var(--text-primary)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-default)", background: "var(--bg-surface)", outline: "none", fontFamily: "inherit" } as const;

  return (
    <div onMouseDown={onClose} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(15,23,42,0.45)", display: "grid", placeItems: "center", padding: 24 }}>
      <div onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal aria-label={c.title}
        style={{ width: 460, maxWidth: "100%", background: "var(--bg-surface)", borderRadius: "var(--radius-modal)", boxShadow: "var(--shadow-pop)", overflow: "hidden", animation: "flux-toast-in 0.16s ease-out" }}>
        {/* header */}
        <div style={{ display: "flex", gap: 12, padding: "18px 20px 14px" }}>
          <div style={{ width: 38, height: 38, borderRadius: 9, background: c.iconSoft, display: "grid", placeItems: "center", flexShrink: 0 }}>
            <div style={{ width: 20, height: 20, borderRadius: "50%", background: c.iconColor, opacity: 0.8 }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{c.title}</div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>{c.subtitle}</div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "var(--text-tertiary)", cursor: "pointer" }}>✕</button>
        </div>

        {/* body */}
        <div style={{ padding: "0 20px 18px" }}>
          {/* txn summary */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "var(--bg-canvas)", borderRadius: "var(--radius-default)", marginBottom: 16 }}>
            <Avatar initials={h.customer.initials} size={30} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{h.customer.name}</div>
              <div className="mono" style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{h.txnId}</div>
            </div>
            <div className="mono" style={{ fontSize: 16, fontWeight: 600 }}>{fmt(h.amount)}</div>
          </div>

          {(type === "reject" || type === "release") && (
            <label style={{ display: "block", marginBottom: 14 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>Reason code{needReason && <span style={{ color: "var(--sev-critical)", marginLeft: 3 }}>*</span>}</div>
              <select value={reason} onChange={(e) => setReason(e.target.value)} style={{ ...inp, appearance: "none" as const }}>
                <option value="">Select a reason…</option>
                {codes.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
          )}

          {bigRelease && (
            <div style={{ display: "flex", gap: 8, padding: "10px 12px", background: "var(--soft-amber)", border: "1px solid #FDE68A", borderRadius: "var(--radius-default)", marginBottom: 14, fontSize: 12.5, color: "#92400E" }}>
              ⚠️ Amount exceeds $10,000. Supervisor approval required.
            </div>
          )}
          {bigRelease && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={supervisor} onChange={(e) => setSupervisor(e.target.checked)} style={{ accentColor: "var(--brand-primary)", width: 15, height: 15 }} />
              Supervisor on shift has approved this release
            </label>
          )}

          {type === "escalate" && (
            <label style={{ display: "block", marginBottom: 14 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>Route to</div>
              <select value={route} onChange={(e) => setRoute(e.target.value)} style={{ ...inp, appearance: "none" as const }}>
                {["Senior Analyst", "Fraud Ops Manager", "Compliance"].map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
          )}

          {type === "hold" && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>Outreach channel</div>
              <div style={{ display: "flex", gap: 8 }}>
                {["SMS", "Call", "Email"].map((ch) => (
                  <button key={ch} onClick={() => setChannel(ch)} style={{ flex: 1, height: 36, borderRadius: "var(--radius-default)", fontSize: 13, fontWeight: 600, cursor: "pointer", border: `1px solid ${channel === ch ? "var(--brand-primary)" : "var(--border-default)"}`, background: channel === ch ? "var(--brand-primary-soft)" : "var(--bg-surface)", color: channel === ch ? "var(--brand-primary)" : "var(--text-secondary)" }}>
                    {ch}
                  </button>
                ))}
              </div>
            </div>
          )}

          <label style={{ display: "block" }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>
              {type === "note" ? <>Note <span style={{ color: "var(--sev-critical)" }}>*</span></> : "Notes (optional)"}
            </div>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3}
              placeholder={type === "hold" ? "Customer will receive a verification request…" : "Add context for the audit trail…"}
              style={{ ...inp, height: "auto", padding: "9px 11px", resize: "vertical", lineHeight: 1.5 }} />
          </label>
        </div>

        {/* footer */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "14px 20px", borderTop: "1px solid var(--border-default)", background: "var(--bg-canvas)" }}>
          <button onClick={onClose} style={{ height: 36, padding: "0 14px", borderRadius: "var(--radius-default)", fontSize: 13.5, fontWeight: 600, border: "1px solid var(--border-strong)", background: "var(--bg-surface)", color: "var(--text-primary)", cursor: "pointer" }}>Cancel</button>
          <button disabled={blocked} onClick={() => onConfirm(type, { reason, note, supervisor: String(supervisor), route, channel })}
            style={{ height: 36, padding: "0 16px", borderRadius: "var(--radius-default)", fontSize: 13.5, fontWeight: 600, border: "none", background: blocked ? "var(--border-strong)" : (c.kind === "danger" ? "var(--sev-critical)" : "var(--brand-primary)"), color: "#fff", cursor: blocked ? "not-allowed" : "pointer" }}>
            {c.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Toast ────────────────────────────────────────────────────────────────────

function Toast({ toast, onDismiss, onOpen }: { toast: { kind: "newhold" | "done"; title: string; body: string; _id?: string } | null; onDismiss: () => void; onOpen: () => void }) {
  if (!toast) return null;
  return (
    <div style={{ position: "fixed", top: 68, right: 20, zIndex: 300, width: 320, background: "var(--bg-surface)", borderRadius: "var(--radius-card)", boxShadow: "var(--shadow-pop)", border: "1px solid var(--border-default)", padding: 14, display: "flex", gap: 11, animation: "flux-toast-in 0.2s ease-out" }}>
      <div style={{ width: 32, height: 32, borderRadius: 8, background: toast.kind === "newhold" ? "var(--soft-high)" : "var(--soft-emerald)", display: "grid", placeItems: "center", flexShrink: 0, fontSize: 16 }}>
        {toast.kind === "newhold" ? "🔔" : "✓"}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>{toast.title}</div>
        <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 1 }}>{toast.body}</div>
        {toast.kind === "newhold" && (
          <button onClick={onOpen} style={{ marginTop: 8, fontSize: 12.5, fontWeight: 600, color: "var(--brand-primary)", background: "transparent", border: "none", padding: 0, cursor: "pointer" }}>Review now →</button>
        )}
      </div>
      <button onClick={onDismiss} style={{ background: "transparent", border: "none", color: "var(--text-tertiary)", cursor: "pointer", height: 18 }}>✕</button>
    </div>
  );
}

// ── Queue pane ───────────────────────────────────────────────────────────────

type FilterKey = "amount" | "rule" | "age";
const FILTER_DEFS: { key: FilterKey; label: string; opts: string[] }[] = [
  { key: "amount", label: "Amount", opts: ["Any", "< $1k", "$1k–$10k", "> $10k"] },
  { key: "rule", label: "Rule", opts: ["Any", "Critical", "High", "Medium"] },
  { key: "age", label: "Age", opts: ["Any", "Breached", "At risk", "On track"] },
];

function topSev(signals: Signal[]): Signal["severity"] {
  const order = { critical: 3, high: 2, medium: 1, low: 0 };
  return signals.reduce((t, s) => (order[s.severity] > order[t] ? s.severity : t), "low" as Signal["severity"]);
}

function QueuePane({ items, selectedId, onSelect, checked, onCheck, onCheckAll, sort, onSort, query, onQuery }: {
  items: HeldItem[]; selectedId: string | null; onSelect: (id: string) => void;
  checked: string[]; onCheck: (id: string) => void; onCheckAll: () => void;
  sort: string; onSort: (s: string) => void; query: string; onQuery: (q: string) => void;
}) {
  const [filters, setFilters] = useState<Record<FilterKey, string>>({ amount: "Any", rule: "Any", age: "Any" });
  const [openFilter, setOpenFilter] = useState<FilterKey | null>(null);
  const [showSort, setShowSort] = useState(false);

  const pass = (h: HeldItem) => {
    if (filters.amount === "< $1k" && h.amount >= 1000) return false;
    if (filters.amount === "$1k–$10k" && (h.amount < 1000 || h.amount > 10000)) return false;
    if (filters.amount === "> $10k" && h.amount <= 10000) return false;
    if (filters.rule !== "Any" && topSev(h.signals) !== filters.rule.toLowerCase()) return false;
    if (filters.age === "Breached" && h.sla !== "breached") return false;
    if (filters.age === "At risk" && h.sla !== "atrisk") return false;
    if (filters.age === "On track" && h.sla !== "healthy") return false;
    return true;
  };
  const shown = items.filter(pass);
  const totalVal = shown.reduce((a, h) => a + h.amount, 0);
  const anyChecked = checked.length > 0;

  const sorts = { priority: "Priority", age: "Age (oldest)", amount: "Amount (high)" };

  return (
    <section aria-label="HELD queue" style={{ width: 332, flexShrink: 0, background: "var(--bg-surface)", borderRight: "1px solid var(--border-default)", display: "flex", flexDirection: "column", height: "100%" }}>
      {/* header */}
      <div style={{ padding: "12px 14px 10px", borderBottom: "1px solid var(--border-default)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Holds</h2>
          <span className="live-dot" title="Live" />
        </div>
        {/* search */}
        <div style={{ position: "relative", marginBottom: 9 }}>
          <svg style={{ position: "absolute", left: 9, top: 9, width: 15, height: 15, color: "var(--text-tertiary)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
          <input value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Customer, account, txn ID…" aria-label="Search queue"
            style={{ width: "100%", height: 32, padding: "0 10px 0 30px", fontSize: 13, border: "1px solid var(--border-default)", borderRadius: "var(--radius-default)", background: "var(--bg-canvas)", outline: "none", color: "var(--text-primary)", fontFamily: "inherit" }} />
        </div>
        {/* filters */}
        <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
          {FILTER_DEFS.map((fd) => {
            const active = filters[fd.key] !== "Any";
            return (
              <div key={fd.key} style={{ position: "relative" }}>
                <button onClick={() => setOpenFilter(openFilter === fd.key ? null : fd.key)}
                  style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "5px 10px", fontSize: 12, fontWeight: 500, borderRadius: "var(--radius-default)", border: `1px solid ${active ? "var(--brand-primary)" : "var(--border-default)"}`, background: active ? "var(--brand-primary-soft)" : "var(--bg-surface)", color: active ? "var(--brand-primary)" : "var(--text-secondary)", cursor: "pointer", whiteSpace: "nowrap" }}>
                  {fd.label}: <span style={{ fontWeight: 600 }}>{filters[fd.key]}</span>
                  <svg style={{ width: 12, height: 12 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                </button>
                {openFilter === fd.key && (
                  <div style={{ position: "absolute", top: 32, left: 0, zIndex: 30, background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-default)", boxShadow: "var(--shadow-pop)", padding: 4, minWidth: 140 }}>
                    {fd.opts.map((o) => (
                      <button key={o} onClick={() => { setFilters((f) => ({ ...f, [fd.key]: o })); setOpenFilter(null); }}
                        style={{ display: "flex", width: "100%", alignItems: "center", gap: 8, padding: "7px 10px", fontSize: 13, textAlign: "left", background: filters[fd.key] === o ? "var(--brand-primary-soft)" : "transparent", border: "none", borderRadius: 5, color: filters[fd.key] === o ? "var(--brand-primary)" : "var(--text-primary)", fontWeight: filters[fd.key] === o ? 600 : 400, cursor: "pointer" }}>
                        {o}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {/* sort + select-all */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ position: "relative" }}>
            <button onClick={() => setShowSort((s) => !s)} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", background: "transparent", border: "none", cursor: "pointer" }}>
              ↕ Sort: <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{sorts[sort as keyof typeof sorts]}</span>
            </button>
            {showSort && (
              <div style={{ position: "absolute", top: 24, left: 0, zIndex: 30, background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-default)", boxShadow: "var(--shadow-pop)", padding: 4, minWidth: 160 }}>
                {Object.entries(sorts).map(([k, v]) => (
                  <button key={k} onClick={() => { onSort(k); setShowSort(false); }}
                    style={{ display: "flex", width: "100%", alignItems: "center", gap: 8, padding: "7px 9px", fontSize: 13, background: sort === k ? "var(--brand-primary-soft)" : "transparent", border: "none", borderRadius: 5, color: sort === k ? "var(--brand-primary)" : "var(--text-primary)", fontWeight: sort === k ? 600 : 400, cursor: "pointer" }}>
                    {v}
                  </button>
                ))}
              </div>
            )}
          </div>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-secondary)", cursor: "pointer" }}>
            <input type="checkbox" checked={anyChecked && checked.length === shown.length} onChange={onCheckAll}
              ref={(el) => { if (el) el.indeterminate = anyChecked && checked.length < shown.length; }}
              style={{ accentColor: "var(--brand-primary)", width: 14, height: 14 }} />
            Select all
          </label>
        </div>
      </div>

      {/* batch bar */}
      {anyChecked && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: "var(--brand-primary-soft)", borderBottom: "1px solid var(--border-default)", fontSize: 12.5, color: "var(--brand-primary)", fontWeight: 600 }}>
          {checked.length} selected
          <div style={{ flex: 1 }} />
          <button style={{ fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: "var(--radius-default)", border: "1px solid var(--brand-primary)", background: "var(--bg-surface)", color: "var(--brand-primary)", cursor: "pointer" }}>Release</button>
          <button style={{ fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: "var(--radius-default)", border: "1px solid var(--sev-critical)", background: "var(--bg-surface)", color: "var(--sev-critical)", cursor: "pointer" }}>Reject</button>
        </div>
      )}

      {/* list */}
      <div className="scroll-y" role="listbox" aria-label="Holds" style={{ flex: 1 }}>
        {shown.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, height: "100%", padding: 32, textAlign: "center" }}>
            <div style={{ width: 52, height: 52, borderRadius: "50%", background: "var(--soft-emerald)", display: "grid", placeItems: "center", fontSize: 28 }}>✓✓</div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>All clear</div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", maxWidth: 220 }}>No holds to review. When Fluxa flags a transaction it will appear here.</div>
          </div>
        ) : (
          shown.map((h) => {
            const selected = h.id === selectedId;
            const sev = topSev(h.signals);
            const sevCfg = SEV[sev];
            return (
              <div key={h.id} onClick={() => onSelect(h.id)} role="option" aria-selected={selected}
                style={{ display: "flex", gap: 10, padding: "12px 14px 12px 11px", borderLeft: `3px solid ${selected ? "var(--brand-primary)" : "transparent"}`, borderBottom: "1px solid var(--border-default)", background: selected ? "var(--brand-primary-soft)" : "var(--bg-surface)", cursor: "pointer", minHeight: 88, alignItems: "flex-start", animation: h._justArrived ? "flux-highlight 1.6s ease-out" : undefined }}
                onMouseEnter={(e) => { if (!selected) (e.currentTarget as HTMLElement).style.background = "var(--bg-surface-2)"; }}
                onMouseLeave={(e) => { if (!selected) (e.currentTarget as HTMLElement).style.background = "var(--bg-surface)"; }}>
                <input type="checkbox" checked={checked.includes(h.id)} onClick={(e) => e.stopPropagation()} onChange={() => onCheck(h.id)}
                  style={{ marginTop: 3, accentColor: "var(--brand-primary)", width: 15, height: 15 }} />
                <Avatar initials={h.customer.initials} size={34} tone={h.sla === "breached" ? "amber" : "slate"} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                    {h.unread && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--brand-primary)", flexShrink: 0 }} />}
                    <span style={{ fontWeight: 600, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{h.customer.name}</span>
                    <span className="mono" style={{ fontWeight: 600, fontSize: 14 }}>{fmt(h.amount)}</span>
                  </div>
                  <div className="mono" style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 2, display: "flex", gap: 8, whiteSpace: "nowrap" }}>
                    <span>{h.txnId}</span><span>·</span><span>{h.customer.acctMask}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 7, flexWrap: "wrap" }}>
                    <SLAChip sla={h.sla} ageMins={h.ageMins} />
                    <Pill color={sevCfg.color} soft={sevCfg.soft} size="sm">
                      <span style={{ width: 5, height: 5, borderRadius: "50%", background: sevCfg.color }} />
                      {h.signals.length} {h.signals.length === 1 ? "rule" : "rules"}
                    </Pill>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* footer */}
      <div style={{ padding: "10px 14px", borderTop: "1px solid var(--border-default)", flexShrink: 0, fontSize: 12.5, color: "var(--text-secondary)", display: "flex", justifyContent: "space-between", background: "var(--bg-surface)" }}>
        <span><strong style={{ color: "var(--text-primary)" }}>{shown.length}</strong> holds</span>
        <span className="mono">{fmt(totalVal)} total</span>
      </div>
    </section>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function FraudReviewPage() {
  const { events } = useFraudStream(100);
  const [helds, setHelds] = useState<HeldItem[]>(MOCK_HELD);
  const [selectedId, setSelectedId] = useState<string | null>(MOCK_HELD[0]?.id ?? null);
  const [checked, setChecked] = useState<string[]>([]);
  const [sort, setSort] = useState("priority");
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: "newhold" | "done"; title: string; body: string; _id?: string } | null>(null);
  const [stats] = useState({ decided: 23, avg: "1m 42s" });
  const [loading, setLoading] = useState(true);

  // Try to load real HELD transactions from bankops
  useEffect(() => {
    fetch(`${BANKOPS_BASE}/transactions?status=HELD`, { cache: "no-store" })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data) return;
        const txns: { id: number; accountId?: number; amount: number; currency?: string; merchant?: string; createdAt: string; correlationId?: string }[] = data.content ?? data;
        if (!txns || txns.length === 0) return;
        const mapped: HeldItem[] = txns.map((txn) => {
          const corrId = txn.correlationId ?? String(txn.id);
          const ageMins = Math.floor((Date.now() - new Date(txn.createdAt).getTime()) / 60000);
          // signals are enriched from live SSE events at render time (see enrichedHelds)
          const signals: Signal[] = [];
          const name = `Account ${txn.id}`;
          return {
            id: String(txn.id), accountId: txn.accountId ?? 1, txnId: `TXN-${txn.id}`, correlationId: corrId,
            amount: txn.amount, currency: txn.currency ?? "USD", merchant: txn.merchant ?? "—",
            ageMins, sla: slaFromAge(ageMins), signals, priorityScore: signals.length * 20 + Math.min(ageMins, 60),
            customer: { name, initials: initials(name), acctMask: `••••${String(txn.id % 10000).padStart(4, "0")}` },
            from: { label: name, sub: `••••${String(txn.id % 10000).padStart(4, "0")}` },
            to: { label: txn.merchant ?? "—", sub: "Merchant" },
            channel: "Card not present", device: "—", ip: "—", geo: { flag: "🇺🇸", city: "—" },
            related: { account: [], ip: [], merchant: [], history: [] },
          };
        });
        setHelds(mapped);
        setSelectedId(mapped[0]?.id ?? null);
      })
      .catch(() => {}) // Keep mock data on error
      .finally(() => setLoading(false));
  }, []);

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), toast.kind === "newhold" ? 6000 : 3200);
    return () => clearTimeout(id);
  }, [toast]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || modal) return;
      if (e.key === "r" || e.key === "R") setModal("release");
      else if (e.key === "j" || e.key === "J") setModal("reject");
      else if (e.key === "e" || e.key === "E") setModal("escalate");
      else if (e.key === "h" || e.key === "H") setModal("hold");
      else if (e.key === "n" || e.key === "N") setModal("note");
      else if (e.key === "Escape") setModal(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modal]);

  // Enrich each hold's signals from live SSE events (by correlation_id) — derived, not stateful.
  const enrichedHelds = useMemo(() => {
    if (events.length === 0) return helds;
    const sigsByCorr = new Map<string, FraudEvent[]>();
    events.forEach((fe) => {
      if (!sigsByCorr.has(fe.correlation_id)) sigsByCorr.set(fe.correlation_id, []);
      sigsByCorr.get(fe.correlation_id)!.push(fe);
    });
    return helds.map((h) => {
      const fresh = sigsByCorr.get(h.correlationId);
      if (!fresh || fresh.length === 0) return h;
      const signals = mapFraudEventsToSignals(fresh);
      return { ...h, signals, priorityScore: signals.length * 20 + Math.min(h.ageMins, 60) };
    });
  }, [helds, events]);

  const visible = useMemo(() => {
    let list = enrichedHelds.slice();
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((h) => h.customer.name.toLowerCase().includes(q) || h.txnId.toLowerCase().includes(q) || h.customer.acctMask.includes(q));
    const cmp = { priority: (a: HeldItem, b: HeldItem) => b.priorityScore - a.priorityScore, age: (a: HeldItem, b: HeldItem) => b.ageMins - a.ageMins, amount: (a: HeldItem, b: HeldItem) => b.amount - a.amount }[sort];
    return cmp ? list.sort(cmp) : list;
  }, [enrichedHelds, query, sort]);

  const selected = visible.find((h) => h.id === selectedId) ?? visible[0] ?? null;

  const onSelect = useCallback((id: string) => {
    setSelectedId(id);
    setHelds((prev) => prev.map((h) => (h.id === id ? { ...h, unread: false } : h)));
  }, []);

  const onConfirm = useCallback((type: string, payload: Record<string, string | boolean>) => {
    if (!selected) return;
    setModal(null);
    if (type === "release") {
      const notes = typeof payload.note === "string" && payload.note.trim() ? payload.note.trim() : undefined;
      releaseTransaction(selected.accountId ?? 1, parseInt(selected.id), { actorId: CONSOLE_ACTOR, notes }).catch(() => {});
      setHelds((prev) => prev.filter((h) => h.id !== selected.id));
      setToast({ kind: "done", title: "Transaction released", body: `${selected.txnId} · customer notified.` });
    } else if (type === "reject") {
      const notes = [payload.reason, payload.note]
        .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
        .join(" — ") || undefined;
      rejectTransaction(selected.accountId ?? 1, parseInt(selected.id), { actorId: CONSOLE_ACTOR, notes }).catch(() => {});
      setHelds((prev) => prev.filter((h) => h.id !== selected.id));
      setToast({ kind: "done", title: "Transaction rejected", body: `${selected.txnId} · ${payload.reason || "reason logged"}.` });
    } else if (type === "escalate") {
      setToast({ kind: "done", title: "Hold escalated", body: `Routed to ${payload.route}.` });
    } else if (type === "hold") {
      setToast({ kind: "done", title: "Verification sent", body: `${payload.channel} request sent to ${selected.customer.name.split(" ")[0]}.` });
    } else if (type === "note") {
      setToast({ kind: "done", title: "Note added", body: `Saved to ${selected.txnId}.` });
    }
  }, [selected]);

  const onCheck = useCallback((id: string) => setChecked((c) => c.includes(id) ? c.filter((x) => x !== id) : [...c, id]), []);
  const onCheckAll = useCallback(() => setChecked((c) => c.length === visible.length ? [] : visible.map((h) => h.id)), [visible]);

  return (
    <div style={{ display: "flex", height: "100%", minHeight: 0, position: "relative", background: "var(--bg-canvas)" }}>
      <QueuePane items={visible} selectedId={selected?.id ?? null} onSelect={onSelect} checked={checked} onCheck={onCheck} onCheckAll={onCheckAll} sort={sort} onSort={setSort} query={query} onQuery={setQuery} />

      {selected ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, position: "relative", background: "var(--bg-canvas)" }}>
          {/* scrollable detail */}
          <div className="scroll-y" style={{ flex: 1, padding: "16px 20px 88px", minWidth: 0 }}>
            {loading && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", marginBottom: 14, borderRadius: "var(--radius-card)", background: "var(--soft-blue)", border: "1px solid #BFDBFE", color: "#1E40AF", fontSize: 13 }}>
                Loading live HELD transactions from BankOps…
              </div>
            )}
            <TxnHeader h={selected} />
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "20px 0 12px" }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Why this was held</h3>
              <span style={{ fontSize: 13, color: "var(--text-tertiary)", fontWeight: 500 }}>({selected.signals.length} signals)</span>
            </div>
            {selected.signals.length === 0 ? (
              <div style={{ padding: 20, textAlign: "center", color: "var(--text-tertiary)", fontSize: 13, border: "1px solid var(--border-default)", borderRadius: "var(--radius-card)", background: "var(--bg-surface)" }}>
                No fraud signals — Fluxa may not have evaluated this transaction yet.
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
                {selected.signals.map((s, i) => <SignalCard key={s.ruleId + i} signal={s} />)}
              </div>
            )}
            <div style={{ margin: "20px 0 12px" }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Related context</h3>
            </div>
            <RelatedContext h={selected} />
          </div>
          <DecisionBar onAction={setModal} stats={stats} />
        </div>
      ) : (
        <div style={{ flex: 1, display: "grid", placeItems: "center", background: "var(--bg-canvas)" }}>
          <div style={{ textAlign: "center", maxWidth: 320 }}>
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--soft-emerald)", display: "grid", placeItems: "center", margin: "0 auto 16px", fontSize: 32 }}>✓✓</div>
            <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 6 }}>All clear</div>
            <div style={{ fontSize: 14, color: "var(--text-secondary)" }}>No holds to review. When Fluxa flags a transaction it will appear here.</div>
          </div>
        </div>
      )}

      {modal && selected && <DecisionModal type={modal} h={selected} onClose={() => setModal(null)} onConfirm={onConfirm} />}
      <Toast toast={toast} onDismiss={() => setToast(null)} onOpen={() => { if (toast?._id) onSelect(toast._id); setToast(null); }} />
    </div>
  );
}
