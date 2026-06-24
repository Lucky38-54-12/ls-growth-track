import { createSupabaseClient, fetchAllRows } from "@/lib/supabase";
import { Lead, EmailEvent, EngagementSummary } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
import { groupBySegment, segmentKey, segmentLabel } from "@/lib/leads";
import Topbar from "@/components/Topbar";
import { Search, Plus, Mail, ChevronRight } from "lucide-react";
import Link from "next/link";

function LeadRow({ lead, engagement, isLast }: { lead: Lead; engagement: Record<string, EngagementSummary>; isLast: boolean }) {
  const ss = STATUS_COLOR[lead.status] || STATUS_COLOR.not_contacted;
  const ev = engagement[lead.lead_id];
  return (
    <tr className="row-hover" style={{ borderBottom: isLast ? "none" : `1px solid ${L.border}`, cursor: "pointer" }}>
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

function SegmentSection({ label, leads, engagement }: { label: string; leads: Lead[]; engagement: Record<string, EngagementSummary> }) {
  const warm = leads.filter(l => l.status === "replied" || l.status === "booked").length;
  return (
    <div style={{ background: L.surface, border: `1px solid ${L.border}`, overflow: "hidden" }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8, padding: "9px 14px",
        borderBottom: `1px solid ${L.border}`, background: "#f8fafc",
      }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: L.text }}>{label}</span>
        <span style={{ fontSize: 10.5, fontWeight: 700, padding: "1px 7px", background: "#e2e8f0", color: L.muted }}>{leads.length}</span>
        {warm > 0 && <span style={{ fontSize: 10.5, fontWeight: 700, padding: "1px 7px", background: "#dcfce7", color: "#166534" }}>{warm} warm</span>}
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          {leads.map((lead, i) => (
            <LeadRow key={lead.lead_id} lead={lead} engagement={engagement} isLast={i === leads.length - 1} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const revalidate = 0;

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };

const SEQUENCE_STATUSES = new Set(["contacted", "followup_1_sent", "followup_2_sent"]);
const WARM_STATUSES = new Set(["replied", "booked"]);
const CLOSED_STATUSES = new Set(["sequence_complete", "not_interested", "bounced"]);

const FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "not_contacted", label: "New Lead" },
  { key: "contacted", label: "Contacted" },
  { key: "followup_1_sent", label: "Follow-up 1" },
  { key: "followup_2_sent", label: "Follow-up 2" },
  { key: "replied", label: "Replied" },
  { key: "booked", label: "Booked" },
  { key: "closed", label: "Closed" },
];

const STATUS_LABEL: Record<string, string> = {
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

const STATUS_COLOR: Record<string, { bg: string; fg: string }> = {
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
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

'use client';

import { useState, useEffect } from 'react';
import Topbar from "@/components/Topbar";

export default function ContactsPage() {
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch contacts from API
    fetch('/api/leads')
      .then(r => r.json())
      .then(data => {
        setContacts(data || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const stages = [
    { id: 'new', label: 'New Enquiry', color: '#94a3b8' },
    { id: 'contacted', label: 'Contacted', color: '#2563eb' },
    { id: 'followup', label: 'Follow-up', color: '#8b5cf6' },
    { id: 'replied', label: 'Replied', color: '#16a34a' },
    { id: 'booked', label: 'Booked', color: '#dc2626' },
  ];

  const handleDragStart = (e: React.DragEvent, contact: any) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('contactId', contact.id);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, stageId: string) => {
    e.preventDefault();
    const contactId = e.dataTransfer.getData('contactId');
    // Update contact status in backend
    fetch(`/api/leads/${contactId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: stageId }),
    }).then(() => {
      setContacts(contacts.map(c => c.id === contactId ? { ...c, status: stageId } : c));
    });
  };

  const getContactsForStage = (stageId: string) => {
    return contacts.filter(c => c.status === stageId);
  };

  return (
    <div style={{ background: '#f8fafc', minHeight: '100vh' }}>
      <Topbar title="Contacts" subtitle={`${contacts.length} total · pipeline view`} />

      <div style={{ padding: '24px 32px' }}>
        {/* Header stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16, marginBottom: 32 }}>
          {stages.map(stage => (
            <div key={stage.id} style={{
              background: '#fff',
              border: `1px solid #e2e8f0`,
              borderTop: `3px solid ${stage.color}`,
              padding: '16px',
              borderRadius: '8px'
            }}>
              <p style={{ fontSize: 12, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', marginBottom: 8 }}>
                {stage.label}
              </p>
              <p style={{ fontSize: 32, fontWeight: 900, color: '#0f172a', lineHeight: 1 }}>
                {getContactsForStage(stage.id).length}
              </p>
            </div>
          ))}
        </div>

        {/* Kanban board */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 20 }}>
          {stages.map(stage => (
            <div
              key={stage.id}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, stage.id)}
              style={{
                background: '#f8fafc',
                borderRadius: '8px',
                padding: '16px',
                minHeight: '600px',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <h3 style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', margin: 0 }}>
                {stage.label}
              </h3>

              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, overflow: 'auto' }}>
                {getContactsForStage(stage.id).map(contact => (
                  <div
                    key={contact.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, contact)}
                    style={{
                      background: '#fff',
                      border: `1px solid #e2e8f0`,
                      borderLeft: `4px solid ${stage.color}`,
                      padding: '12px',
                      borderRadius: '6px',
                      cursor: 'grab',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)';
                      (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.boxShadow = 'none';
                      (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
                    }}
                  >
                    <p style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', margin: '0 0 4px 0' }}>
                      {contact.company}
                    </p>
                    <p style={{ fontSize: 11, color: '#64748b', margin: '0 0 6px 0' }}>
                      {contact.contact_name || 'No name'}
                    </p>
                    <p style={{ fontSize: 10, color: '#94a3b8', margin: 0 }}>
                      {contact.email}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
