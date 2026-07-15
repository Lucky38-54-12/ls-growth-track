import { Suspense } from "react";
import { createSupabaseClient, fetchAllRows } from "@/lib/supabase";
import { groupBySegment, segmentKey, segmentLabel } from "@/lib/leads";
import { Lead, EmailEvent, EngagementSummary } from "@/lib/types";
import { Phone, Calendar, Video } from "lucide-react";
import Topbar from "@/components/Topbar";
import PipelineStats from "@/components/PipelineStats";
import PipelineBoard from "@/components/PipelineBoard";
import BackfillNamesButton from "@/components/BackfillNamesButton";
import FlashMessage from "./FlashMessage";
import Link from "next/link";
import { listTodaysEvents, CalendarEvent } from "@/lib/calendar";

export const revalidate = 0;

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };

const COLD_CALL_COLUMNS: { key: string; label: string }[] = [
  { key: "called", label: "Called, Not Yet Emailed" },
  { key: "contacted", label: "Email Sent" },
  { key: "thinking_about_it", label: "Thinking About It" },
  { key: "booked", label: "Meeting Booked" },
  { key: "no_show", label: "No Show" },
  { key: "rebooked", label: "Rebooked" },
  { key: "proposal_sent", label: "Proposal Sent" },
  { key: "closed", label: "Closed" },
  { key: "no_close", label: "No Close" },
];

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { segment?: string };
}) {
  const sb = createSupabaseClient();

  const [leads, { data: events }, todaysMeetings, { count: namesRemaining }] = await Promise.all([
    fetchAllRows<Lead>((from, to) => sb.from("leads").select("*").order("date_added", { ascending: false }).range(from, to)),
    sb.from("email_events").select("*").order("created_at", { ascending: false }),
    listTodaysEvents().catch(() => [] as CalendarEvent[]),
    sb.from("leads").select("lead_id", { count: "exact", head: true }).eq("contact_name", "there").not("website", "is", null),
  ]);

  const allLeads = leads;

  // Build engagement map
  const engagement: Record<string, EngagementSummary> = {};
  for (const ev of (events || []) as EmailEvent[]) {
    if (!engagement[ev.lead_id]) engagement[ev.lead_id] = { opens: 0, clicks: 0, last_event_at: null };
    if (ev.event_type === "open") engagement[ev.lead_id].opens++;
    if (ev.event_type === "click") engagement[ev.lead_id].clicks++;
    if (!engagement[ev.lead_id].last_event_at) engagement[ev.lead_id].last_event_at = ev.created_at;
  }

  // This board is cold-call only — email-outreach leads have their own
  // pages (Email Outreach, Email Tracking). Uncalled prospects live in the
  // Call Queue, not here; this is everyone actually called, emailed, or booked.
  const coldCallLeads = allLeads.filter(l => l.source === "cold_call");
  const callQueueLeads = coldCallLeads.filter(l => l.status === "not_contacted");
  const pipelineLeads = coldCallLeads.filter(l => l.status !== "not_contacted");

  // Trade/city segments become filter pills instead of separate stacked
  // boards — clicking one narrows the single board down to just that group.
  const segments = groupBySegment(pipelineLeads).map(s => ({ key: s.key, label: segmentLabel(s.trade, s.location), count: s.count }));
  const activeSegment = searchParams?.segment || "";
  const visibleLeads = activeSegment
    ? pipelineLeads.filter(l => segmentKey(l.trade, l.location) === activeSegment)
    : pipelineLeads;
  const activeLabel = activeSegment ? (segments.find(s => s.key === activeSegment)?.label || "Cold Call Leads") : "All Cold Call Leads";

  const sections = [{ key: activeSegment || "all", label: activeLabel, leads: visibleLeads }];
  const columns = COLD_CALL_COLUMNS;

  return (
    <div style={{ background: "#f1f5f9", minHeight: "100vh" }}>
      <Suspense fallback={null}><FlashMessage /></Suspense>
      <Topbar title="Cold Call Leads" subtitle="Everyone you've called, emailed, or booked" />

      <div style={{ padding: "20px 28px 60px", display: "flex", flexDirection: "column", gap: 16 }}>

        {todaysMeetings.length > 0 && (
          <Link href="/dashboard/calendar" className="card-hover" style={{
            display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
            background: "#eff6ff", border: "1px solid #bfdbfe", padding: "12px 16px", textDecoration: "none",
          }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "#dbeafe", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Calendar style={{ width: 15, height: 15, color: "#1e40af" }} />
            </div>
            <span style={{ fontSize: 13, fontWeight: 800, color: "#1e40af" }}>
              {todaysMeetings.length} meeting{todaysMeetings.length !== 1 ? "s" : ""} today
            </span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {todaysMeetings.map((m) => (
                <span key={m.eventId} style={{
                  display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 600,
                  color: "#1e40af", background: "#dbeafe", padding: "4px 10px", borderRadius: 20,
                }}>
                  {m.allDay ? "All day" : new Intl.DateTimeFormat("en-NZ", { timeZone: "Pacific/Auckland", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(m.startISO)).replace(" ", "").toLowerCase()}
                  {" · "}{m.summary}
                  {m.hangoutLink && <Video style={{ width: 11, height: 11 }} />}
                </span>
              ))}
            </div>
          </Link>
        )}

        <PipelineStats allLeads={pipelineLeads} />

        {callQueueLeads.length > 0 && (
          <Link href="/dashboard/cold-call" className="card-hover" style={{
            display: "flex", alignItems: "center", gap: 12,
            background: "#fef2f2", border: "1px solid #fecaca", padding: "12px 16px", textDecoration: "none",
          }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "#fee2e2", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Phone style={{ width: 15, height: 15, color: "var(--red)" }} />
            </div>
            <span style={{ fontSize: 13, fontWeight: 800, color: "var(--red)" }}>
              {callQueueLeads.length} prospect{callQueueLeads.length !== 1 ? "s" : ""} not called yet
            </span>
          </Link>
        )}

        {/* Segment filter pills — click one to narrow the board to just that trade/city */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Link href="/dashboard" className="btn-lift" style={{
            display: "flex", alignItems: "center", gap: 6,
            background: !activeSegment ? "var(--blue)" : L.surface,
            color: !activeSegment ? "#fff" : L.muted,
            border: !activeSegment ? "none" : `1px solid ${L.border}`,
            padding: "8px 14px", fontSize: 11.5, fontWeight: 700, textDecoration: "none", flexShrink: 0,
          }}>
            <Phone style={{ width: 13, height: 13 }} /> All ({pipelineLeads.length})
          </Link>
          {segments.map(s => (
            <Link key={s.key} href={`/dashboard?segment=${encodeURIComponent(s.key)}`} className="pill-hover" style={{
              padding: "8px 14px",
              background: activeSegment === s.key ? "var(--blue)" : L.surface,
              color: activeSegment === s.key ? "#fff" : L.muted,
              border: activeSegment === s.key ? "none" : `1px solid ${L.border}`,
              fontSize: 11.5, fontWeight: 600, textDecoration: "none", transition: "all 0.15s",
            }}>{s.label} ({s.count})</Link>
          ))}
          <div style={{ flex: 1 }} />
          <BackfillNamesButton totalRemaining={namesRemaining || 0} />
        </div>

        {/* Kanban board */}
        {pipelineLeads.length === 0 ? (
          <div className="surface-card" style={{ padding: 32, textAlign: "center", color: L.dimmed, fontSize: 13 }}>
            No cold-call leads yet — run the <Link href="/dashboard/scraper" style={{ color: "var(--red)", fontWeight: 700 }}>Scraper</Link> to add some.
          </div>
        ) : (
          <PipelineBoard sections={sections} columns={columns} engagement={engagement} activeSource="cold_call" />
        )}
      </div>
    </div>
  );
}
