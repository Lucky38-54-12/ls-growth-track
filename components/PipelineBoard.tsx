"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Building2, ChevronDown, Mail, Phone, Globe, MapPin, StickyNote, ExternalLink, CalendarClock, Sparkles, Clock, Search, Copy, Check } from "lucide-react";
import FollowUpModal from "@/components/FollowUpModal";
import { Lead, EngagementSummary } from "@/lib/types";
import { nextStepFor } from "@/lib/leads";
import { cleanNotes, extractMeetingTime } from "@/lib/notes";
import { COLD_CALL_STATUS_LABELS, COLD_CALL_STATUS_COLORS } from "@/lib/coldCallStatus";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };

function daysAgo(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return `${diff}d ago`;
  if (diff < 30) return `${Math.floor(diff / 7)}w ago`;
  return `${Math.floor(diff / 30)}mo ago`;
}
const NO_CLOSE_STATUSES = new Set(["sequence_complete", "not_interested", "bounced"]);
const COLD_CALL_EMAIL_SENT_STATUSES = new Set(["contacted", "followup_1_sent", "followup_2_sent", "replied"]);

type Column = { key: string; label: string };
type Section = { key: string; label: string; leads: Lead[] };

function groupByStatus(leads: Lead[], columns: Column[], activeSource: string): Record<string, Lead[]> {
  const grouped: Record<string, Lead[]> = {};
  for (const col of columns) grouped[col.key] = [];
  for (const lead of leads) {
    let key = NO_CLOSE_STATUSES.has(lead.status) ? "no_close" : lead.status;
    if (activeSource === "cold_call" && COLD_CALL_EMAIL_SENT_STATUSES.has(key)) key = "contacted";
    if (grouped[key]) grouped[key].push(lead);
    else grouped[columns[0].key].push(lead);
  }
  return grouped;
}

