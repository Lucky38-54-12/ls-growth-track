"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Users, MailOpen, Phone, Calendar, Sun, Inbox, ScanSearch, Megaphone, Mailbox, Settings, Bot, BarChart3, Zap, Rows3, PhoneCall,
} from "lucide-react";

const NAV = [
  { href: "/dashboard/today", label: "Today", icon: Sun },
  { href: "/dashboard", label: "Pipeline", icon: LayoutDashboard },
  { href: "/dashboard/email-pipeline", label: "Email Pipeline", icon: Rows3 },
  { href: "/dashboard/contacts", label: "Contacts", icon: Users },
  { href: "/dashboard/lead-qual", label: "Lead Qual", icon: Bot },
  { href: "/dashboard/sales-calls", label: "Sales & Onboarding", icon: PhoneCall },
  { href: "/dashboard/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/dashboard/campaign-tracking", label: "Campaign Tracking", icon: BarChart3 },
  { href: "/dashboard/automations", label: "Automations", icon: Zap },
  { href: "/dashboard/calendar", label: "Calendar", icon: Calendar },
  { href: "/dashboard/inbox", label: "Inbox", icon: Inbox },
  { href: "/dashboard/outreach-inbox", label: "Outreach Inbox", icon: Mailbox },
  { href: "/dashboard/cold-call", label: "Cold Call", icon: Phone },
  { href: "/dashboard/scraper", label: "Scraper", icon: ScanSearch },
  { href: "/dashboard/warm", label: "Email Tracking", icon: MailOpen },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function Sidebar() {
  const path = usePathname();
  if (path?.startsWith("/results") || path?.startsWith("/login")) return null;
  return (
    <div style={{
      width: 224, flexShrink: 0, background: "#fff", borderRight: "1px solid #e6eaf0",
      display: "flex", flexDirection: "column", minHeight: "100vh",
      boxShadow: "1px 0 0 rgba(15,23,42,0.02), 4px 0 16px rgba(15,23,42,0.03)",
      position: "relative", zIndex: 5,
    }}>
      {/* Brand */}
      <div style={{ height: 64, display: "flex", alignItems: "center", gap: 10, padding: "0 16px", borderBottom: "1px solid #e6eaf0" }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, #fff 0%, #fef2f2 100%)",
          border: "1px solid #fee2e2", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <img src="/logo.png" alt="LS Growth" style={{ width: 22, height: 22, objectFit: "contain" }} />
        </div>
        <div>
          <div style={{ fontWeight: 900, fontSize: 13, letterSpacing: "0.03em", lineHeight: 1, color: "#0f172a", textTransform: "uppercase" }}>
            L&amp;S Growth
          </div>
          <div style={{ fontSize: 10, color: "var(--red)", fontWeight: 600, letterSpacing: "0.04em", marginTop: 3 }}>Outreach Agency</div>
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
              background: active ? "linear-gradient(135deg, #fef2f2 0%, #fff5f5 100%)" : "transparent",
              color: active ? "var(--red)" : "#475569",
              borderRadius: 8,
              boxShadow: active ? "0 1px 3px rgba(220,38,38,0.12)" : "none",
              marginBottom: 2, textDecoration: "none",
              transition: "all 0.15s",
            }}>
              <Icon style={{ width: 15, height: 15, color: active ? "var(--red)" : "#94a3b8", flexShrink: 0 }} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div style={{ padding: 10, borderTop: "1px solid #e6eaf0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 10, background: "#f8fafc" }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: "linear-gradient(135deg, var(--red), #b91c1c)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#fff", flexShrink: 0 }}>LS</div>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#0f172a" }}>LS Growth Agency</div>
        </div>
      </div>
    </div>
  );
}
