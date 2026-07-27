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
  pipeline_stage: string | null;
  lq_conversations: { extracted_fields: Record<string, unknown> } | null;
}

const STAGES = [
  { key: "new_inquiry", label: "New Inquiry", color: "#1d4ed8", bg: "#eff6ff" },
  { key: "followed_up", label: "Followed Up", color: "#7c3aed", bg: "#f5f3ff" },
  { key: "not_ready", label: "Not Ready Yet — Email Sequence", color: "#b45309", bg: "#fffbeb" },
  { key: "booked", label: "Booked Jobs", color: "#15803d", bg: "#f0fdf4" },
  { key: "not_a_fit", label: "Not a Fit", color: "#64748b", bg: "#f1f5f9" },
] as const;

// Older leads inserted before pipeline_stage existed fall back to a
// derived stage so nothing silently disappears off the board.
function stageFor(lead: Lead): string {
  if (lead.pipeline_stage) return lead.pipeline_stage;
  if (lead.outcome === "disqualified") return "not_a_fit";
  if (lead.outcome === "nurture") return "not_ready";
  if (lead.outcome === "qualified" && lead.booking_status === "booked") return "booked";
  return "new_inquiry";
}

export default function PortalPipelinePage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

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

  function moveLead(leadId: string, stage: string) {
    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, pipeline_stage: stage } : l)));
    fetch(`/api/portal/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pipeline_stage: stage }),
    }).catch(() => {});
  }

  function handleDrop(stage: string) {
    setDragOverStage(null);
    if (!dragId) return;
    const current = leads.find((l) => l.id === dragId);
    if (current && stageFor(current) !== stage) moveLead(dragId, stage);
    setDragId(null);
  }

  return (
    <div>
      <div style={{ background: "#fff", borderBottom: `1px solid ${L.border}`, padding: "18px 28px" }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: L.text }}>Pipeline</h1>
        <p style={{ fontSize: 13, color: L.muted }}>Drag a card to move it through your pipeline — so nothing falls through the cracks.</p>
      </div>

      {loading ? (
        <p style={{ padding: 28, color: L.muted, fontSize: 13 }}>Loading…</p>
      ) : (
        <div style={{ display: "flex", gap: 14, padding: "20px 28px 60px", overflowX: "auto", alignItems: "flex-start" }}>
          {STAGES.map((stage) => {
            const stageLeads = byStage[stage.key] || [];
            const isDragOver = dragOverStage === stage.key;
            return (
              <div
                key={stage.key}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (dragOverStage !== stage.key) setDragOverStage(stage.key);
                }}
                onDragLeave={() => setDragOverStage((prev) => (prev === stage.key ? null : prev))}
                onDrop={(e) => {
                  e.preventDefault();
                  handleDrop(stage.key);
                }}
                style={{
                  flex: "1 1 240px", minWidth: 240, background: isDragOver ? "#f8fafc" : "transparent",
                  border: isDragOver ? `1px dashed ${stage.color}` : "1px solid transparent",
                  padding: 6, transition: "background 0.1s",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, padding: "0 4px" }}>
                  <p style={{ fontSize: 12.5, fontWeight: 700, color: L.text }}>{stage.label}</p>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: stage.color, background: stage.bg, padding: "2px 8px" }}>{stageLeads.length}</span>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 60 }}>
                  {stageLeads.length === 0 ? (
                    <div style={{ border: `1px dashed ${L.border}`, padding: 16, textAlign: "center", color: "#cbd5e1", fontSize: 12 }}>Empty</div>
                  ) : (
                    stageLeads.map((lead) => {
                      const fields = lead.lq_conversations?.extracted_fields || {};
                      return (
                        <div
                          key={lead.id}
                          draggable
                          onDragStart={() => setDragId(lead.id)}
                          onDragEnd={() => {
                            setDragId(null);
                            setDragOverStage(null);
                          }}
                          style={{
                            background: L.surface, border: `1px solid ${L.border}`, borderLeft: `3px solid ${stage.color}`,
                            padding: "10px 12px", cursor: "grab", opacity: dragId === lead.id ? 0.4 : 1,
                          }}
                        >
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
