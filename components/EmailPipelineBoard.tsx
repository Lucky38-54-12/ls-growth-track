"use client";

import { useState } from "react";
import Link from "next/link";
import { Building2, ChevronDown, Mail, Globe, MapPin, StickyNote, ExternalLink, Clock, Megaphone } from "lucide-react";
import { Lead, EngagementSummary, Campaign } from "@/lib/types";
import { nextStepFor } from "@/lib/leads";
import { cleanNotes } from "@/lib/notes";
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

const LOST_STATUSES = new Set(["not_interested", "bounced"]);

export type EmailColumn = { key: string; label: string };

function groupByColumn(leads: Lead[], columns: EmailColumn[]): Record<string, Lead[]> {
  const grouped: Record<string, Lead[]> = {};
  for (const col of columns) grouped[col.key] = [];
  for (const lead of leads) {
    const key = LOST_STATUSES.has(lead.status) ? "lost" : lead.status;
    if (grouped[key]) grouped[key].push(lead);
    else grouped[columns[0].key].push(lead);
  }
  return grouped;
}

function LeadCard({
  lead, engagement, campaignName, expanded, onToggle,
}: {
  lead: Lead; engagement: Record<string, EngagementSummary>; campaignName: string;
  expanded: boolean; onToggle: () => void;
}) {
  const ev = engagement[lead.lead_id];
  const isDue = nextStepFor(lead) !== null;
  const lastTouchpoint = daysAgo(lead.last_followup || lead.date_contacted);
  const noteEntries = cleanNotes(lead.notes);
  const latestNote = noteEntries[noteEntries.length - 1] || null;
  const statusLabel = COLD_CALL_STATUS_LABELS[lead.status];
  const statusColor = COLD_CALL_STATUS_COLORS[lead.status];

  return (
    <div
      onClick={onToggle}
      className="card-hover"
      style={{ background: L.surface, border: `1px solid ${L.border}`, padding: "12px 14px", cursor: "pointer" }}
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
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {statusLabel && (
              <span style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 8px", borderRadius: 5, background: statusColor?.bg || "#f1f5f9", color: statusColor?.text || L.muted }}>
                {statusLabel}
              </span>
            )}
            {campaignName && (
              <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 700, padding: "3px 8px", borderRadius: 5, background: "#ede9fe", color: "#5b21b6" }}>
                <Megaphone style={{ width: 11, height: 11 }} /> {campaignName}
              </span>
            )}
          </div>
          {lead.email && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: L.muted }}>
              <Mail style={{ width: 11, height: 11, flexShrink: 0 }} /> <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{lead.email}</span>
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
              <Clock style={{ width: 11, height: 11, flexShrink: 0 }} /> Last touch: {lastTouchpoint}
            </div>
          )}
          {latestNote && (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 11.5, color: L.muted }}>
              <StickyNote style={{ width: 11, height: 11, flexShrink: 0, marginTop: 1 }} />
              <span>{latestNote.text.slice(0, 140)}</span>
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

// Read-only by design, no drag-and-drop. Unlike cold-call leads (whose status
// is set manually by Lucky), a campaign lead's status is only ever supposed
// to change via sendNextStepFor (lib/sendPipeline.ts), which also updates
// date_contacted/last_followup in the same write. Letting someone drag a
// card to a new column here would flip status without touching those dates,
// silently desyncing nextStepFor's timing (e.g. a lead dragged to
// "followup_2_sent" would never actually become due for followup3, since
// that's computed from date_contacted, not status).
export default function EmailPipelineBoard({
  leads, columns, engagement, campaignById,
}: {
  leads: Lead[]; columns: EmailColumn[]; engagement: Record<string, EngagementSummary>;
  campaignById: Map<string, Campaign>;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const grouped = groupByColumn(leads, columns);

  return (
    <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8, alignItems: "start" }}>
      {columns.map(col => (
        <div key={col.key} style={{ width: 270, flexShrink: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="surface-card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: L.text }}>{col.label}</span>
            <span style={{ fontSize: 20, fontWeight: 800, color: L.text }}>{grouped[col.key].length}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 80 }}>
            {grouped[col.key].length === 0 ? (
              <div style={{ padding: 20, textAlign: "center", color: L.dimmed, fontSize: 12, background: "#f8fafc", border: `1px dashed ${L.border}`, borderRadius: 10 }}>Empty</div>
            ) : (
              grouped[col.key].map(lead => (
                <LeadCard
                  key={lead.lead_id}
                  lead={lead}
                  engagement={engagement}
                  campaignName={lead.campaign_id ? campaignById.get(lead.campaign_id)?.name || "" : ""}
                  expanded={expandedId === lead.lead_id}
                  onToggle={() => setExpandedId(prev => (prev === lead.lead_id ? null : lead.lead_id))}
                />
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
