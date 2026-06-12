import { Suspense } from "react";
import { createSupabaseClient } from "@/lib/supabase";
import { nextStepFor } from "@/lib/leads";
import { Lead, EmailEvent, EngagementSummary } from "@/lib/types";
import SendButton from "@/components/SendButton";
import SheetSyncButton from "@/components/SheetSyncButton";
import Topbar from "@/components/Topbar";
import PipelineStats from "@/components/PipelineStats";
import FlashMessage from "./FlashMessage";
import Link from "next/link";

export const revalidate = 0;

const WARM_STATUSES = new Set(["replied", "booked"]);
const SEQUENCE_STATUSES = ["contacted", "followup_1_sent", "followup_2_sent"];
const CLOSED_STATUSES = new Set(["sequence_complete", "not_interested", "bounced"]);

const COLUMNS: { key: string; label: string; color: string }[] = [
  { key: "not_contacted", label: "New Lead", color: "#94a3b8" },
  { key: "contacted", label: "Contacted", color: "#2563eb" },
  { key: "followup_1_sent", label: "Follow-up 1", color: "#7c3aed" },
  { key: "followup_2_sent", label: "Follow-up 2", color: "#7c3aed" },
  { key: "replied", label: "Replied", color: "#16a34a" },
  { key: "booked", label: "Booked", color: "#16a34a" },
  { key: "closed", label: "Closed", color: "#475569" },
];

function initials(name: string) {
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

function KanbanCard({ lead, engagement }: { lead: Lead; engagement: Record<string, EngagementSummary> }) {
  const ev = engagement[lead.lead_id];
  const isDue = nextStepFor(lead) !== null;
  return (
    <Link href={`/dashboard/leads/${lead.lead_id}`} className="card-hover" style={{
      display: "block", background: "#fff", border: "1px solid #e2e8f0",
      borderRadius: 0, padding: "12px 14px", marginBottom: 8,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <div style={{
          width: 30, height: 30, borderRadius: 0, background: "#f1f5f9",
          border: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "center",
          fontWeight: 900, fontSize: 10.5, color: "#64748b", flexShrink: 0,
        }}>
          {initials(lead.company)}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 13, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{lead.company}</div>
          <div style={{ fontSize: 11, color: "#94a3b8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {lead.trade || "—"}{lead.location ? ` · ${lead.location}` : ""}
          </div>
        </div>
      </div>
      {(isDue || ev?.opens > 0 || ev?.clicks > 0) && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {isDue && <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 7px", borderRadius: 0, background: "#fee2e2", color: "#dc2626" }}>Due now</span>}
          {ev?.opens > 0 && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 0, background: "#dbeafe", color: "#1e40af" }}>{ev.opens} open{ev.opens !== 1 ? "s" : ""}</span>}
          {ev?.clicks > 0 && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 0, background: "#fce7f3", color: "#9d174d" }}>{ev.clicks} click{ev.clicks !== 1 ? "s" : ""}</span>}
        </div>
      )}
    </Link>
  );
}

function KanbanColumn({ label, color, leads, engagement }: {
  label: string; color: string; leads: Lead[]; engagement: Record<string, EngagementSummary>;
}) {
  return (
    <div style={{ width: 268, flexShrink: 0 }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "11px 14px", background: "#0f172a", marginBottom: 10,
      }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: "#fff", letterSpacing: "0.02em" }}>{label}</span>
        <span style={{ fontSize: 11.5, fontWeight: 800, background: color, color: "#fff", padding: "2px 9px", borderRadius: 0 }}>{leads.length}</span>
      </div>
      <div>
        {leads.length === 0 ? (
          <div style={{ textAlign: "center", color: "#94a3b8", fontSize: 12, padding: "20px 0", border: "1px dashed #e2e8f0" }}>Empty</div>
        ) : (
          leads.map(lead => <KanbanCard key={lead.lead_id} lead={lead} engagement={engagement} />)
        )}
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  const sb = createSupabaseClient();

  const [{ data: leads }, { data: events }] = await Promise.all([
    sb.from("leads").select("*").order("date_added", { ascending: false }),
    sb.from("email_events").select("*").order("created_at", { ascending: false }),
  ]);

  const allLeads = (leads || []) as Lead[];

  // Build engagement map
  const engagement: Record<string, EngagementSummary> = {};
  for (const ev of (events || []) as EmailEvent[]) {
    if (!engagement[ev.lead_id]) engagement[ev.lead_id] = { opens: 0, clicks: 0, last_event_at: null };
    if (ev.event_type === "open") engagement[ev.lead_id].opens++;
    if (ev.event_type === "click") engagement[ev.lead_id].clicks++;
    if (!engagement[ev.lead_id].last_event_at) engagement[ev.lead_id].last_event_at = ev.created_at;
  }

  // Stats
  const total = allLeads.length;
  const due = allLeads.filter(l => nextStepFor(l) !== null).length;

  // Kanban groups
  const grouped: Record<string, Lead[]> = {};
  for (const col of COLUMNS) grouped[col.key] = [];
  for (const lead of allLeads) {
    const key = CLOSED_STATUSES.has(lead.status) ? "closed" : lead.status;
    if (grouped[key]) grouped[key].push(lead);
    else grouped["not_contacted"].push(lead);
  }

  return (
    <div style={{ background: "#f1f5f9", minHeight: "100vh" }}>
      <Suspense fallback={null}><FlashMessage /></Suspense>
      <Topbar title="PIPELINE" subtitle="Every lead, every stage, one view" />

      <div style={{ padding: "24px 28px 60px" }}>

        <PipelineStats allLeads={allLeads} />

        {/* Action bar */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginBottom: 16, flexWrap: "wrap", gap: 12,
        }}>
          <SendButton due={due} />
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ width: 220 }}><SheetSyncButton /></div>
            <Link href="/dashboard/warm" className="btn-lift" style={{
              padding: "9px 16px", background: "#fff", border: "1px solid #e2e8f0",
              fontSize: 12.5, fontWeight: 700, color: "#0f172a", textDecoration: "none",
            }}>Warm Leads →</Link>
            <Link href="/dashboard/import" className="btn-lift" style={{
              padding: "9px 16px", background: "#fff", border: "1px solid #e2e8f0",
              fontSize: 12.5, fontWeight: 700, color: "#0f172a", textDecoration: "none",
            }}>Import CSV →</Link>
          </div>
        </div>

        {/* Kanban board */}
        {total === 0 ? (
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 0, padding: "32px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
            No leads yet — <Link href="/dashboard/new" style={{ color: "#dc2626", fontWeight: 700 }}>add your first lead</Link> or <Link href="/dashboard/import" style={{ color: "#dc2626", fontWeight: 700 }}>import a batch</Link>.
          </div>
        ) : (
          <div style={{ display: "flex", gap: 16, overflowX: "auto", paddingBottom: 12 }}>
            {COLUMNS.map(col => (
              <KanbanColumn key={col.key} label={col.label} color={col.color} leads={grouped[col.key]} engagement={engagement} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
