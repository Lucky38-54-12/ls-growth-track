"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, Phone, Calendar, Sun, ScanSearch, Settings, Bot, Zap, Rows3, PhoneCall, Menu, X, LineChart, ListChecks, Brain, CheckCheck, Target, KeyRound, ClipboardList, Users, Handshake,
} from "lucide-react";

const NAV = [
  { href: "/dashboard/brain", label: "Brain", icon: Brain },
  { href: "/dashboard/approvals", label: "Approvals", icon: CheckCheck },
  { href: "/dashboard/operator", label: "Operator", icon: ClipboardList },
  { href: "/dashboard/today", label: "Today", icon: Sun },
  { href: "/dashboard", label: "Pipeline", icon: LayoutDashboard },
  { href: "/dashboard/clients", label: "Clients", icon: Users },
  { href: "/dashboard/email-outreach", label: "Email Outreach", icon: Rows3 },
  { href: "/dashboard/lead-qual", label: "Onboarding", icon: Bot },
  { href: "/dashboard/campaign-setup", label: "Campaign Setup", icon: Target },
  { href: "/dashboard/sales-calls", label: "Sales", icon: PhoneCall },
  { href: "/dashboard/onboarding", label: "Client Onboarding", icon: Handshake },
  { href: "/dashboard/automations", label: "Automations", icon: Zap },
  { href: "/dashboard/calendar", label: "Calendar", icon: Calendar },
  { href: "/dashboard/call-queue", label: "Call Queue", icon: ListChecks },
  { href: "/dashboard/cold-call", label: "Cold Call", icon: Phone },
  { href: "/dashboard/scraper", label: "Scraper", icon: ScanSearch },
  { href: "/dashboard/meta-ads", label: "Meta Ads", icon: LineChart },
  { href: "/dashboard/api-usage", label: "API Usage", icon: KeyRound },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function Sidebar() {
  const path = usePathname();
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    setNavOpen(false);
  }, [path]);

  if (path?.startsWith("/results") || path?.startsWith("/login") || path?.startsWith("/connect") || path?.startsWith("/portal")) return null;

  return (
    <>
      {/* Mobile top bar — hidden on desktop, see .dashboard-topbar in globals.css */}
      <div
        className="dashboard-topbar"
        style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 30, alignItems: "center", justifyContent: "space-between", padding: "14px 16px", background: "#fff", borderBottom: "1px solid #e6eaf0" }}
      >
        <img src="/logo.png" alt="LS Growth" style={{ height: 26, width: "auto", objectFit: "contain" }} />
        <button
          type="button"
          onClick={() => setNavOpen((v) => !v)}
          aria-label={navOpen ? "Close menu" : "Open menu"}
          style={{ background: "none", border: "none", cursor: "pointer", color: "#0f172a", padding: 4, display: "flex" }}
        >
          {navOpen ? <X style={{ width: 22, height: 22 }} /> : <Menu style={{ width: 22, height: 22 }} />}
        </button>
      </div>

      <div className={`dashboard-backdrop${navOpen ? " is-open" : ""}`} onClick={() => setNavOpen(false)} />

      <div className={`dashboard-sidebar${navOpen ? " is-open" : ""}`} style={{
        width: 224, flexShrink: 0, background: "#fff", borderRight: "1px solid #e6eaf0",
        display: "flex", flexDirection: "column", minHeight: "100vh",
        boxShadow: "1px 0 0 rgba(15,23,42,0.02), 4px 0 16px rgba(15,23,42,0.03)",
      }}>
        {/* Brand */}
        <div style={{ height: 64, display: "flex", alignItems: "center", gap: 10, padding: "0 16px", borderBottom: "1px solid #e6eaf0" }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, #fff 0%, var(--accent-tint) 100%)",
            border: "1px solid #d6ecfb", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <img src="/logo.png" alt="LS Growth" style={{ width: 22, height: 22, objectFit: "contain" }} />
          </div>
          <div>
            <div style={{ fontWeight: 900, fontSize: 13, letterSpacing: "0.03em", lineHeight: 1, color: "#0f172a", textTransform: "uppercase" }}>
              L&amp;S Growth
            </div>
            <div style={{ fontSize: 10, color: "var(--accent)", fontWeight: 600, letterSpacing: "0.04em", marginTop: 3 }}>Outreach Agency</div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "14px 10px", overflowY: "auto" }}>
          <p style={{ padding: "4px 10px 10px", fontSize: 9, fontWeight: 700, color: "#94a3b8", letterSpacing: "0.15em", textTransform: "uppercase" }}>Menu</p>
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = path === href || (href !== "/dashboard" && path.startsWith(href));
            return (
              <Link key={href} href={href} className={active ? "" : "nav-link-light"} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "9px 10px",
                fontSize: 13, fontWeight: active ? 700 : 500,
                background: active ? "linear-gradient(135deg, var(--accent-tint) 0%, #f5fbff 100%)" : "transparent",
                color: active ? "var(--accent)" : "#475569",
                borderRadius: 8,
                boxShadow: active ? "0 1px 3px rgba(0,128,224,0.12)" : "none",
                marginBottom: 2, textDecoration: "none",
                transition: "all 0.15s",
              }}>
                <Icon style={{ width: 15, height: 15, color: active ? "var(--accent)" : "#94a3b8", flexShrink: 0 }} />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div style={{ padding: 10, borderTop: "1px solid #e6eaf0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 10, background: "#f8fafc" }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: "linear-gradient(135deg, var(--accent), var(--accent-dark))", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#fff", flexShrink: 0 }}>LS</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#0f172a" }}>LS Growth Agency</div>
          </div>
        </div>
      </div>
    </>
  );
}
