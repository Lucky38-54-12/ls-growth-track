"use client";
import { useState } from "react";
import { Flame, Snowflake, PauseCircle, Wind, CheckCircle2, Circle } from "lucide-react";
import { Lead, PostCallOutcome } from "@/lib/types";
import { advance, currentStep, firstTouchpointDate, TouchpointResult } from "@/lib/followUpCadence";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };

const OUTCOME_BADGE: Record<PostCallOutcome, { bg: string; text: string; label: string }> = {
  hot: { bg: "#fee2e2", text: "#b91c1c", label: "Hot" },
  warm: { bg: "#fef9c3", text: "#854d0e", label: "Warm" },
  closed_won: { bg: "#dcfce7", text: "#15803d", label: "Closed Won" },
};

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

interface Props {
  initialAwaitingOutcome: Lead[];
  initialGraduated: Lead[];
}

export default function DiscoveryPipelineClient({ initialAwaitingOutcome, initialGraduated }: Props) {
  const [awaiting, setAwaiting] = useState<Lead[]>(initialAwaitingOutcome);
  const [leads, setLeads] = useState<Lead[]>(initialGraduated);

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

  async function logSecondCallResult(lead: Lead, result: "closed_won" | "no_close") {
    const ok = await postJson(`/api/leads/${lead.lead_id}/second-call-result`, { result });
    if (!ok) return;
    updateLead(lead.lead_id, { post_call_stage: result === "closed_won" ? "onboarding" : "cold_again" });
  }

  async function toggleChecklist(lead: Lead, key: (typeof CHECKLIST_ITEMS)[number]["key"]) {
    const next = !lead[key];
    updateLead(lead.lead_id, { [key]: next } as Partial<Lead>);
    await patchJson(`/api/leads/${lead.lead_id}/onboarding-checklist`, { [key]: next });
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
  const hotActive = active.filter((l) => l.post_call_outcome === "hot");
  const warmActive = active.filter((l) => l.post_call_outcome === "warm");
  const paused = leads.filter((l) => l.post_call_stage === "paused");
  const coldAgain = leads.filter((l) => l.post_call_stage === "cold_again");
  const onboarding = leads.filter((l) => l.post_call_stage === "onboarding");

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

      {/* Awaiting outcome */}
      <Section title="Awaiting Outcome" count={awaiting.length}>
        {awaiting.length === 0 ? (
          <p style={{ fontSize: 13, color: L.muted }}>No sales calls waiting to be logged.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {awaiting.map((lead) => <AwaitingOutcomeCard key={lead.lead_id} lead={lead} onLog={logSalesCallDone} />)}
          </div>
        )}
      </Section>

      {/* Active pipeline */}
      <Section title="Active Pipeline" count={active.length}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: "#b91c1c", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}><Flame style={{ width: 13, height: 13 }} /> Hot ({hotActive.length})</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {hotActive.map((lead) => <ActiveLeadCard key={lead.lead_id} lead={lead} />)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: "#854d0e", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}><Snowflake style={{ width: 13, height: 13 }} /> Warm ({warmActive.length})</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {warmActive.map((lead) => <ActiveLeadCard key={lead.lead_id} lead={lead} />)}
            </div>
          </div>
        </div>
      </Section>

      {/* Paused */}
      <Section title="Paused (second call booked)" count={paused.length}>
        {paused.length === 0 ? (
          <p style={{ fontSize: 13, color: L.muted }}>None right now.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {paused.map((lead) => (
              <div key={lead.lead_id} style={{ background: L.surface, border: `1px solid ${L.border}`, padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <PauseCircle style={{ width: 14, height: 14, color: L.muted }} />
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{lead.contact_name || lead.company}</span>
                    <span style={{ fontSize: 12.5, color: L.muted }}>{lead.company}</span>
                  </div>
                  <LeadMeta lead={lead} />
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => logSecondCallResult(lead, "closed_won")} style={btnStyle("#dcfce7")}>Closed Won</button>
                  <button onClick={() => logSecondCallResult(lead, "no_close")} style={btnStyle("#f1f5f9")}>Didn&apos;t close</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Cold again */}
      <Section title="Cold Again" count={coldAgain.length}>
        {coldAgain.length === 0 ? (
          <p style={{ fontSize: 13, color: L.muted }}>None right now.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {coldAgain.map((lead) => (
              <div key={lead.lead_id} style={{ background: "#f8fafc", border: `1px solid ${L.border}`, padding: "10px 16px", display: "flex", alignItems: "center", gap: 10 }}>
                <Wind style={{ width: 13, height: 13, color: L.dimmed, flexShrink: 0 }} />
                <span style={{ fontWeight: 700, fontSize: 13 }}>{lead.contact_name || lead.company}</span>
                <span style={{ fontSize: 12.5, color: L.muted }}>{lead.company}</span>
                <span style={{ fontSize: 12, color: L.dimmed, marginLeft: "auto" }}>Cooled {fmtDate(lead.last_touchpoint_at)}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Onboarding */}
      <Section title="Onboarding" count={onboarding.length}>
        {onboarding.length === 0 ? (
          <p style={{ fontSize: 13, color: L.muted }}>No closed-won clients yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {onboarding.map((lead) => (
              <div key={lead.lead_id} style={{ background: L.surface, border: `1px solid ${L.border}`, padding: "16px 20px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{lead.contact_name || lead.company}</span>
                  <span style={{ fontSize: 12.5, color: L.muted }}>{lead.company}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {CHECKLIST_ITEMS.map((item) => {
                    const done = !!lead[item.key];
                    return (
                      <button
                        key={item.key}
                        onClick={() => toggleChecklist(lead, item.key)}
                        style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", padding: "4px 0", textAlign: "left" }}
                      >
                        {done ? <CheckCircle2 style={{ width: 16, height: 16, color: "#16a34a", flexShrink: 0 }} /> : <Circle style={{ width: 16, height: 16, color: L.dimmed, flexShrink: 0 }} />}
                        <span style={{ fontSize: 13, color: done ? "#15803d" : L.text, textDecoration: done ? "line-through" : "none" }}>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function btnStyle(bg: string): React.CSSProperties {
  return { padding: "6px 12px", background: bg, border: `1px solid ${L.border}`, fontSize: 12, fontWeight: 700, color: L.text, cursor: "pointer" };
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

function ActiveLeadCard({ lead }: { lead: Lead }) {
  const step = currentStep(lead.post_call_outcome as "hot" | "warm", lead.touchpoint_index);
  return (
    <div style={{ background: L.surface, border: `1px solid ${L.border}`, padding: "12px 16px" }}>
      <div style={{ fontWeight: 700, fontSize: 13.5 }}>{lead.contact_name || lead.company}</div>
      <div style={{ fontSize: 12, color: L.muted }}>{lead.company}</div>
      <LeadMeta lead={lead} />
      <div style={{ fontSize: 12, color: L.muted, marginTop: 4 }}>
        Next: {step?.label || "—"}{lead.next_touchpoint_at ? ` (${fmtDate(lead.next_touchpoint_at)})` : ""}
      </div>
    </div>
  );
}
