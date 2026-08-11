"use client";
import { useRef, useState } from "react";
import { CheckCircle2, Circle } from "lucide-react";
import { Lead, PostCallOutcome } from "@/lib/types";
import { advance, currentStep, firstTouchpointDate, TouchpointResult } from "@/lib/followUpCadence";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };

const OUTCOME_BADGE: Record<PostCallOutcome, { bg: string; text: string; label: string }> = {
  hot: { bg: "#fee2e2", text: "#b91c1c", label: "Hot" },
  warm: { bg: "#fef9c3", text: "#854d0e", label: "Warm" },
  closed_won: { bg: "#dcfce7", text: "#15803d", label: "Closed Won" },
};

type PipelineColumnKey = "hot" | "warm" | "paused" | "cold_again" | "onboarding";

const PIPELINE_COLUMNS: { key: PipelineColumnKey; label: string }[] = [
  { key: "hot", label: "Hot" },
  { key: "warm", label: "Warm" },
  { key: "paused", label: "Paused" },
  { key: "cold_again", label: "Cold Again" },
  { key: "onboarding", label: "Onboarding" },
];

const CHECKLIST_ITEMS: { key: "agreement_sent" | "ads_manager_access" | "agreement_signed" | "campaign_live"; label: string }[] = [
  { key: "agreement_sent", label: "Agreement sent" },
  { key: "ads_manager_access", label: "Meta Ads Manager access granted" },
  { key: "agreement_signed", label: "Agreement signed" },
  { key: "campaign_live", label: "Campaign live" },
];

function nzToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Pacific/Auckland" }).format(new Date());
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-NZ", { timeZone: "Pacific/Auckland", day: "numeric", month: "short" });
}

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return res.ok;
}

async function patchJson(url: string, body: unknown) {
  const res = await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return res.ok;
}

function columnFor(lead: Lead): PipelineColumnKey | null {
  if (lead.post_call_stage === "active" && lead.post_call_outcome === "hot") return "hot";
  if (lead.post_call_stage === "active" && lead.post_call_outcome === "warm") return "warm";
  if (lead.post_call_stage === "paused") return "paused";
  if (lead.post_call_stage === "cold_again") return "cold_again";
  if (lead.post_call_stage === "onboarding") return "onboarding";
  return null;
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, fontWeight: 800, marginBottom: 12 }}>
        {title} — {count}
      </div>
      {children}
    </div>
  );
}

function LeadMeta({ lead }: { lead: Lead }) {
  return (
    <div style={{ fontSize: 12.5, color: L.muted, marginTop: 4 }}>
      {lead.main_objection && <span>Objection: {lead.main_objection} · </span>}
      Last contact: {fmtDate(lead.last_touchpoint_at || lead.sales_call_done_at)}
    </div>
  );
}

function btnStyle(bg: string): React.CSSProperties {
  return { padding: "6px 12px", background: bg, border: `1px solid ${L.border}`, fontSize: 12, fontWeight: 700, color: L.text, cursor: "pointer" };
}

interface Props {
  initialAwaitingOutcome: Lead[];
  initialGraduated: Lead[];
}

