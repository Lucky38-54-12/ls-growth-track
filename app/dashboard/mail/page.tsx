"use client";
import { useState } from "react";
import Topbar from "@/components/Topbar";
import MailboxView from "@/components/MailboxView";
import ResendSentList from "@/components/ResendSentList";
import { Inbox, Send } from "lucide-react";

const L = { border: "#e6eaf0", text: "#0f172a", muted: "#64748b" };

type Tab = "gmail" | "resend";

export default function MailPage() {
  const [tab, setTab] = useState<Tab>("gmail");

  const tabStyle = (active: boolean): React.CSSProperties => ({
    display: "flex", alignItems: "center", gap: 6,
    padding: "10px 16px", fontSize: 12, fontWeight: 700,
    background: active ? "var(--accent-tint)" : "transparent",
    color: active ? "var(--accent)" : L.muted,
    border: "none", borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
    cursor: "pointer", letterSpacing: "0.03em",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <Topbar title="Mail" subtitle="Gmail inbox and Resend sent emails" />

      <div style={{ display: "flex", borderBottom: `1px solid ${L.border}`, background: "#f8fafc", padding: "0 28px" }}>
        <button style={tabStyle(tab === "gmail")} onClick={() => setTab("gmail")}>
          <Inbox style={{ width: 14, height: 14 }} /> GMAIL
        </button>
        <button style={tabStyle(tab === "resend")} onClick={() => setTab("resend")}>
          <Send style={{ width: 14, height: 14 }} /> RESEND SENT
        </button>
      </div>

      <div style={{ flex: 1, padding: 20 }}>
        {tab === "gmail" ? (
          <MailboxView account="gmail" title="Gmail" subtitle="Personal inbox" embedded />
        ) : (
          <ResendSentList />
        )}
      </div>
    </div>
  );
}
