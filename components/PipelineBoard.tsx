"use client";

import { useState } from "react";
import Link from "next/link";
import { Building2, ChevronDown, Mail, Phone, Globe, MapPin, StickyNote, ExternalLink, CalendarClock } from "lucide-react";
import { Lead, EngagementSummary } from "@/lib/types";
import { nextStepFor } from "@/lib/leads";
import { cleanNotes, extractMeetingTime } from "@/lib/notes";
import { COLD_CALL_STATUS_LABELS, COLD_CALL_STATUS_COLORS } from "@/lib/coldCallStatus";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };
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
  lead, engagement, expanded, onToggle, onDragStart,
}: {
  lead: Lead; engagement: Record<string, EngagementSummary>; expanded: boolean;
  onToggle: () => void; onDragStart: (e: React.DragEvent) => void;
}) {
  const ev = engagement[lead.lead_id];
  const isDue = nextStepFor(lead) !== null;
  const noteEntries = cleanNotes(lead.notes);
  const meetingTime = extractMeetingTime(noteEntries);
  const latestNote = noteEntries[noteEntries.length - 1] || null;
  const olderNotes = noteEntries.slice(0, -1);
  const [showAllNotes, setShowAllNotes] = useState(false);
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
          {lead.contact_name && (
            <div style={{ fontSize: 12, color: L.text, fontWeight: 600 }}>{lead.contact_name}</div>
          )}
          {lead.email && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: L.muted }}>
              <Mail style={{ width: 11, height: 11, flexShrink: 0 }} /> <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{lead.email}</span>
            </div>
          )}
          {lead.phone && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: L.muted }}>
              <Phone style={{ width: 11, height: 11, flexShrink: 0 }} /> {lead.phone}
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
          {latestNote && (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 11.5, color: L.muted }}>
              <StickyNote style={{ width: 11, height: 11, flexShrink: 0, marginTop: 1 }} />
              <span style={{ whiteSpace: "pre-wrap" }}>{latestNote.text}</span>
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
  col, leads, engagement, expandedId, onToggle, onDragStart, onDrop, dropDisabled, isDragOver, onDragOverColumn, onDragLeaveColumn,
}: {
  col: Column; leads: Lead[]; engagement: Record<string, EngagementSummary>;
  expandedId: string | null; onToggle: (id: string) => void; onDragStart: (lead: Lead) => (e: React.DragEvent) => void;
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
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  function toggle(id: string) {
    setExpandedId(prev => (prev === id ? null : id));
  }

  function dragStart(lead: Lead) {
    return (e: React.DragEvent) => {
      setDraggingId(lead.lead_id);
      e.dataTransfer.setData("text/plain", lead.lead_id);
      e.dataTransfer.effectAllowed = "move";
    };
  }

  async function handleDrop(sectionKey: string, columnKey: string) {
    const id = draggingId;
    setDraggingId(null);
    if (!id) return;

    let newStatus: string | null = null;
    setSections(prev => prev.map(s => {
      if (s.key !== sectionKey) return s;
      return {
        ...s,
        leads: s.leads.map(l => {
          if (l.lead_id !== id) return l;
          if (l.status === columnKey) return l;
          newStatus = columnKey;
          return { ...l, status: columnKey as Lead["status"] };
        }),
      };
    }));

    if (!newStatus) return;
    try {
      const res = await fetch(`/api/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error("update failed");
    } catch {
      alert("Couldn't save that move — refresh and try again.");
    }
  }

  return (
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
  );
}
