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
      width: 220, flexShrink: 0, background: "#fff", borderRight: "1px solid var(--border)",
      display: "flex", flexDirection: "column", padding: "20px 16px", minHeight: "100vh",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 6px 24px" }}>
        <div style={{
          width: 36, height: 36, borderRadius: 9, background: "#0a0f1a",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <span style={{ color: "#fff", fontWeight: 900, fontSize: 13, letterSpacing: "0.02em" }}>LS</span>
        </div>
        <div>
          <div style={{ fontWeight: 900, fontSize: 14.5, letterSpacing: "0.02em", lineHeight: 1.1 }}>
            L&amp;S <span style={{ color: "var(--red)" }}>GROWTH</span>
          </div>
          <div style={{ fontSize: 11, color: "var(--dimmed)", fontWeight: 600 }}>Outreach Agency</div>
        </div>
      </div>

      <div style={{
        fontSize: 10.5, letterSpacing: "0.12em", color: "var(--dimmed)",
        fontWeight: 800, textTransform: "uppercase", padding: "0 10px", marginBottom: 8,
      }}>Menu</div>

      <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {NAV.map(({ href, label }) => {
          const active = path === href || (href !== "/dashboard" && path.startsWith(href));
          return (
            <Link key={href} href={href} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
              borderRadius: 8, color: active ? "var(--red)" : "var(--muted)",
              background: active ? "#fef2f2" : "transparent",
              fontSize: 13.5, fontWeight: 700,
            }}>
              <span style={{
                width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                background: active ? "var(--red)" : "var(--dimmed)",
              }} />
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
