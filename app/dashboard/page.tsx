import { Suspense } from "react";
import { createSupabaseClient } from "@/lib/supabase";
import { nextStepFor } from "@/lib/leads";
import { Lead, EmailEvent, EngagementSummary } from "@/lib/types";
import { Building2, Plus } from "lucide-react";
import SendButton from "@/components/SendButton";
import SheetSyncButton from "@/components/SheetSyncButton";
import Topbar from "@/components/Topbar";
import PipelineStats from "@/components/PipelineStats";
import FlashMessage from "./FlashMessage";
import Link from "next/link";

export const revalidate = 0;

const CLOSED_STATUSES = new Set(["sequence_complete", "not_interested", "bounced"]);
const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };

const COLUMNS: { key: string; label: string }[] = [
  { key: "not_contacted", label: "New Lead" },
  { key: "contacted", label: "Contacted" },
  { key: "followup_1_sent", label: "Follow-up 1" },
  { key: "followup_2_sent", label: "Follow-up 2" },
  { key: "replied", label: "Replied" },
  { key: "booked", label: "Booked" },
  { key: "closed", label: "Closed" },
];

function initials(name: string) {
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

function KanbanCard({ lead, engagement }: { lead: Lead; engagement: Record<string, EngagementSummary> }) {
  const ev = engagement[lead.lead_id];
  const isDue = nextStepFor(lead) !== null;
  return (
    <Link href={`/dashboard/leads/${lead.lead_id}`} className="card-hover" style={{
      display: "block", background: L.surface, border: `1px solid ${L.border}`, padding: "12px 14px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 28, height: 28, border: `1px solid ${L.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
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
      </div>
      {(ev?.opens > 0 || ev?.clicks > 0) && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8, paddingTop: 8, borderTop: `1px solid ${L.border}` }}>
          {ev?.opens > 0 && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", background: "#dbeafe", color: "#1e40af" }}>{ev.opens} open{ev.opens !== 1 ? "s" : ""}</span>}
          {ev?.clicks > 0 && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", background: "#fce7f3", color: "#9d174d" }}>{ev.clicks} click{ev.clicks !== 1 ? "s" : ""}</span>}
        </div>
      )}
    </Link>
  );
}

function KanbanColumn({ label, leads, engagement }: {
  label: string; leads: Lead[]; engagement: Record<string, EngagementSummary>;
}) {
  return (
    <div style={{ width: 270, flexShrink: 0, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 12px", background: L.surface, border: `1px solid ${L.border}`,
      }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: L.text }}>{label}</span>
        <span style={{ fontSize: 20, fontWeight: 900, color: L.text }}>{leads.length}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 80 }}>
        {leads.length === 0 ? (
          <div style={{ padding: 20, textAlign: "center", color: L.dimmed, fontSize: 12, background: L.surface, border: `1px dashed ${L.border}` }}>Empty</div>
        ) : (
          leads.map(lead => <KanbanCard key={lead.lead_id} lead={lead} engagement={engagement} />)
        )}
      </div>
    </div>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { trade?: string };
}) {
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

  const due = allLeads.filter(l => nextStepFor(l) !== null).length;

  const trades = Array.from(new Set(allLeads.map(l => l.trade).filter(Boolean))).sort();
  const activeTrade = searchParams?.trade || "all";
  const visibleLeads = activeTrade === "all" ? allLeads : allLeads.filter(l => l.trade === activeTrade);

  // Kanban groups
  const grouped: Record<string, Lead[]> = {};
  for (const col of COLUMNS) grouped[col.key] = [];
  for (const lead of visibleLeads) {
    const key = CLOSED_STATUSES.has(lead.status) ? "closed" : lead.status;
    if (grouped[key]) grouped[key].push(lead);
    else grouped["not_contacted"].push(lead);
  }

  return (
    <div style={{ background: "#f1f5f9", minHeight: "100vh" }}>
      <Suspense fallback={null}><FlashMessage /></Suspense>
      <Topbar title="Pipeline" subtitle="New lead outreach pipeline" />

      <div style={{ padding: "20px 28px 60px", display: "flex", flexDirection: "column", gap: 16 }}>

        <PipelineStats allLeads={allLeads} />

        {/* Action bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <SendButton due={due} />
          <div style={{ width: 220 }}><SheetSyncButton /></div>
          <Link href="/dashboard/warm" className="pill-hover" style={{
            padding: "8px 14px", background: L.surface, border: `1px solid ${L.border}`,
            fontSize: 11.5, fontWeight: 600, color: L.muted, textDecoration: "none", transition: "all 0.15s",
          }}>Warm Leads</Link>
          <Link href="/dashboard/import" className="pill-hover" style={{
            padding: "8px 14px", background: L.surface, border: `1px solid ${L.border}`,
            fontSize: 11.5, fontWeight: 600, color: L.muted, textDecoration: "none", transition: "all 0.15s",
          }}>Import CSV</Link>
        </div>

        {/* Trade filter + new lead */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 6, flex: 1, flexWrap: "wrap" }}>
            <Link href="/dashboard" className="pill-hover" style={{
              padding: "5px 12px", fontSize: 11, fontWeight: 600, textDecoration: "none",
              border: `1px solid ${activeTrade === "all" ? L.text : L.border}`,
              background: activeTrade === "all" ? L.text : L.surface,
              color: activeTrade === "all" ? "#fff" : L.muted,
              transition: "all 0.15s",
            }}>All Trades</Link>
            {trades.map(t => (
              <Link key={t} href={`/dashboard?trade=${encodeURIComponent(t)}`} className="pill-hover" style={{
                padding: "5px 12px", fontSize: 11, fontWeight: 600, textDecoration: "none",
                border: `1px solid ${activeTrade === t ? L.text : L.border}`,
                background: activeTrade === t ? L.text : L.surface,
                color: activeTrade === t ? "#fff" : L.muted,
                transition: "all 0.15s",
              }}>{t}</Link>
            ))}
          </div>
          <Link href="/dashboard/new" className="btn-lift" style={{
            display: "flex", alignItems: "center", gap: 6, background: "var(--red)", color: "#fff",
            border: "none", padding: "8px 16px", fontSize: 12, fontWeight: 700, textDecoration: "none", flexShrink: 0,
          }}>
            <Plus style={{ width: 13, height: 13 }} /> New Lead
          </Link>
        </div>

        {/* Pipeline label */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: L.dimmed }}>Pipeline</p>
          <div style={{ flex: 1, height: 1, background: L.border }} />
          <p style={{ fontSize: 10, color: L.dimmed }}>{visibleLeads.length} lead{visibleLeads.length !== 1 ? "s" : ""}</p>
        </div>

        {/* Kanban board */}
        {allLeads.length === 0 ? (
          <div style={{ background: L.surface, border: `1px solid ${L.border}`, padding: 32, textAlign: "center", color: L.dimmed, fontSize: 13 }}>
            No leads yet — <Link href="/dashboard/new" style={{ color: "var(--red)", fontWeight: 700 }}>add your first lead</Link> or <Link href="/dashboard/import" style={{ color: "var(--red)", fontWeight: 700 }}>import a batch</Link>.
          </div>
        ) : (
          <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8, alignItems: "start" }}>
            {COLUMNS.map(col => (
              <KanbanColumn key={col.key} label={col.label} leads={grouped[col.key]} engagement={engagement} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
