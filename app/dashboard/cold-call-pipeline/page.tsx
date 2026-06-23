import Link from "next/link";
import { Building2, Phone } from "lucide-react";
import { createSupabaseClient } from "@/lib/supabase";
import { nextStepFor } from "@/lib/leads";
import { Lead, EmailEvent, EngagementSummary } from "@/lib/types";
import Topbar from "@/components/Topbar";

export const revalidate = 0;

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };
const CLOSED_STATUSES = new Set(["sequence_complete", "not_interested", "bounced"]);
const EMAIL_SENT_STATUSES = new Set(["contacted", "followup_1_sent", "followup_2_sent", "replied"]);

const COLUMNS: { key: string; label: string }[] = [
  { key: "contacted", label: "Email Sent" },
  { key: "booked", label: "Meeting Booked" },
  { key: "closed", label: "Closed / No Close" },
];

function KanbanCard({ lead, engagement }: { lead: Lead; engagement: Record<string, EngagementSummary> }) {
  const ev = engagement[lead.lead_id];
  const isDue = nextStepFor(lead) !== null;
  return (
    <Link href={`/dashboard/leads/${lead.lead_id}`} className="card-hover" style={{
      display: "block", background: L.surface, border: `1px solid ${L.border}`, padding: "12px 14px",
    }}>
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
      </div>
      {(ev?.opens > 0 || ev?.clicks > 0) && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8, paddingTop: 8, borderTop: `1px solid ${L.border}` }}>
          {ev?.opens > 0 && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 5, background: "#dbeafe", color: "#1e40af" }}>{ev.opens} open{ev.opens !== 1 ? "s" : ""}</span>}
          {ev?.clicks > 0 && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 5, background: "#fce7f3", color: "#9d174d" }}>{ev.clicks} click{ev.clicks !== 1 ? "s" : ""}</span>}
        </div>
      )}
    </Link>
  );
}

export default async function ColdCallPipelinePage() {
  const sb = createSupabaseClient();

  const [{ data: leads }, { data: events }] = await Promise.all([
    sb.from("leads").select("*").eq("source", "cold_call").order("date_added", { ascending: false }),
    sb.from("email_events").select("*"),
  ]);

  const engagement: Record<string, EngagementSummary> = {};
  for (const ev of (events || []) as EmailEvent[]) {
    if (!engagement[ev.lead_id]) engagement[ev.lead_id] = { opens: 0, clicks: 0, last_event_at: null };
    if (ev.event_type === "open") engagement[ev.lead_id].opens++;
    if (ev.event_type === "click") engagement[ev.lead_id].clicks++;
    if (!engagement[ev.lead_id].last_event_at) engagement[ev.lead_id].last_event_at = ev.created_at;
  }

  // Uncalled prospects belong in the Call Queue, not here — this page is
  // every cold-call lead you've actually called, all in one board, with no
  // split by trade or city.
  const calledLeads = ((leads || []) as Lead[]).filter(l => l.status !== "not_contacted");
  const queueCount = ((leads || []) as Lead[]).filter(l => l.status === "not_contacted").length;

  const grouped: Record<string, Lead[]> = { contacted: [], booked: [], closed: [] };
  for (const lead of calledLeads) {
    const key = CLOSED_STATUSES.has(lead.status) ? "closed" : EMAIL_SENT_STATUSES.has(lead.status) ? "contacted" : lead.status;
    if (grouped[key]) grouped[key].push(lead);
    else grouped.contacted.push(lead);
  }

  return (
    <div style={{ background: "#f1f5f9", minHeight: "100vh" }}>
      <Topbar title="Cold Call Pipeline" subtitle="Every cold-call lead, in one board" />

      <div style={{ padding: "20px 28px 60px", display: "flex", flexDirection: "column", gap: 16 }}>
        {queueCount > 0 && (
          <Link href="/dashboard/call-queue" className="card-hover" style={{
            display: "flex", alignItems: "center", gap: 12,
            background: "#fef2f2", border: "1px solid #fecaca", padding: "12px 16px", textDecoration: "none",
          }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "#fee2e2", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Phone style={{ width: 15, height: 15, color: "var(--red)" }} />
            </div>
            <span style={{ fontSize: 13, fontWeight: 800, color: "var(--red)" }}>
              {queueCount} prospect{queueCount !== 1 ? "s" : ""} waiting in the Call Queue
            </span>
          </Link>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: L.dimmed }}>All Cold Call Leads</p>
          <div style={{ flex: 1, height: 1, background: L.border }} />
          <p style={{ fontSize: 10, color: L.dimmed }}>{calledLeads.length} lead{calledLeads.length !== 1 ? "s" : ""}</p>
        </div>

        {calledLeads.length === 0 ? (
          <div className="surface-card" style={{ padding: 32, textAlign: "center", color: L.dimmed, fontSize: 13 }}>
            No cold-call leads yet — work through the <Link href="/dashboard/call-queue" style={{ color: "var(--red)", fontWeight: 700 }}>Call Queue</Link> to add some.
          </div>
        ) : (
          <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8, alignItems: "start" }}>
            {COLUMNS.map(col => (
              <div key={col.key} style={{ width: 290, flexShrink: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                <div className="surface-card" style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px",
                }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: L.text }}>{col.label}</span>
                  <span style={{ fontSize: 20, fontWeight: 800, color: L.text }}>{grouped[col.key].length}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 80 }}>
                  {grouped[col.key].length === 0 ? (
                    <div style={{ padding: 20, textAlign: "center", color: L.dimmed, fontSize: 12, background: "#f8fafc", border: `1px dashed ${L.border}`, borderRadius: 10 }}>Empty</div>
                  ) : (
                    grouped[col.key].map(lead => <KanbanCard key={lead.lead_id} lead={lead} engagement={engagement} />)
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
