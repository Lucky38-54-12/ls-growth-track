import { Suspense } from "react";
import { createSupabaseClient, fetchAllRows } from "@/lib/supabase";
import { nextStepFor, groupBySegment, segmentKey, segmentLabel } from "@/lib/leads";
import { Lead, EmailEvent, EngagementSummary } from "@/lib/types";
import { Plus, Phone, Calendar, Video } from "lucide-react";
import SendButton from "@/components/SendButton";
import SheetSyncButton from "@/components/SheetSyncButton";
import Topbar from "@/components/Topbar";
import PipelineStats from "@/components/PipelineStats";
import PipelineBoard from "@/components/PipelineBoard";
import FlashMessage from "./FlashMessage";
import Link from "next/link";
import { listTodaysEvents, CalendarEvent } from "@/lib/calendar";

export const revalidate = 0;

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

const COLD_CALL_COLUMNS: { key: string; label: string }[] = [
  { key: "contacted", label: "Email Sent" },
  { key: "booked", label: "Meeting Booked" },
  { key: "closed", label: "Closed / No Close" },
];

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { source?: string };
}) {
  const sb = createSupabaseClient();

  const [leads, { data: events }, todaysMeetings] = await Promise.all([
    fetchAllRows<Lead>((from, to) => sb.from("leads").select("*").order("date_added", { ascending: false }).range(from, to)),
    sb.from("email_events").select("*").order("created_at", { ascending: false }),
    listTodaysEvents().catch(() => [] as CalendarEvent[]),
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

  const due = allLeads.filter(l => nextStepFor(l) !== null).length;

  // Uncalled cold-call prospects live in the Call Queue, not the pipeline —
  // they haven't been qualified by a real call yet, so they shouldn't show
  // up as kanban cards or count toward pipeline totals.
  const callQueueLeads = allLeads.filter(l => l.source === "cold_call" && l.status === "not_contacted");

  // Email-outreach leads only stay on the board for 2 weeks — past that
  // they're stale and just clutter the pipeline view.
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const pipelineLeads = allLeads.filter(l =>
    !(l.source === "cold_call" && l.status === "not_contacted") &&
    !(l.source === "email_outreach" && l.date_added < twoWeeksAgo)
  );

  const activeSource = searchParams?.source || "all";
  const visibleLeads = pipelineLeads.filter(l => activeSource === "all" || l.source === activeSource);

  const columns = activeSource === "cold_call" ? COLD_CALL_COLUMNS : COLUMNS;

  // Cold-call leads stay as one unified list — they don't need splitting by
  // trade/city, just everyone you've actually called in one place. Other
  // sources still get sectioned by trade/city segment.
  const sections = activeSource === "cold_call"
    ? [{ key: "cold_call", label: "All Cold Call Leads", leads: visibleLeads }]
    : groupBySegment(visibleLeads).map(s => ({
        key: s.key,
        label: segmentLabel(s.trade, s.location),
        leads: visibleLeads.filter(l => segmentKey(l.trade, l.location) === s.key),
      }));

  return (
    <div style={{ background: "#f1f5f9", minHeight: "100vh" }}>
      <Suspense fallback={null}><FlashMessage /></Suspense>
      <Topbar title="Pipeline" subtitle="New lead outreach pipeline" />

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
          <Link href="/dashboard/call-queue" className="card-hover" style={{
            display: "flex", alignItems: "center", gap: 12,
            background: "#fef2f2", border: "1px solid #fecaca", padding: "12px 16px", textDecoration: "none",
          }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "#fee2e2", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Phone style={{ width: 15, height: 15, color: "var(--red)" }} />
            </div>
            <span style={{ fontSize: 13, fontWeight: 800, color: "var(--red)" }}>
              {callQueueLeads.length} prospect{callQueueLeads.length !== 1 ? "s" : ""} waiting in the Call Queue
            </span>
          </Link>
        )}

        {/* Action bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <SendButton due={due} />
          <div style={{ width: 220 }}><SheetSyncButton /></div>
          <Link href="/dashboard?source=cold_call" className="btn-lift" style={{
            display: "flex", alignItems: "center", gap: 6,
            background: activeSource === "cold_call" ? "var(--blue)" : L.surface,
            color: activeSource === "cold_call" ? "#fff" : L.muted,
            border: activeSource === "cold_call" ? "none" : `1px solid ${L.border}`,
            padding: "8px 14px", fontSize: 11.5, fontWeight: 700, textDecoration: "none", flexShrink: 0,
          }}>
            <Phone style={{ width: 13, height: 13 }} /> Cold Call Leads
          </Link>
          <Link href="/dashboard/warm" className="pill-hover" style={{
            padding: "8px 14px", background: L.surface, border: `1px solid ${L.border}`,
            fontSize: 11.5, fontWeight: 600, color: L.muted, textDecoration: "none", transition: "all 0.15s",
          }}>Email Tracking</Link>
          <Link href="/dashboard/import" className="pill-hover" style={{
            padding: "8px 14px", background: L.surface, border: `1px solid ${L.border}`,
            fontSize: 11.5, fontWeight: 600, color: L.muted, textDecoration: "none", transition: "all 0.15s",
          }}>Import CSV</Link>
        </div>

        {/* New lead */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
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
          <p style={{ fontSize: 10, color: L.dimmed }}>{visibleLeads.length} lead{visibleLeads.length !== 1 ? "s" : ""} · {sections.length} list{sections.length !== 1 ? "s" : ""}</p>
        </div>

        {/* Kanban boards, one per trade/city */}
        {allLeads.length === 0 ? (
          <div className="surface-card" style={{ padding: 32, textAlign: "center", color: L.dimmed, fontSize: 13 }}>
            No leads yet — <Link href="/dashboard/new" style={{ color: "var(--red)", fontWeight: 700 }}>add your first lead</Link> or <Link href="/dashboard/import" style={{ color: "var(--red)", fontWeight: 700 }}>import a batch</Link>.
          </div>
        ) : (
          <PipelineBoard sections={sections} columns={columns} engagement={engagement} activeSource={activeSource} />
        )}
      </div>
    </div>
  );
}
