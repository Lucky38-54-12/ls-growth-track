"use client";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { Mail, X, Inbox, Send } from "lucide-react";
import MailboxView from "@/components/MailboxView";
import ResendSentList from "@/components/ResendSentList";

const L = { border: "#e6eaf0", text: "#0f172a", muted: "#64748b" };

type Tab = "gmail" | "resend";

export default function MailDrawer() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("gmail");

  if (path?.startsWith("/results") || path?.startsWith("/login") || path?.startsWith("/connect") || path?.startsWith("/portal")) return null;

  const tabStyle = (active: boolean): React.CSSProperties => ({
    display: "flex", alignItems: "center", gap: 6, flex: 1, justifyContent: "center",
    padding: "10px 12px", fontSize: 12, fontWeight: 700,
    background: active ? "var(--accent-tint)" : "transparent",
    color: active ? "var(--accent)" : L.muted,
    border: "none", borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
    cursor: "pointer", letterSpacing: "0.03em",
  });

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        aria-label={open ? "Close mail" : "Open mail"}
        title="Mail"
        style={{
          position: "fixed", top: 16, right: 20, zIndex: 60,
          width: 40, height: 40, borderRadius: "50%", border: `1px solid ${L.border}`,
          background: "#fff", color: open ? "var(--accent)" : L.text,
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", boxShadow: "0 2px 10px rgba(15,23,42,0.10)",
        }}
      >
        {open ? <X style={{ width: 18, height: 18 }} /> : <Mail style={{ width: 18, height: 18 }} />}
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.25)", zIndex: 55 }}
        />
      )}

      <div
        style={{
          position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 56,
          width: "min(920px, 100vw)", background: "#fff", borderLeft: `1px solid ${L.border}`,
          boxShadow: "-8px 0 32px rgba(15,23,42,0.14)",
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.22s ease", display: "flex", flexDirection: "column",
        }}
      >
        <div style={{ display: "flex", alignItems: "stretch", borderBottom: `1px solid ${L.border}`, background: "#f8fafc", paddingTop: 2 }}>
          <button style={tabStyle(tab === "gmail")} onClick={() => setTab("gmail")}>
            <Inbox style={{ width: 14, height: 14 }} /> GMAIL
          </button>
          <button style={tabStyle(tab === "resend")} onClick={() => setTab("resend")}>
            <Send style={{ width: 14, height: 14 }} /> RESEND SENT
          </button>
        </div>

        <div style={{ flex: 1, overflow: "hidden" }}>
          {tab === "gmail" ? (
            <MailboxView account="gmail" title="Gmail" subtitle="Personal inbox" embedded />
          ) : (
            <ResendSentList />
          )}
        </div>
      </div>
    </>
  );
}
