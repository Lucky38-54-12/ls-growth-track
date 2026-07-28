"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { Sunrise, Users, Calendar, Columns3, Mail, LogOut, Menu, X } from "lucide-react";

const SIDEBAR_BG = "#ffffff";
const SIDEBAR_BORDER = "#e2e8f0";
const SIDEBAR_MUTED = "#64748b";
const SIDEBAR_TEXT = "#0f172a";

const NAV = [
  { href: "/portal/today", label: "Today", icon: Sunrise },
  { href: "/portal/pipeline", label: "Pipeline", icon: Columns3 },
  { href: "/portal/calendar", label: "Calendar", icon: Calendar },
  { href: "/portal", label: "Leads", icon: Users },
  { href: "/portal/email-sequence", label: "Email sequence", icon: Mail },
];

export default function PortalDashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [clientName, setClientName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    fetch("/api/portal/me")
      .then((r) => r.json())
      .then((body) => {
        setClientName(body.client?.name || "");
        setLogoUrl(body.client?.logo_url || "");
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  async function handleLogout() {
    await fetch("/api/portal/logout", { method: "POST" });
    router.push("/portal/login");
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f8fafc" }}>
      <div
        className={`portal-topbar portal-header-pad`}
        style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 30, alignItems: "center", justifyContent: "space-between", padding: "14px 20px", background: SIDEBAR_BG, borderBottom: `1px solid ${SIDEBAR_BORDER}` }}
      >
        <img src="/logo-wide.png" alt="LS Growth" style={{ height: 28, width: "auto", maxWidth: 160, objectFit: "contain" }} />
        <button
          type="button"
          onClick={() => setNavOpen((v) => !v)}
          aria-label={navOpen ? "Close menu" : "Open menu"}
          style={{ background: "none", border: "none", cursor: "pointer", color: SIDEBAR_TEXT, padding: 4, display: "flex" }}
        >
          {navOpen ? <X style={{ width: 22, height: 22 }} /> : <Menu style={{ width: 22, height: 22 }} />}
        </button>
      </div>

      <div className={`portal-backdrop${navOpen ? " is-open" : ""}`} onClick={() => setNavOpen(false)} />

      <div className={`portal-sidebar${navOpen ? " is-open" : ""}`} style={{ width: 260, flexShrink: 0, background: SIDEBAR_BG, borderRight: `1px solid ${SIDEBAR_BORDER}`, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "26px 22px", borderBottom: `1px solid ${SIDEBAR_BORDER}` }}>
          <img src="/logo-wide.png" alt="LS Growth" style={{ height: 38, width: "auto", maxWidth: "100%", objectFit: "contain" }} />
        </div>

        <p style={{ padding: "20px 22px 8px", fontSize: 12, fontWeight: 700, color: SIDEBAR_MUTED, textTransform: "uppercase", letterSpacing: "0.06em" }}>Menu</p>
        <nav style={{ padding: "0 12px" }}>
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = href === "/portal" ? pathname === "/portal" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "12px 12px", marginBottom: 4,
                  fontSize: 15, fontWeight: active ? 700 : 500, textDecoration: "none",
                  color: active ? "#fff" : SIDEBAR_TEXT,
                  background: active ? "var(--red)" : "transparent",
                  borderRadius: 4,
                }}
              >
                <Icon style={{ width: 19, height: 19, flexShrink: 0 }} />
                {label}
              </Link>
            );
          })}
        </nav>

        <div style={{ flex: 1 }} />

        <div style={{ padding: 12, borderTop: `1px solid ${SIDEBAR_BORDER}` }}>
          <button
            type="button"
            onClick={handleLogout}
            style={{
              display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "12px 12px",
              fontSize: 15, fontWeight: 600, color: SIDEBAR_MUTED, background: "none", border: "none", cursor: "pointer",
            }}
          >
            <LogOut style={{ width: 19, height: 19 }} /> Sign out
          </button>
        </div>

        <div style={{ padding: "16px 22px", borderTop: `1px solid ${SIDEBAR_BORDER}`, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 34, height: 34, borderRadius: "50%", background: "#f1f5f9", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: SIDEBAR_TEXT, overflow: "hidden", padding: logoUrl ? 4 : 0, boxSizing: "border-box" }}>
            {logoUrl ? (
              <img src={logoUrl} alt={clientName} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            ) : (
              (clientName || "LS").slice(0, 2).toUpperCase()
            )}
          </div>
          <p style={{ fontSize: 14, fontWeight: 700, color: SIDEBAR_TEXT, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {clientName || "Your dashboard"}
          </p>
        </div>
      </div>

      <div className="portal-content" style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}
