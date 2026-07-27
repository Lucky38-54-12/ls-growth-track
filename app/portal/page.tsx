"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Clock, XCircle } from "lucide-react";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b" };

interface Lead {
  id: string;
  outcome: string;
  booking_status: string | null;
  calendar_event_id: string | null;
  booked_at: string | null;
  created_at: string;
  contact_email: string | null;
  lq_conversations: { extracted_fields: Record<string, unknown> } | null;
}

const OUTCOME_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  qualified: { bg: "#f0fdf4", color: "#15803d", label: "Qualified" },
  nurture: { bg: "#fffbeb", color: "#b45309", label: "Not ready yet" },
  disqualified: { bg: "#fef2f2", color: "#b91c1c", label: "Not a fit" },
  needs_human: { bg: "#eff6ff", color: "#1d4ed8", label: "Needs a reply" },
};

export default function PortalHomePage() {
  const [clientName, setClientName] = useState("");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/portal/leads")
      .then((r) => r.json())
      .then((body) => {
        if (body.error) {
          setError(body.error);
        } else {
          setClientName(body.client?.name || "");
          setLeads(body.leads || []);
        }
        setLoading(false);
      })
      .catch(() => {
        setError("Something went wrong loading your leads.");
        setLoading(false);
      });
  }, []);

  return (
    <div style={{ background: "#f8fafc", minHeight: "100vh" }}>
      <div style={{ background: "#fff", borderBottom: `1px solid ${L.border}`, padding: "18px 28px" }}>
        <img src="/logo-trimmed.png" alt="LS Growth" style={{ height: 28, width: "auto", objectFit: "contain", marginBottom: 10 }} />
        <h1 style={{ fontSize: 20, fontWeight: 800, color: L.text }}>{clientName ? `${clientName}'s leads` : "Your leads"}</h1>
        <p style={{ fontSize: 13, color: L.muted }}>Everyone who's messaged in and been qualified by your AI chat.</p>
      </div>

      <div style={{ padding: "20px 28px 60px", maxWidth: 820, margin: "0 auto" }}>
        {loading ? (
          <p style={{ color: L.muted, fontSize: 13 }}>Loading…</p>
        ) : error ? (
          <p style={{ color: "#b91c1c", fontSize: 13 }}>{error}</p>
        ) : leads.length === 0 ? (
          <div style={{ background: L.surface, border: `1px solid ${L.border}`, padding: 32, textAlign: "center", color: L.muted, fontSize: 13 }}>
            No leads yet — they&apos;ll show up here as soon as someone messages your connected Page.
          </div>
        ) : (
          <div style={{ background: L.surface, border: `1px solid ${L.border}` }}>
            {leads.map((lead) => {
              const fields = lead.lq_conversations?.extracted_fields || {};
              const style = OUTCOME_STYLE[lead.outcome] || { bg: "#f1f5f9", color: L.muted, label: lead.outcome };
              return (
                <div key={lead.id} style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, padding: "14px 18px", borderBottom: `1px solid ${L.border}`, flexWrap: "wrap" }}>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 700, color: L.text }}>
                      {String(fields.job_type || "Job type unknown")} — {String(fields.location || "location unknown")}
                    </p>
                    <p style={{ fontSize: 12, color: L.muted, marginTop: 2 }}>
                      {String(fields.phone || lead.contact_email || "No contact on file")} · {new Date(lead.created_at).toLocaleString("en-NZ")}
                    </p>
                    {lead.booking_status === "booked" && lead.booked_at && (
                      <p style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#15803d", fontWeight: 600, marginTop: 4 }}>
                        <CheckCircle2 style={{ width: 13, height: 13 }} /> Booked on your calendar for {new Date(lead.booked_at).toLocaleString("en-NZ")}
                      </p>
                    )}
                    {lead.booking_status === "failed" && (
                      <p style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#b91c1c", fontWeight: 600, marginTop: 4 }}>
                        <XCircle style={{ width: 13, height: 13 }} /> Couldn&apos;t auto-book, follow up manually
                      </p>
                    )}
                    {lead.outcome === "nurture" && (
                      <p style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#b45309", fontWeight: 600, marginTop: 4 }}>
                        <Clock style={{ width: 13, height: 13 }} /> Being kept warm automatically
                      </p>
                    )}
                  </div>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: style.color, background: style.bg, padding: "4px 10px", flexShrink: 0 }}>
                    {style.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
