"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { Users, Calendar, Columns3, Mail, LogOut } from "lucide-react";

const SIDEBAR_BG = "#0b0d12";
const SIDEBAR_BORDER = "#1f2229";
const SIDEBAR_MUTED = "#8b8f99";

const NAV = [
  { href: "/portal", label: "Leads", icon: Users },
  { href: "/portal/calendar", label: "Calendar", icon: Calendar },
  { href: "/portal/pipeline", label: "Pipeline", icon: Columns3 },
  { href: "/portal/email-sequence", label: "Email sequence", icon: Mail },
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
      <div style={{ width: 220, flexShrink: 0, background: SIDEBAR_BG, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "22px 20px", borderBottom: `1px solid ${SIDEBAR_BORDER}` }}>
          <img src="/logo-wide.png" alt="LS Growth" style={{ height: 30, width: "auto", maxWidth: "100%", objectFit: "contain" }} />
        </div>

        <p style={{ padding: "16px 20px 6px", fontSize: 10.5, fontWeight: 700, color: SIDEBAR_MUTED, textTransform: "uppercase", letterSpacing: "0.06em" }}>Menu</p>
        <nav style={{ padding: "0 10px" }}>
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = href === "/portal" ? pathname === "/portal" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", marginBottom: 2,
                  fontSize: 13, fontWeight: active ? 700 : 500, textDecoration: "none",
                  color: active ? "#fff" : SIDEBAR_MUTED,
                  background: active ? "var(--red)" : "transparent",
                  borderRadius: 2,
                }}
              >
                <Icon style={{ width: 15, height: 15, flexShrink: 0 }} />
                {label}
              </Link>
            );
          })}
        </nav>

        <div style={{ flex: 1 }} />

        <div style={{ padding: 10, borderTop: `1px solid ${SIDEBAR_BORDER}` }}>
          <button
            type="button"
            onClick={handleLogout}
            style={{
              display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 10px",
              fontSize: 13, fontWeight: 600, color: SIDEBAR_MUTED, background: "none", border: "none", cursor: "pointer",
            }}
          >
            <LogOut style={{ width: 15, height: 15 }} /> Sign out
          </button>
        </div>

        <div style={{ padding: "12px 20px", borderTop: `1px solid ${SIDEBAR_BORDER}`, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 26, height: 26, borderRadius: "50%", background: "#1f2229", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10.5, fontWeight: 800, color: "#fff" }}>
            {(clientName || "LS").slice(0, 2).toUpperCase()}
          </div>
          <p style={{ fontSize: 12, fontWeight: 700, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {clientName || "Your dashboard"}
          </p>
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}
