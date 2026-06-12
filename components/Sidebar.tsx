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
          <div style={{
            width: 34, height: 34, borderRadius: 0, background: "#0a0f1a",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <span style={{ color: "#fff", fontWeight: 900, fontSize: 11, letterSpacing: "0.05em" }}>LS</span>
          </div>
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
            <Link key={href} href={href} style={{
              display: "flex", alignItems: "center", padding: "9px 10px",
              borderRadius: 0, marginBottom: 2, fontSize: 13, fontWeight: 700,
              color: active ? "#dc2626" : "#64748b",
              background: active ? "#fef2f2" : "transparent",
              borderLeft: `2px solid ${active ? "#dc2626" : "transparent"}`,
              textDecoration: "none",
            }}>
              {label}
            </Link>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{ padding: "14px 16px", borderTop: "1px solid #e2e8f0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 26, height: 26, borderRadius: 0, background: "#dc2626",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <span style={{ color: "#fff", fontWeight: 900, fontSize: 10 }}>L</span>
          </div>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: "#0f172a" }}>LS Growth Agency</span>
        </div>
      </div>
    </div>
  );
}
