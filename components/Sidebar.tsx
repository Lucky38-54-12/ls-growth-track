"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/dashboard", label: "Pipeline" },
  { href: "/dashboard/new", label: "Add Lead" },
  { href: "/dashboard/import", label: "Import Leads" },
  { href: "/dashboard/warm", label: "Warm Leads" },
];

export default function Sidebar() {
  const path = usePathname();
  return (
    <div style={{
      width: 190, flexShrink: 0, background: "#fff",
      borderRight: "1px solid #e2e8f0", display: "flex",
      flexDirection: "column", minHeight: "100vh",
    }}>
      {/* Brand */}
      <div style={{ padding: "18px 16px 16px", borderBottom: "1px solid #e2e8f0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src="/logo.png" alt="LS Growth" style={{ width: 34, height: 34, objectFit: "contain", flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 900, fontSize: 13, letterSpacing: "0.04em", lineHeight: 1.2 }}>
              L&amp;S <span style={{ color: "#dc2626" }}>GROWTH</span>
            </div>
            <div style={{ fontSize: 10.5, color: "#94a3b8", fontWeight: 600 }}>Outreach Agency</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <div style={{ padding: "14px 10px", flex: 1 }}>
        <div style={{
          fontSize: 10, color: "#94a3b8", fontWeight: 800,
          letterSpacing: "0.12em", textTransform: "uppercase",
          padding: "0 8px", marginBottom: 8,
        }}>Menu</div>
        {NAV.map(({ href, label }) => {
          const active = path === href || (href !== "/dashboard" && path.startsWith(href));
          return (
            <Link key={href} href={href} className="nav-link" style={{
              display: "flex", alignItems: "center", padding: "9px 10px",
              borderRadius: 0, marginBottom: 2, fontSize: 13, fontWeight: 700,
              color: active ? "#dc2626" : "#64748b",
              background: active ? "#fef2f2" : "transparent",
              borderLeft: `2px solid ${active ? "#dc2626" : "transparent"}`,
              textDecoration: "none",
              transition: "background 0.15s ease, color 0.15s ease",
            }}>
              {label}
            </Link>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{ padding: "14px 16px", borderTop: "1px solid #e2e8f0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <img src="/logo.png" alt="LS Growth" style={{ width: 26, height: 26, objectFit: "contain", flexShrink: 0 }} />
          <span style={{ fontSize: 11.5, fontWeight: 700, color: "#0f172a" }}>LS Growth Agency</span>
        </div>
      </div>
    </div>
  );
}
