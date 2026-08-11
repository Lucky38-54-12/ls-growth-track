"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Phone, Check } from "lucide-react";

const L = { border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };

export interface WarmLead {
  id: string;
  company: string;
  phone: string | null;
  email: string | null;
  trade: string;
  location: string;
  note: string;
}

export default function WarmLeadRow({ lead }: { lead: WarmLead }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function markCalled() {
    setBusy(true);
    await fetch(`/api/warm-leads/${lead.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ called: true }),
    });
    router.refresh();
  }

  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, padding: "10px 12px", border: `1px solid ${L.border}`, background: "#fafbfc" }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 13.5, color: L.text }}>{lead.company}</div>
        <div style={{ fontSize: 12, color: L.muted, marginTop: 2 }}>
          {[lead.trade, lead.location].filter(Boolean).join(" · ") || "—"}
        </div>
        <div style={{ fontSize: 12, color: L.dimmed, marginTop: 4, lineHeight: 1.5 }}>{lead.note}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        {lead.phone && (
          <a
            href={`tel:${lead.phone}`}
            style={{ display: "flex", alignItems: "center", gap: 5, background: "var(--red)", color: "#fff", padding: "6px 12px", fontSize: 12, fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap" }}
          >
            <Phone style={{ width: 12, height: 12 }} />
            {lead.phone}
          </a>
        )}
        <button
          onClick={markCalled}
          disabled={busy}
          style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: `1px solid ${L.border}`, color: L.muted, padding: "6px 10px", fontSize: 11.5, fontWeight: 700, cursor: busy ? "default" : "pointer" }}
        >
          <Check style={{ width: 12, height: 12 }} />
          Called
        </button>
      </div>
    </div>
  );
}
