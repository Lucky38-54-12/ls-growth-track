"use client";
import { Bell, Search, Plus, X, LayoutDashboard, Users, Send, FileText, UserPlus, Upload, Flame, Phone, Calendar, Sun, Inbox, ScanSearch } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const SEARCH_ITEMS = [
  { label: "Today", href: "/dashboard/today", icon: Sun },
  { label: "Pipeline", href: "/dashboard", icon: LayoutDashboard },
  { label: "Contacts", href: "/dashboard/contacts", icon: Users },
  { label: "Calendar", href: "/dashboard/calendar", icon: Calendar },
  { label: "Inbox", href: "/dashboard/inbox", icon: Inbox },
  { label: "Email Outreach", href: "/dashboard/send", icon: Send },
  { label: "Templates", href: "/dashboard/templates", icon: FileText },
  { label: "Cold Call", href: "/dashboard/cold-call", icon: Phone },
  { label: "Scraper", href: "/dashboard/scraper", icon: ScanSearch },
  { label: "Add Lead", href: "/dashboard/new", icon: UserPlus },
  { label: "Import Leads", href: "/dashboard/import", icon: Upload },
  { label: "Warm Leads", href: "/dashboard/warm", icon: Flame },
];

export default function Topbar({ title, subtitle }: { title: string; subtitle?: string }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setSearchOpen(o => !o); }
      if (e.key === "Escape") setSearchOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (searchOpen) setTimeout(() => inputRef.current?.focus(), 50);
    else setQuery("");
  }, [searchOpen]);

  const results = query.trim()
    ? SEARCH_ITEMS.filter(i => i.label.toLowerCase().includes(query.toLowerCase()))
    : SEARCH_ITEMS;

  return (
    <>
      <header style={{
        height: 56, display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 24px", position: "sticky", top: 0, zIndex: 10,
        background: "#fff", borderBottom: "1px solid #e2e8f0", boxShadow: "0 1px 4px rgba(0,0,0,0.04)", gap: 12,
      }}>
        {/* Left */}
        <div style={{ display: "flex", alignItems: "stretch", gap: 14, minWidth: 0 }}>
          <div style={{ width: 4, background: "var(--red)", alignSelf: "stretch", flexShrink: 0 }} />
          <div style={{ minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <h1 style={{ fontSize: 20, fontWeight: 900, color: "#0f172a", textTransform: "uppercase", letterSpacing: "0.04em", lineHeight: 1, whiteSpace: "nowrap" }}>
              {title}
            </h1>
            {subtitle && <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 3, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{subtitle}</p>}
          </div>
        </div>

        {/* Right */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginRight: 4 }}>
            <span style={{ width: 6, height: 6, background: "var(--green)", borderRadius: "50%", display: "inline-block" }} />
            <span style={{ fontSize: 10, fontWeight: 600, color: "var(--green)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Live</span>
          </div>

          <button onClick={() => setSearchOpen(true)} style={{
            display: "flex", alignItems: "center", gap: 8, height: 36, padding: "0 12px",
            background: "#f8fafc", border: "1px solid #e2e8f0", cursor: "pointer", color: "#94a3b8", fontSize: 12,
          }}>
            <Search style={{ width: 13, height: 13 }} />
            <span>Search</span>
            <span style={{ fontSize: 10, background: "#e2e8f0", borderRadius: 4, padding: "1px 5px", color: "#94a3b8", fontWeight: 600 }}>⌘K</span>
          </button>

          <Link href="/dashboard/new" className="btn-lift" style={{
            display: "flex", alignItems: "center", gap: 6, background: "var(--red)", color: "#fff",
            border: "none", padding: "0 14px", height: 36, fontSize: 12, fontWeight: 700,
            textDecoration: "none", flexShrink: 0, whiteSpace: "nowrap",
          }}>
            <Plus style={{ width: 13, height: 13 }} />
            Add Lead
          </Link>

          <button style={{
            position: "relative", width: 36, height: 36, background: "transparent",
            border: "1px solid #e2e8f0", cursor: "pointer", color: "#64748b",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Bell style={{ width: 15, height: 15 }} />
          </button>

          <div style={{
            width: 36, height: 36, background: "#0f172a", color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 800, letterSpacing: "0.04em", flexShrink: 0, border: "2px solid #e2e8f0",
          }}>
            LS
          </div>
        </div>
      </header>

      {/* Search modal */}
      {searchOpen && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 80 }}
          onClick={() => setSearchOpen(false)}
        >
          <div
            style={{ width: "100%", maxWidth: "min(560px, calc(100vw - 32px))", background: "#fff", overflow: "hidden", margin: "0 16px", border: "1px solid #e2e8f0" }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 20px", borderBottom: "1px solid #e2e8f0" }}>
              <Search style={{ width: 16, height: 16, color: "#94a3b8", flexShrink: 0 }} />
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search pages…"
                style={{ flex: 1, border: "none", outline: "none", fontSize: 15, color: "#0f172a", fontFamily: "inherit", background: "transparent" }}
              />
              <button onClick={() => setSearchOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", display: "flex", padding: 2 }}>
                <X style={{ width: 14, height: 14 }} />
              </button>
            </div>
            <div style={{ maxHeight: 360, overflowY: "auto", padding: 8 }}>
              {results.length === 0 ? (
                <p style={{ fontSize: 13, color: "#94a3b8", textAlign: "center", padding: 24 }}>No results for &quot;{query}&quot;</p>
              ) : (
                results.map(({ label, href, icon: Icon }) => (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setSearchOpen(false)}
                    className="row-hover"
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", textDecoration: "none" }}
                  >
                    <div style={{ width: 32, height: 32, background: "#fef2f2", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Icon style={{ width: 14, height: 14, color: "var(--red)" }} />
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{label}</div>
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
