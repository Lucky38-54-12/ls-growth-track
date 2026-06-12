"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/dashboard", label: "Pipeline", icon: "▦" },
  { href: "/dashboard/contacts", label: "Contacts", icon: "👥" },
  { href: "/dashboard/analytics", label: "Analytics", icon: "📈" },
  { href: "/dashboard/send", label: "Send Queue", icon: "✉" },
  { href: "/dashboard/templates", label: "Templates", icon: "📝" },
  { href: "/dashboard/new", label: "Add Lead", icon: "＋" },
  { href: "/dashboard/import", label: "Import Leads", icon: "⇧" },
  { href: "/dashboard/warm", label: "Warm Leads", icon: "🔥" },
];

export default function Sidebar() {
  const path = usePathname();
  if (path?.startsWith("/results")) return null;
  return (
    <div style={{
      width: 210, flexShrink: 0, background: "#0b1220",
      display: "flex", flexDirection: "column", minHeight: "100vh",
    }}>
      {/* Brand */}
      <div style={{ padding: "20px 18px", borderBottom: "1px solid #1e293b" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src="/logo.png" alt="LS Growth" style={{ width: 34, height: 34, objectFit: "contain", flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 900, fontSize: 13, letterSpacing: "0.04em", lineHeight: 1.2, color: "#fff" }}>
              L&amp;S <span style={{ color: "#ef4444" }}>GROWTH</span>
            </div>
            <div style={{ fontSize: 10.5, color: "#64748b", fontWeight: 600 }}>Outreach Agency</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <div style={{ padding: "16px 12px", flex: 1 }}>
        <div style={{
          fontSize: 10, color: "#475569", fontWeight: 800,
          letterSpacing: "0.12em", textTransform: "uppercase",
          padding: "0 10px", marginBottom: 10,
        }}>Menu</div>
        {NAV.map(({ href, label, icon }) => {
          const active = path === href || (href !== "/dashboard" && path.startsWith(href));
          return (
            <Link key={href} href={href} className={active ? "nav-link-dark-active" : "nav-link-dark"} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
              borderRadius: 0, marginBottom: 2, fontSize: 13, fontWeight: 700,
              color: active ? "#fff" : "#94a3b8",
              background: active ? "var(--red)" : "transparent",
              textDecoration: "none",
              transition: "background 0.15s ease, color 0.15s ease",
            }}>
              <span style={{ fontSize: 14, width: 18, textAlign: "center", flexShrink: 0 }}>{icon}</span>
              {label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
