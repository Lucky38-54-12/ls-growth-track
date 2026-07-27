"use client";

import { useEffect, useMemo, useState } from "react";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b" };

interface Lead {
  id: string;
  outcome: string;
  booking_status: string | null;
  scheduled_at: string | null;
  created_at: string;
  contact_email: string | null;
  lq_conversations: { extracted_fields: Record<string, unknown> } | null;
}

// These map to the AI qualifier's actual states — there's no multi-touch
// enquiry funnel here (job_type/quote_method/time all get captured in one
// chat), so the stages are "what actually happens next", not a generic
// CRM's New/Contacted/Trial vocabulary that wouldn't correspond to anything
// this system tracks.
const STAGES = [
  { key: "nurture", label: "Not ready yet", color: "#b45309", bg: "#fffbeb" },
  { key: "booked", label: "Booked", color: "#15803d", bg: "#f0fdf4" },
  { key: "needs_booking", label: "Needs manual booking", color: "#b91c1c", bg: "#fef2f2" },
  { key: "disqualified", label: "Not a fit", color: "#64748b", bg: "#f1f5f9" },
] as const;

function stageFor(lead: Lead): string {
  if (lead.outcome === "nurture") return "nurture";
  if (lead.outcome === "disqualified") return "disqualified";
  if (lead.outcome === "qualified" && lead.booking_status === "booked") return "booked";
  if (lead.outcome === "qualified" && lead.booking_status === "failed") return "needs_booking";
  return "nurture";
}

export default function PortalPipelinePage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/portal/leads")
      .then((r) => r.json())
      .then((body) => {
        setLeads(body.leads || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const byStage = useMemo(() => {
    const map: Record<string, Lead[]> = {};
    for (const stage of STAGES) map[stage.key] = [];
    for (const lead of leads) map[stageFor(lead)].push(lead);
    return map;
  }, [leads]);

  return (
    <div>
      <div style={{ background: "#fff", borderBottom: `1px solid ${L.border}`, padding: "18px 28px" }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: L.text }}>Pipeline</h1>
        <p style={{ fontSize: 13, color: L.muted }}>Where every lead is at, so nothing falls through the cracks.</p>
      </div>

      {loading ? (
        <p style={{ padding: 28, color: L.muted, fontSize: 13 }}>Loading…</p>
      ) : (
        <div style={{ display: "flex", gap: 14, padding: "20px 28px 60px", overflowX: "auto", alignItems: "flex-start" }}>
          {STAGES.map((stage) => {
            const stageLeads = byStage[stage.key] || [];
            return (
              <div key={stage.key} style={{ flex: "1 1 240px", minWidth: 240 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <p style={{ fontSize: 12.5, fontWeight: 700, color: L.text }}>{stage.label}</p>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: stage.color, background: stage.bg, padding: "2px 8px" }}>{stageLeads.length}</span>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {stageLeads.length === 0 ? (
                    <div style={{ border: `1px dashed ${L.border}`, padding: 16, textAlign: "center", color: "#cbd5e1", fontSize: 12 }}>Empty</div>
                  ) : (
                    stageLeads.map((lead) => {
                      const fields = lead.lq_conversations?.extracted_fields || {};
                      return (
                        <div key={lead.id} style={{ background: L.surface, border: `1px solid ${L.border}`, borderLeft: `3px solid ${stage.color}`, padding: "10px 12px" }}>
                          <p style={{ fontSize: 12.5, fontWeight: 700, color: L.text }}>{String(fields.job_type || "Job type unknown")}</p>
                          <p style={{ fontSize: 11.5, color: L.muted }}>{String(fields.location || "Location unknown")}</p>
                          <p style={{ fontSize: 11, color: L.muted, marginTop: 4 }}>{String(fields.phone || lead.contact_email || "No contact")}</p>
                          {lead.scheduled_at && stage.key === "booked" && (
                            <p style={{ fontSize: 11, color: "#15803d", fontWeight: 600, marginTop: 4 }}>
                              {new Date(lead.scheduled_at).toLocaleString("en-NZ", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                            </p>
                          )}
                          <p style={{ fontSize: 10.5, color: "#94a3b8", marginTop: 4 }}>
                            {new Date(lead.created_at).toLocaleDateString("en-NZ")}
                          </p>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
