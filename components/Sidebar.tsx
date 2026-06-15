"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Users, Send, FileText, UserPlus, Upload, Flame, Phone, Calendar, Sun, Inbox,
} from "lucide-react";

const NAV = [
  { href: "/dashboard/today", label: "Today", icon: Sun },
  { href: "/dashboard", label: "Pipeline", icon: LayoutDashboard },
  { href: "/dashboard/contacts", label: "Contacts", icon: Users },
  { href: "/dashboard/calendar", label: "Calendar", icon: Calendar },
  { href: "/dashboard/inbox", label: "Inbox", icon: Inbox },
  { href: "/dashboard/send", label: "Send Queue", icon: Send },
  { href: "/dashboard/templates", label: "Templates", icon: FileText },
  { href: "/dashboard/cold-call", label: "Cold Call", icon: Phone },
  { href: "/dashboard/new", label: "Add Lead", icon: UserPlus },
  { href: "/dashboard/import", label: "Import Leads", icon: Upload },
  { href: "/dashboard/warm", label: "Warm Leads", icon: Flame },
];

export default function Sidebar() {
  const path = usePathname();
  if (path?.startsWith("/results")) return null;
  return (
    <div style={{
      width: 224, flexShrink: 0, background: "#fff", borderRight: "1px solid #e2e8f0",
      display: "flex", flexDirection: "column", minHeight: "100vh",
    }}>
      {/* Brand */}
      <div style={{ height: 64, display: "flex", alignItems: "center", gap: 10, padding: "0 14px", borderBottom: "1px solid #e2e8f0" }}>
        <img src="/logo.png" alt="LS Growth" style={{ width: 34, height: 34, objectFit: "contain", flexShrink: 0 }} />
        <div>
          <div style={{ fontWeight: 900, fontSize: 13, letterSpacing: "0.03em", lineHeight: 1, color: "#0f172a", textTransform: "uppercase" }}>
            L&amp;S Growth
          </div>
          <div style={{ fontSize: 10, color: "var(--red)", fontWeight: 600, letterSpacing: "0.04em", marginTop: 3 }}>Outreach Agency</div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: "10px 8px", overflowY: "auto" }}>
        <p style={{ padding: "4px 10px 8px", fontSize: 9, fontWeight: 700, color: "#94a3b8", letterSpacing: "0.15em", textTransform: "uppercase" }}>Menu</p>
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = path === href || (href !== "/dashboard" && path.startsWith(href));
          return (
            <Link key={href} href={href} className={active ? "" : "nav-link-light"} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: active ? "9px 10px 9px 8px" : "9px 10px",
              fontSize: 13, fontWeight: active ? 600 : 500,
              background: active ? "#fef2f2" : "transparent",
              color: active ? "var(--red)" : "#475569",
              borderLeft: active ? "2px solid var(--red)" : "2px solid transparent",
              marginBottom: 1, textDecoration: "none",
              transition: "all 0.15s",
            }}>
              <Icon style={{ width: 15, height: 15, color: active ? "var(--red)" : "#94a3b8", flexShrink: 0 }} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div style={{ padding: 8, borderTop: "1px solid #e2e8f0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px" }}>
          <div style={{ width: 28, height: 28, background: "#fef2f2", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "var(--red)", flexShrink: 0 }}>LS</div>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#0f172a" }}>LS Growth Agency</div>
        </div>
      </div>
    </div>
  );
}