function LeadCard({
  lead, engagement, expanded, onToggle, onDragStart, onFollowUp, onLeadUpdated,
}: {
  lead: Lead; engagement: Record<string, EngagementSummary>; expanded: boolean;
  onToggle: () => void; onDragStart: (e: React.DragEvent) => void; onFollowUp: (id: string) => void;
  onLeadUpdated: (lead: Lead) => void;
}) {
  const ev = engagement[lead.lead_id];
  const isDue = nextStepFor(lead) !== null;
  const lastTouchpoint = daysAgo(lead.last_followup || lead.date_contacted);
  const noteEntries = cleanNotes(lead.notes);
  const meetingTime = extractMeetingTime(noteEntries);
  const latestNote = noteEntries[noteEntries.length - 1] || null;
  const olderNotes = noteEntries.slice(0, -1);
  const [showAllNotes, setShowAllNotes] = useState(false);
  const [noteSummary, setNoteSummary] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [findingDetails, setFindingDetails] = useState(false);
  const [findResult, setFindResult] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const missingDetails = !lead.phone || !lead.email || !lead.website || !lead.contact_name || lead.contact_name === "there";

  function copyToClipboard(e: React.MouseEvent, field: string, value: string) {
    e.stopPropagation();
    navigator.clipboard.writeText(value);
    setCopiedField(field);
    setTimeout(() => setCopiedField((f) => (f === field ? null : f)), 1500);
  }

  function copyAllDetails(e: React.MouseEvent) {
    const lines = [
      lead.company,
      lead.contact_name && lead.contact_name !== "there" ? lead.contact_name : null,
      lead.phone,
      lead.email,
      lead.website,
      lead.location,
    ].filter(Boolean);
    copyToClipboard(e, "all", lines.join("\n"));
  }

  function CopyIcon({ field, value }: { field: string; value: string }) {
    return (
      <button
        onClick={(e) => copyToClipboard(e, field, value)}
        title="Copy"
        style={{
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          width: 18, height: 18, marginLeft: "auto", background: "none", border: "none", cursor: "pointer",
          color: copiedField === field ? "var(--green)" : L.dimmed,
        }}
      >
        {copiedField === field ? <Check style={{ width: 11, height: 11 }} /> : <Copy style={{ width: 11, height: 11 }} />}
      </button>
    );
  }

  async function handleFindDetails(e: React.MouseEvent) {
    e.stopPropagation();
    setFindingDetails(true);
    setFindResult(null);
    try {
      const res = await fetch(`/api/leads/${lead.lead_id}/find-details`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setFindResult(data.error || "Couldn't find anything."); return; }
      onLeadUpdated(data.lead);
      setFindResult(data.found.length ? `Found ${data.found.join(", ")}.` : "Nothing new found.");
    } catch {
      setFindResult("Couldn't find anything, try again.");
    } finally {
      setFindingDetails(false);
    }
  }

  useEffect(() => {
    if (!expanded || noteSummary || summaryLoading || !latestNote) return;
    setSummaryLoading(true);
    fetch("/api/summarise-note", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: noteEntries.map(e => e.text).join("\n") }),
    })
      .then(r => r.json())
      .then(d => setNoteSummary(d.summary || null))
      .finally(() => setSummaryLoading(false));
  }, [expanded]);
  const statusLabel = COLD_CALL_STATUS_LABELS[lead.status];
  const statusColor = COLD_CALL_STATUS_COLORS[lead.status];
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onToggle}
      className="card-hover"
      style={{ background: L.surface, border: `1px solid ${L.border}`, padding: "12px 14px", cursor: "grab" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${L.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Building2 style={{ width: 12, height: 12, color: L.muted }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: L.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lead.company}</p>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 1 }}>
            <span style={{ fontSize: 10, color: L.dimmed }}>{lead.trade || "—"}</span>
            {lead.location && <span style={{ fontSize: 10, color: L.dimmed }}>· {lead.location}</span>}
          </div>
        </div>
        {isDue && <span title="Due now" style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--red)", flexShrink: 0 }} />}
        <ChevronDown style={{ width: 13, height: 13, color: L.dimmed, flexShrink: 0, transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
      </div>

      {(ev?.opens > 0 || ev?.clicks > 0) && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8, paddingTop: 8, borderTop: `1px solid ${L.border}` }}>
          {ev?.opens > 0 && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 5, background: "#dbeafe", color: "#1e40af" }}>{ev.opens} open{ev.opens !== 1 ? "s" : ""}</span>}
          {ev?.clicks > 0 && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 5, background: "#fce7f3", color: "#9d174d" }}>{ev.clicks} click{ev.clicks !== 1 ? "s" : ""}</span>}
        </div>
      )}

      {expanded && (
        <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${L.border}`, display: "flex", flexDirection: "column", gap: 6 }}>
          <button
            onClick={copyAllDetails}
            style={{
              display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, fontWeight: 700,
              color: copiedField === "all" ? "var(--green)" : L.muted, background: "#f8fafc", border: `1px solid ${L.border}`,
              padding: "5px 9px", cursor: "pointer", alignSelf: "flex-end",
            }}
          >
            {copiedField === "all" ? <Check style={{ width: 11, height: 11 }} /> : <Copy style={{ width: 11, height: 11 }} />}
            {copiedField === "all" ? "Copied" : "Copy details"}
          </button>
          {(statusLabel || meetingTime) && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {statusLabel && (
                <span style={{
                  fontSize: 10.5, fontWeight: 700, padding: "3px 8px", borderRadius: 5,
                  background: statusColor?.bg || "#f1f5f9", color: statusColor?.text || L.muted,
                }}>{statusLabel}</span>
              )}
              {meetingTime && (
                <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 700, padding: "3px 8px", borderRadius: 5, background: "#dbeafe", color: "#1e40af" }}>
                  <CalendarClock style={{ width: 11, height: 11 }} /> {meetingTime}
                </span>
              )}
            </div>
          )}
          {lead.contact_name && lead.contact_name !== "there" && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: L.text, fontWeight: 600 }}>
              {lead.contact_name}
              <CopyIcon field="name" value={lead.contact_name} />
            </div>
          )}
          {lead.email && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: L.muted }}>
              <Mail style={{ width: 11, height: 11, flexShrink: 0 }} /> <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{lead.email}</span>
              <CopyIcon field="email" value={lead.email} />
            </div>
          )}
          {lead.phone && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: L.muted }}>
              <Phone style={{ width: 11, height: 11, flexShrink: 0 }} /> {lead.phone}
              <CopyIcon field="phone" value={lead.phone} />
            </div>
          )}
          {lead.website && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: L.muted, overflow: "hidden" }}>
              <Globe style={{ width: 11, height: 11, flexShrink: 0 }} /> <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lead.website}</span>
            </div>
          )}
          {lead.location && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: L.muted }}>
              <MapPin style={{ width: 11, height: 11, flexShrink: 0 }} /> {lead.location}
            </div>
          )}
          {lastTouchpoint && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: L.dimmed }}>
              <Clock style={{ width: 11, height: 11, flexShrink: 0 }} /> Last contact: {lastTouchpoint}
            </div>
          )}
          {latestNote && (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 11.5, color: L.muted }}>
              <StickyNote style={{ width: 11, height: 11, flexShrink: 0, marginTop: 1 }} />
              <span>{summaryLoading ? "Summarising…" : (noteSummary || latestNote.text.slice(0, 120))}</span>
            </div>
          )}
          {olderNotes.length > 0 && (
            <div>
              <button
                onClick={(e) => { e.stopPropagation(); setShowAllNotes((s) => !s); }}
                style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 10.5, fontWeight: 700, color: L.dimmed }}
              >
                {showAllNotes ? "Hide earlier notes" : `${olderNotes.length} earlier note${olderNotes.length !== 1 ? "s" : ""}`}
              </button>
              {showAllNotes && (
                <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
                  {olderNotes.map((entry, i) => (
                    <span key={i} style={{ fontSize: 11, color: L.dimmed, whiteSpace: "pre-wrap" }}>{entry.text}</span>
                  ))}
                </div>
              )}
            </div>
          )}
          {missingDetails && (
            <button
              onClick={handleFindDetails}
              disabled={findingDetails}
              style={{
                display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 700,
                color: "#1e40af", background: "#dbeafe", border: "none", padding: "6px 10px",
                cursor: findingDetails ? "default" : "pointer", marginTop: 4, width: "100%", justifyContent: "center",
              }}
            >
              <Search style={{ width: 11, height: 11 }} /> {findingDetails ? "Searching…" : "Find contact details"}
            </button>
          )}
          {findResult && (
            <div style={{ fontSize: 11, color: L.muted, textAlign: "center" }}>{findResult}</div>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onFollowUp(lead.lead_id); }}
            style={{
              display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 700,
              color: "#7c3aed", background: "#ede9fe", border: "none", padding: "6px 10px",
              cursor: "pointer", marginTop: 4, width: "100%", justifyContent: "center",
            }}
          >
            <Sparkles style={{ width: 11, height: 11 }} /> Craft Follow-Up Email
          </button>
          <Link href={`/dashboard/leads/${lead.lead_id}`} style={{
            display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 700, color: "var(--red)", marginTop: 4, textDecoration: "none",
          }}>
            Open full record <ExternalLink style={{ width: 11, height: 11 }} />
          </Link>
        </div>
      )}
    </div>
  );
}

function KanbanColumn({
  col, leads, engagement, expandedId, onToggle, onDragStart, onFollowUp, onLeadUpdated, onDrop, dropDisabled, isDragOver, onDragOverColumn, onDragLeaveColumn,
}: {
  col: Column; leads: Lead[]; engagement: Record<string, EngagementSummary>;
  expandedId: string | null; onToggle: (id: string) => void; onDragStart: (lead: Lead) => (e: React.DragEvent) => void;
  onFollowUp: (id: string) => void; onLeadUpdated: (lead: Lead) => void;
  onDrop: () => void; dropDisabled: boolean; isDragOver: boolean;
  onDragOverColumn: () => void; onDragLeaveColumn: () => void;
}) {
  return (
    <div
      style={{ width: 270, flexShrink: 0, display: "flex", flexDirection: "column", gap: 8 }}
      onDragOver={(e) => { if (dropDisabled) return; e.preventDefault(); onDragOverColumn(); }}
      onDragLeave={onDragLeaveColumn}
      onDrop={(e) => { if (dropDisabled) return; e.preventDefault(); onDragLeaveColumn(); onDrop(); }}
    >
      <div className="surface-card" style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 14px",
      }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: L.text }}>{col.label}</span>
        <span style={{ fontSize: 20, fontWeight: 800, color: L.text }}>{leads.length}</span>
      </div>
      <div style={{
        display: "flex", flexDirection: "column", gap: 8, minHeight: 80, padding: 4, borderRadius: 10,
        background: isDragOver ? "#fef2f2" : "transparent",
        border: isDragOver ? "1px dashed var(--red)" : "1px dashed transparent",
        transition: "background 0.1s, border 0.1s",
      }}>
        {leads.length === 0 ? (
          <div style={{ padding: 20, textAlign: "center", color: L.dimmed, fontSize: 12, background: "#f8fafc", border: `1px dashed ${L.border}`, borderRadius: 10 }}>Empty</div>
        ) : (
          leads.map(lead => (
            <LeadCard
              key={lead.lead_id}
              lead={lead}
              engagement={engagement}
              expanded={expandedId === lead.lead_id}
              onToggle={() => onToggle(lead.lead_id)}
              onDragStart={onDragStart(lead)}
              onFollowUp={onFollowUp}
              onLeadUpdated={onLeadUpdated}
            />
          ))
        )}
      </div>
    </div>
  );
}

export default function PipelineBoard({
  sections: initialSections, columns, engagement, activeSource,
}: {
  sections: Section[]; columns: Column[]; engagement: Record<string, EngagementSummary>; activeSource: string;
}) {
  const [sections, setSections] = useState(initialSections);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const draggingId = useRef<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [followUpId, setFollowUpId] = useState<string | null>(null);

  const followUpLead = followUpId
    ? sections.flatMap(s => s.leads).find(l => l.lead_id === followUpId) || null
    : null;

  function toggle(id: string) {
    setExpandedId(prev => (prev === id ? null : id));
  }

  function handleLeadUpdated(updated: Lead) {
    setSections(prev => prev.map(s => ({
      ...s,
      leads: s.leads.map(l => (l.lead_id === updated.lead_id ? updated : l)),
    })));
  }

  function dragStart(lead: Lead) {
    return (e: React.DragEvent) => {
      draggingId.current = lead.lead_id;
      e.dataTransfer.setData("text/plain", lead.lead_id);
      e.dataTransfer.effectAllowed = "move";
    };
  }

  async function handleDrop(sectionKey: string, columnKey: string) {
    const id = draggingId.current;
    draggingId.current = null;
    if (!id) return;

    // Find the lead BEFORE updating state (setSections updater runs async,
    // so we can't rely on side-effects inside it to know what to save)
    const lead = sections
      .flatMap(s => s.leads)
      .find(l => l.lead_id === id);
    if (!lead || lead.status === columnKey) return;

    // Optimistic UI update
    setSections(prev => prev.map(s => ({
      ...s,
      leads: s.leads.map(l =>
        l.lead_id === id ? { ...l, status: columnKey as Lead["status"] } : l
      ),
    })));

    // Persist to DB
    try {
      const res = await fetch(`/api/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: columnKey }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
    } catch (err) {
      console.error("Status save failed:", err);
      alert(`Couldn't save: ${err instanceof Error ? err.message : "unknown error"} — refresh and try again.`);
    }
  }

  return (
    <>
    {followUpLead && (
      <FollowUpModal
        leadId={followUpLead.lead_id}
        company={followUpLead.company}
        onClose={() => setFollowUpId(null)}
      />
    )}
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {sections.map(section => {
        const grouped = groupByStatus(section.leads, columns, activeSource);
        return (
          <div key={section.key} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: L.text }}>{section.label}</span>
              <span style={{ fontSize: 10.5, fontWeight: 700, padding: "1px 7px", background: "#e2e8f0", color: L.muted }}>{section.leads.length}</span>
              <div style={{ flex: 1, height: 1, background: L.border }} />
            </div>
            <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8, alignItems: "start" }}>
              {columns.map(col => {
                const dropKey = `${section.key}:${col.key}`;
                return (
                  <KanbanColumn
                    key={col.key}
                    col={col}
                    leads={grouped[col.key]}
                    engagement={engagement}
                    expandedId={expandedId}
                    onToggle={toggle}
                    onDragStart={dragStart}
                    onFollowUp={(id) => setFollowUpId(id)}
                    onLeadUpdated={handleLeadUpdated}
                    dropDisabled={false}
                    isDragOver={dragOverKey === dropKey}
                    onDragOverColumn={() => setDragOverKey(dropKey)}
                    onDragLeaveColumn={() => setDragOverKey(prev => (prev === dropKey ? null : prev))}
                    onDrop={() => handleDrop(section.key, col.key)}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
    </>
  );
}