export default function DiscoveryPipelineClient({ initialAwaitingOutcome, initialGraduated }: Props) {
  const [awaiting, setAwaiting] = useState<Lead[]>(initialAwaitingOutcome);
  const [leads, setLeads] = useState<Lead[]>(initialGraduated);
  const draggingId = useRef<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<PipelineColumnKey | null>(null);

  function updateLead(id: string, patch: Partial<Lead>) {
    setLeads((prev) => prev.map((l) => (l.lead_id === id ? { ...l, ...patch } : l)));
  }

  async function logSalesCallDone(lead: Lead, outcome: PostCallOutcome, objection: string) {
    const ok = await postJson(`/api/leads/${lead.lead_id}/sales-call-done`, { outcome, main_objection: objection });
    if (!ok) return;
    setAwaiting((prev) => prev.filter((l) => l.lead_id !== lead.lead_id));
    const doneAt = new Date().toISOString();
    const patch: Partial<Lead> =
      outcome === "closed_won"
        ? { post_call_outcome: outcome, post_call_stage: "onboarding", main_objection: objection || null, sales_call_done_at: doneAt, touchpoint_index: 0, next_touchpoint_at: null }
        : { post_call_outcome: outcome, post_call_stage: "active", main_objection: objection || null, sales_call_done_at: doneAt, touchpoint_index: 1, next_touchpoint_at: firstTouchpointDate(outcome, doneAt) };
    setLeads((prev) => [...prev, { ...lead, ...patch }]);
  }

  async function logTouchpoint(lead: Lead, result: TouchpointResult) {
    const ok = await postJson(`/api/leads/${lead.lead_id}/touchpoint`, { result });
    if (!ok || !lead.post_call_outcome || !lead.sales_call_done_at) return;
    const now = new Date().toISOString();
    const advanced = advance(lead.post_call_outcome, lead.touchpoint_index, lead.sales_call_done_at, result, now);
    updateLead(lead.lead_id, { last_touchpoint_at: now, touchpoint_index: advanced.touchpoint_index, next_touchpoint_at: advanced.next_touchpoint_at, post_call_stage: advanced.post_call_stage });
  }

  async function toggleChecklist(lead: Lead, key: (typeof CHECKLIST_ITEMS)[number]["key"]) {
    const next = !lead[key];
    updateLead(lead.lead_id, { [key]: next } as Partial<Lead>);
    await patchJson(`/api/leads/${lead.lead_id}/onboarding-checklist`, { [key]: next });
  }

  function dragStart(leadId: string) {
    return (e: React.DragEvent) => {
      draggingId.current = leadId;
      e.dataTransfer.setData("text/plain", leadId);
      e.dataTransfer.effectAllowed = "move";
    };
  }

  async function handleDrop(column: PipelineColumnKey) {
    const id = draggingId.current;
    draggingId.current = null;
    setDragOverKey(null);
    if (!id) return;
    const lead = leads.find((l) => l.lead_id === id);
    if (!lead || columnFor(lead) === column) return;

    const today = new Date().toISOString();
    let patch: Partial<Lead> = {};
    if (column === "hot" || column === "warm") {
      patch = { post_call_outcome: column, post_call_stage: "active", touchpoint_index: 1, next_touchpoint_at: firstTouchpointDate(column, today) };
    } else if (column === "paused") {
      patch = { post_call_stage: "paused", next_touchpoint_at: null };
    } else if (column === "cold_again") {
      patch = { post_call_stage: "cold_again", next_touchpoint_at: null };
    } else if (column === "onboarding") {
      patch = { post_call_outcome: "closed_won", post_call_stage: "onboarding", next_touchpoint_at: null };
    }
    updateLead(id, patch);
    await postJson(`/api/leads/${id}/set-pipeline-stage`, { column });
  }

  const today = nzToday();
  const active = leads.filter((l) => l.post_call_stage === "active");
  const dueToday = active
    .filter((l) => l.next_touchpoint_at && l.next_touchpoint_at <= today)
    .sort((a, b) => {
      const hotFirst = (a.post_call_outcome === "hot" ? 0 : 1) - (b.post_call_outcome === "hot" ? 0 : 1);
      if (hotFirst !== 0) return hotFirst;
      return (a.next_touchpoint_at || "").localeCompare(b.next_touchpoint_at || "");
    });

  const grouped: Record<PipelineColumnKey, Lead[]> = { hot: [], warm: [], paused: [], cold_again: [], onboarding: [] };
  for (const lead of leads) {
    const col = columnFor(lead);
    if (col) grouped[col].push(lead);
  }

  return (
    <div style={{ padding: "24px 28px 60px" }}>
      {/* Today */}
      <Section title="Today" count={dueToday.length}>
        {dueToday.length === 0 ? (
          <p style={{ fontSize: 13, color: L.muted }}>Nothing due today.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {dueToday.map((lead) => {
              const badge = OUTCOME_BADGE[lead.post_call_outcome!];
              const step = currentStep(lead.post_call_outcome as "hot" | "warm", lead.touchpoint_index);
              return (
                <div key={lead.lead_id} style={{ background: L.surface, border: `1px solid ${L.border}`, borderLeft: `4px solid ${badge.text}`, padding: "14px 18px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 10.5, fontWeight: 800, padding: "2px 8px", background: badge.bg, color: badge.text }}>{badge.label}</span>
                        <span style={{ fontWeight: 700, fontSize: 14 }}>{lead.contact_name || lead.company}</span>
                        <span style={{ fontSize: 12.5, color: L.muted }}>{lead.company}</span>
                      </div>
                      <div style={{ fontSize: 12.5, color: L.muted, marginTop: 4 }}>{step?.label || "Follow up"}</div>
                      <LeadMeta lead={lead} />
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button onClick={() => logTouchpoint(lead, "no_answer")} style={btnStyle("#f8fafc")}>No answer</button>
                      <button onClick={() => logTouchpoint(lead, "spoke_booked_call")} style={btnStyle("#dbeafe")}>Spoke — booked call</button>
                      <button onClick={() => logTouchpoint(lead, "spoke_not_ready")} style={btnStyle("#fef9c3")}>Spoke — not ready</button>
                      <button onClick={() => logTouchpoint(lead, "closed")} style={btnStyle("#dcfce7")}>Closed</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* Awaiting outcome — people you've had a meeting with, waiting for the outcome to be logged */}
      {awaiting.length > 0 && (
        <div style={{ marginBottom: 28, display: "flex", flexDirection: "column", gap: 10 }}>
          {awaiting.map((lead) => <AwaitingOutcomeCard key={lead.lead_id} lead={lead} onLog={logSalesCallDone} />)}
        </div>
      )}

      {/* Pipeline kanban — drag a card between columns */}
      <Section title="Pipeline" count={leads.length}>
        <div style={{ display: "flex", gap: 12, alignItems: "start" }}>
          {PIPELINE_COLUMNS.map((col) => (
            <div
              key={col.key}
              style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}
              onDragOver={(e) => { e.preventDefault(); setDragOverKey(col.key); }}
              onDragLeave={() => setDragOverKey((prev) => (prev === col.key ? null : prev))}
              onDrop={(e) => { e.preventDefault(); handleDrop(col.key); }}
            >
              <div style={{ background: L.surface, border: `1px solid ${L.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: L.text }}>{col.label}</span>
                <span style={{ fontSize: 20, fontWeight: 800, color: L.text }}>{grouped[col.key].length}</span>
              </div>
              <div style={{
                display: "flex", flexDirection: "column", gap: 8, minHeight: 80, padding: 4,
                background: dragOverKey === col.key ? "#fef2f2" : "transparent",
                border: dragOverKey === col.key ? "1px dashed var(--red)" : "1px dashed transparent",
                transition: "background 0.1s, border 0.1s",
              }}>
                {grouped[col.key].length === 0 ? (
                  <div style={{ padding: 20, textAlign: "center", color: L.dimmed, fontSize: 12, background: "#f8fafc", border: `1px dashed ${L.border}` }}>Empty</div>
                ) : (
                  grouped[col.key].map((lead) => (
                    <div
                      key={lead.lead_id}
                      draggable
                      onDragStart={dragStart(lead.lead_id)}
                      className="card-hover"
                      style={{ background: L.surface, border: `1px solid ${L.border}`, padding: "12px 14px", cursor: "grab" }}
                    >
                      <div style={{ fontWeight: 700, fontSize: 13.5 }}>{lead.contact_name || lead.company}</div>
                      <div style={{ fontSize: 12, color: L.muted }}>{lead.company}</div>
                      <LeadMeta lead={lead} />
                      {col.key === "hot" || col.key === "warm" ? (
                        <div style={{ fontSize: 12, color: L.muted, marginTop: 4 }}>
                          Next: {currentStep(col.key, lead.touchpoint_index)?.label || "—"}{lead.next_touchpoint_at ? ` (${fmtDate(lead.next_touchpoint_at)})` : ""}
                        </div>
                      ) : null}
                      {col.key === "onboarding" && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${L.border}` }}>
                          {CHECKLIST_ITEMS.map((item) => {
                            const done = !!lead[item.key];
                            return (
                              <button
                                key={item.key}
                                onClick={(e) => { e.stopPropagation(); toggleChecklist(lead, item.key); }}
                                style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", padding: "2px 0", textAlign: "left" }}
                              >
                                {done ? <CheckCircle2 style={{ width: 13, height: 13, color: "#16a34a", flexShrink: 0 }} /> : <Circle style={{ width: 13, height: 13, color: L.dimmed, flexShrink: 0 }} />}
                                <span style={{ fontSize: 11.5, color: done ? "#15803d" : L.text, textDecoration: done ? "line-through" : "none" }}>{item.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

function AwaitingOutcomeCard({ lead, onLog }: { lead: Lead; onLog: (lead: Lead, outcome: PostCallOutcome, objection: string) => void }) {
  const [objection, setObjection] = useState("");
  return (
    <div style={{ background: L.surface, border: `1px solid ${L.border}`, padding: "14px 18px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>{lead.contact_name || lead.company}</span>
        <span style={{ fontSize: 12.5, color: L.muted }}>{lead.company}</span>
      </div>
      <input
        value={objection}
        onChange={(e) => setObjection(e.target.value)}
        placeholder="Main objection (optional)"
        style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${L.border}`, padding: "6px 10px", fontSize: 12.5, marginBottom: 8 }}
      />
      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={() => onLog(lead, "closed_won", objection)} style={btnStyle("#dcfce7")}>Closed Won</button>
        <button onClick={() => onLog(lead, "hot", objection)} style={btnStyle("#fee2e2")}>Hot</button>
        <button onClick={() => onLog(lead, "warm", objection)} style={btnStyle("#fef9c3")}>Warm</button>
      </div>
    </div>
  );
}
