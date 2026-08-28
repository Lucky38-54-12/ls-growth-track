"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { usePortalLeads } from "@/lib/hooks/usePortalLeads";
import { PORTAL as L, portalCardStyle } from "@/lib/portalTheme";

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
  { key: "callback_booked", label: "Callback Booked", color: "#0891b2", bg: "#ecfeff" },
  { key: "site_visit", label: "Site Visit", color: "#b45309", bg: "#fffbeb" },
  { key: "booked_job", label: "Booked Job", color: "#15803d", bg: "#f0fdf4" },
  { key: "not_a_fit", label: "Not a Fit", color: "#64748b", bg: "#f1f5f9" },
  { key: "lost", label: "Lost", color: "#b91c1c", bg: "#fef2f2" },
] as const;

// Older leads inserted before pipeline_stage existed, or before it was split
// into Callback Booked/Site Visit/Booked Job, fall back to a derived stage
// so nothing silently disappears off the board.
function stageFor(lead: Lead): string {
  if (lead.pipeline_stage) {
    if (lead.pipeline_stage === "booked") return "callback_booked";
    if (lead.pipeline_stage === "not_ready") return "followed_up";
    return lead.pipeline_stage;
  }
  if (lead.outcome === "disqualified") return "not_a_fit";
  if (lead.outcome === "nurture") return "followed_up";
  if (lead.outcome === "qualified" && lead.booking_status === "booked") return "callback_booked";
  return "new_inquiry";
}

// A move fired via drag-and-drop hits the server async; if a poll lands
// before that PATCH commits, it would otherwise show the card snapping
// back to its old stage for a moment. Overrides paper over that window.
const OVERRIDE_GRACE_MS = 20000;

export default function PortalPipelinePage() {
  const overridesRef = useRef<Map<string, { stage: string; ts: number }>>(new Map());
  const applyOverrides = useCallback((fetched: Lead[]) => {
    const overrides = overridesRef.current;
    const now = Date.now();
    return fetched.map((lead) => {
      const o = overrides.get(lead.id);
      if (!o) return lead;
      if (now - o.ts > OVERRIDE_GRACE_MS || lead.pipeline_stage === o.stage) {
        overrides.delete(lead.id);
        return lead;
      }
      return { ...lead, pipeline_stage: o.stage };
    });
  }, []);

  const { leads, setLeads, loading } = usePortalLeads<Lead>({ transform: applyOverrides });
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  const byStage = useMemo(() => {
    const map: Record<string, Lead[]> = {};
    for (const stage of STAGES) map[stage.key] = [];
    for (const lead of leads) map[stageFor(lead)].push(lead);
    return map;
  }, [leads]);

  function moveLead(leadId: string, stage: string) {
    overridesRef.current.set(leadId, { stage, ts: Date.now() });
    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, pipeline_stage: stage } : l)));
    fetch(`/api/portal/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pipeline_stage: stage }),
    }).catch(() => {});
  }

  function handleDrop(stage: string) {
    setDragOverStage(null);
    const leadId = dragId;
    setDragId(null);
    if (!leadId) return;
    const current = leads.find((l) => l.id === leadId);
    if (current && stageFor(current) !== stage) moveLead(leadId, stage);
  }

  return (
    <div>
      <div className="portal-header-pad" style={{ background: "linear-gradient(135deg, #eef2ff 0%, #fdf4ff 55%, #fff7ed 100%)", borderBottom: `1px solid ${L.border}`, padding: "22px 28px" }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: L.text }}>Pipeline</h1>
        <p style={{ fontSize: 13.5, color: L.muted, marginTop: 4 }}>Drag a card to move it through your pipeline — so nothing falls through the cracks.</p>
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
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: stage.color, background: stage.bg, padding: "2px 8px", borderRadius: 999 }}>{stageLeads.length}</span>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 60 }}>
                  {stageLeads.length === 0 ? (
                    <div style={{ border: `1px dashed ${L.border}`, borderRadius: L.cardRadius, padding: 16, textAlign: "center", color: "#cbd5e1", fontSize: 12 }}>Empty</div>
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
                            ...portalCardStyle, borderLeft: `3px solid ${stage.color}`,
                            padding: "10px 12px", cursor: "grab", opacity: dragId === lead.id ? 0.4 : 1,
                          }}
                        >
                          <p style={{ fontSize: 12.5, fontWeight: 700, color: L.text }}>
                            {fields.name ? `${String(fields.name)} — ${String(fields.job_type || "Job type unknown")}` : String(fields.job_type || "Job type unknown")}
                          </p>
                          <p style={{ fontSize: 11.5, color: L.muted }}>{String(fields.location || "Location unknown")}</p>
                          <p style={{ fontSize: 11, color: L.muted, marginTop: 4 }}>{String(fields.phone || lead.contact_email || "No contact")}</p>
                          {lead.scheduled_at && stage.key === "callback_booked" && (
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
