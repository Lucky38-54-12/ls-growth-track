"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { Users, Calendar, Columns3, LogOut } from "lucide-react";

const L = { text: "#0f172a", muted: "#64748b", border: "#e2e8f0" };

const NAV = [
  { href: "/portal", label: "Leads", icon: Users },
  { href: "/portal/calendar", label: "Calendar", icon: Calendar },
  { href: "/portal/pipeline", label: "Pipeline", icon: Columns3 },
];

export default function PortalDashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [clientName, setClientName] = useState("");

  useEffect(() => {
    fetch("/api/portal/me")
      .then((r) => r.json())
      .then((body) => setClientName(body.client?.name || ""))
      .catch(() => {});
  }, []);

  async function handleLogout() {
    await fetch("/api/portal/logout", { method: "POST" });
    router.push("/portal/login");
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f8fafc" }}>
      <div style={{ width: 220, flexShrink: 0, background: "#fff", borderRight: `1px solid ${L.border}`, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "20px 20px 16px", borderBottom: `1px solid ${L.border}` }}>
          <img src="/logo-trimmed.png" alt="LS Growth" style={{ height: 26, width: "auto", objectFit: "contain", marginBottom: 10 }} />
          <p style={{ fontSize: 13, fontWeight: 700, color: L.text }}>{clientName || "Your dashboard"}</p>
        </div>

        <nav style={{ flex: 1, padding: "14px 10px" }}>
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = href === "/portal" ? pathname === "/portal" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", marginBottom: 2,
                  fontSize: 13, fontWeight: active ? 700 : 500, textDecoration: "none",
                  color: active ? "var(--red)" : "#475569",
                  background: active ? "#fef2f2" : "transparent",
                }}
              >
                <Icon style={{ width: 15, height: 15, flexShrink: 0 }} />
                {label}
              </Link>
            );
          })}
        </nav>

        <div style={{ padding: 10, borderTop: `1px solid ${L.border}` }}>
          <button
            type="button"
            onClick={handleLogout}
            style={{
              display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 10px",
              fontSize: 13, fontWeight: 600, color: L.muted, background: "none", border: "none", cursor: "pointer",
            }}
          >
            <LogOut style={{ width: 15, height: 15 }} /> Sign out
          </button>
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}
