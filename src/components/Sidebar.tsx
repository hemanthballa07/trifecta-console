"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const NAV = [
  {
    section: "Work",
    items: [
      { id: "/dashboard", label: "Dashboard", icon: "M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" },
      { id: "/fraud-feed", label: "Fraud Feed", live: true, icon: "M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" },
      { id: "/fraud-review", label: "Fraud Review", icon: "M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" },
      { id: "/cases", label: "Cases", icon: "M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0M12 12.75h.008v.008H12v-.008z" },
    ],
  },
  {
    section: "Investigate",
    items: [
      { id: "/rate-limits", label: "Rate Limits", icon: "M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" },
    ],
  },
];

function Icon({ path }: { path: string }) {
  return (
    <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d={path} />
    </svg>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      style={{
        width: collapsed ? 72 : 240,
        background: "var(--bg-sidebar)",
        borderRight: "1px solid var(--sidebar-border)",
        transition: "width 0.16s ease",
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        height: "100vh",
      }}
    >
      {/* Logo */}
      <div style={{ height: 56, display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "space-between", padding: collapsed ? 0 : "0 16px", flexShrink: 0 }}>
        {!collapsed && (
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ fontWeight: 700, fontSize: 18, color: "var(--text-on-dark)", letterSpacing: "-0.03em" }}>fluxa</span>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-on-dark-muted)" }}>Ops</span>
          </div>
        )}
        {collapsed && <span style={{ fontWeight: 700, fontSize: 20, color: "var(--text-on-dark)" }}>f</span>}
        {!collapsed && (
          <button onClick={() => setCollapsed(true)} aria-label="Collapse sidebar" style={{ background: "transparent", border: "none", color: "var(--text-on-dark-muted)", cursor: "pointer", padding: 4, borderRadius: 4, display: "grid", placeItems: "center" }}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
          </button>
        )}
        {collapsed && (
          <button onClick={() => setCollapsed(false)} aria-label="Expand sidebar" style={{ position: "absolute", left: 0, right: 0, top: 56, background: "transparent", border: "none", color: "var(--text-on-dark-muted)", cursor: "pointer", padding: "4px 0", display: "flex", justifyContent: "center" }}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="scroll-y" style={{ flex: 1, padding: "8px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
        {NAV.map((group) => (
          <div key={group.section} style={{ marginBottom: 8 }}>
            {!collapsed && (
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--sidebar-section)", padding: "6px 10px 4px" }}>
                {group.section}
              </div>
            )}
            {group.items.map((item) => {
              const active = pathname === item.id || pathname.startsWith(item.id + "/");
              return (
                <Link
                  key={item.id}
                  href={item.id}
                  title={collapsed ? item.label : undefined}
                  aria-current={active ? "page" : undefined}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: collapsed ? "9px 0" : "9px 10px",
                    justifyContent: collapsed ? "center" : "flex-start",
                    background: active ? "var(--bg-sidebar-active)" : "transparent",
                    color: active ? "var(--text-on-dark)" : "var(--text-on-dark-muted)",
                    borderRadius: "var(--radius-default)",
                    fontSize: 13.5,
                    fontWeight: active ? 600 : 500,
                    textDecoration: "none",
                    transition: "background 0.12s",
                    position: "relative",
                  }}
                  onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = "var(--bg-sidebar-hover)"; }}
                  onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  {active && <span style={{ position: "absolute", left: 0, top: 6, bottom: 6, width: 3, borderRadius: 3, background: "var(--brand-primary)" }} />}
                  <span style={{ color: active ? "var(--sidebar-active-icon)" : "var(--text-on-dark-muted)" }}>
                    <Icon path={item.icon} />
                  </span>
                  {!collapsed && <span style={{ flex: 1 }}>{item.label}</span>}
                  {!collapsed && item.live && (
                    <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--sla-healthy)" }}>
                      <span className="live-dot" />
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* User footer */}
      <div style={{ borderTop: "1px solid var(--sidebar-border)", padding: collapsed ? "10px 0" : "10px 12px", flexShrink: 0, display: "flex", alignItems: "center", gap: 10, justifyContent: collapsed ? "center" : "flex-start" }}>
        <span style={{ width: 30, height: 30, borderRadius: "50%", background: "#3730A3", color: "#C7D2FE", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>AB</span>
        {!collapsed && (
          <div style={{ lineHeight: 1.25, flex: 1, minWidth: 0 }}>
            <div style={{ color: "var(--text-on-dark)", fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Alex Brenner</div>
            <div style={{ color: "var(--text-on-dark-muted)", fontSize: 11.5 }}>Fraud Analyst</div>
          </div>
        )}
      </div>
    </aside>
  );
}
