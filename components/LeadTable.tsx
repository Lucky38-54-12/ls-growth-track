"use client";

import { Lead, EngagementSummary } from "@/lib/types";
import { Mail, ChevronRight } from "lucide-react";
import Link from "next/link";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };

export const STATUS_LABEL: Record<string, string> = {
  not_contacted: "New Lead",
  contacted: "Contacted",
  followup_1_sent: "Follow-up 1",
  followup_2_sent: "Follow-up 2",
  replied: "Replied",
  booked: "Booked",
  sequence_complete: "Closed",
  not_interested: "Closed",
  bounced: "Closed",
};

export const STATUS_COLOR: Record<string, { bg: string; fg: string }> = {
  not_contacted: { bg: "#f1f5f9", fg: "#475569" },
  contacted: { bg: "#dbeafe", fg: "#1e40af" },
  followup_1_sent: { bg: "#ede9fe", fg: "#6d28d9" },
  followup_2_sent: { bg: "#ede9fe", fg: "#6d28d9" },
  replied: { bg: "#dcfce7", fg: "#166534" },
  booked: { bg: "#dcfce7", fg: "#166534" },
  sequence_complete: { bg: "#f1f5f9", fg: "#64748b" },
  not_interested: { bg: "#f1f5f9", fg: "#64748b" },
  bounced: { bg: "#f1f5f9", fg: "#64748b" },
};

function initials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

export function LeadRow({
  lead, engagement, isLast, selectable, selected, onToggle,
}: {
  lead: Lead;
  engagement: Record<string, EngagementSummary>;
  isLast: boolean;
  selectable?: boolean;
  selected?: boolean;
  onToggle?: (leadId: string) => void;
}) {
  const ss = STATUS_COLOR[lead.status] || STATUS_COLOR.not_contacted;
  const ev = engagement[lead.lead_id];
  return (
    <tr className="row-hover" style={{ borderBottom: isLast ? "none" : `1px solid ${L.border}`, cursor: "pointer" }}>
      {selectable && (
        <td style={{ padding: "8px 0 8px 14px", width: 28 }}>
          <input
            type="checkbox"
            checked={!!selected}
            onChange={() => onToggle?.(lead.lead_id)}
            onClick={(e) => e.stopPropagation()}
            style={{ width: 14, height: 14, cursor: "pointer" }}
          />
        </td>
      )}
      <td style={{ padding: "8px 14px" }}>
        <Link href={`/dashboard/leads/${lead.lead_id}`} style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <div style={{ width: 26, height: 26, background: ss.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9.5, fontWeight: 700, color: ss.fg, flexShrink: 0 }}>
            {initials(lead.company)}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: L.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{lead.company}</div>
            <div style={{ fontSize: 10.5, color: L.dimmed }}>{lead.contact_name || "—"}</div>
          </div>
        </Link>
      </td>
      <td style={{ padding: "8px 14px" }}>
        <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", background: ss.bg, color: ss.fg }}>{STATUS_LABEL[lead.status] || lead.status}</span>
      </td>
      <td style={{ padding: "8px 14px" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: L.muted }}>
          <Mail style={{ width: 11, height: 11 }} />{lead.email || "—"}
        </span>
      </td>
      <td style={{ padding: "8px 14px" }}>
        {ev && (ev.opens > 0 || ev.clicks > 0) ? (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {ev.opens > 0 && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", background: "#dbeafe", color: "#1e40af" }}>{ev.opens} open{ev.opens !== 1 ? "s" : ""}</span>}
            {ev.clicks > 0 && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", background: "#fce7f3", color: "#9d174d" }}>{ev.clicks} click{ev.clicks !== 1 ? "s" : ""}</span>}
          </div>
        ) : (
          <span style={{ fontSize: 11, color: L.dimmed }}>—</span>
        )}
      </td>
      <td style={{ padding: "8px 14px", textAlign: "right" }}>
        <Link href={`/dashboard/leads/${lead.lead_id}`} style={{ color: L.dimmed, display: "inline-flex" }}>
          <ChevronRight style={{ width: 14, height: 14 }} />
        </Link>
      </td>
    </tr>
  );
}

export function LeadRowsTable({
  leads, engagement, selectable, selectedIds, onToggleLead,
}: {
  leads: Lead[];
  engagement: Record<string, EngagementSummary>;
  selectable?: boolean;
  selectedIds?: Set<string>;
  onToggleLead?: (leadId: string) => void;
}) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <tbody>
        {leads.map((lead, i) => (
          <LeadRow
            key={lead.lead_id}
            lead={lead}
            engagement={engagement}
            isLast={i === leads.length - 1}
            selectable={selectable}
            selected={selectedIds?.has(lead.lead_id)}
            onToggle={onToggleLead}
          />
        ))}
      </tbody>
    </table>
  );
}

export function SegmentSection({
  label, leads, engagement, selectable, selectedIds, onToggleLead, onToggleAll,
}: {
  label: string;
  leads: Lead[];
  engagement: Record<string, EngagementSummary>;
  selectable?: boolean;
  selectedIds?: Set<string>;
  onToggleLead?: (leadId: string) => void;
  onToggleAll?: (leadIds: string[], select: boolean) => void;
}) {
  const warm = leads.filter((l) => l.status === "replied" || l.status === "booked").length;
  const leadIds = leads.map((l) => l.lead_id);
  const allSelected = selectable && leadIds.length > 0 && leadIds.every((id) => selectedIds?.has(id));
  return (
    <div style={{ background: L.surface, border: `1px solid ${L.border}`, overflow: "hidden" }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8, padding: "9px 14px",
        borderBottom: `1px solid ${L.border}`, background: "#f8fafc",
      }}>
        {selectable && (
          <input
            type="checkbox"
            checked={allSelected}
            onChange={() => onToggleAll?.(leadIds, !allSelected)}
            style={{ width: 14, height: 14, cursor: "pointer" }}
          />
        )}
        <span style={{ fontSize: 12, fontWeight: 700, color: L.text }}>{label}</span>
        <span style={{ fontSize: 10.5, fontWeight: 700, padding: "1px 7px", background: "#e2e8f0", color: L.muted }}>{leads.length}</span>
        {warm > 0 && <span style={{ fontSize: 10.5, fontWeight: 700, padding: "1px 7px", background: "#dcfce7", color: "#166534" }}>{warm} warm</span>}
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          {leads.map((lead, i) => (
            <LeadRow
              key={lead.lead_id}
              lead={lead}
              engagement={engagement}
              isLast={i === leads.length - 1}
              selectable={selectable}
              selected={selectedIds?.has(lead.lead_id)}
              onToggle={onToggleLead}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
