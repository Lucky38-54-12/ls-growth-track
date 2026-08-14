import { Suspense } from "react";
import { createSupabaseClient, fetchAllRows } from "@/lib/supabase";
import { Lead, EmailEvent, EmailSend, EngagementSummary } from "@/lib/types";
import { NO_SHOW_STEP_GAP_DAYS } from "@/lib/noShowSequence";
import { formatDateTime } from "@/lib/format";
import { Calendar, Video } from "lucide-react";
import Topbar from "@/components/Topbar";
import SectionTabs from "@/components/SectionTabs";
import PipelineBoard from "@/components/PipelineBoard";
import BackfillNamesButton from "@/components/BackfillNamesButton";
import DiscoveryPipelineClient from "@/components/discoveryPipeline/DiscoveryPipelineClient";
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
  { key: "discovery_done", label: "Meeting Done" },
  { key: "no_show", label: "No Show" },
  { key: "rebooked", label: "Rebooked" },
  { key: "proposal_sent", label: "Proposal Sent" },
  { key: "closed", label: "Closed" },
  { key: "no_close", label: "No Close" },
];

const NO_SHOW_STEP_LABELS = ["Not started", "1st check-in sent", "2nd check-in sent", "Sequence complete"];

function noShowDaysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

function noShowNextDueLabel(lead: Lead): string {
  const step = lead.no_show_sequence_step || 0;
  if (step >= 3) return "—";
  if (lead.trade?.toLowerCase().includes("clean")) return "Held (cleaning trade — manual only)";
  const since = lead.no_show_last_sent_at || lead.no_show_at;
  const days = noShowDaysSince(since);
  if (days === null) return "—";
  const gap = NO_SHOW_STEP_GAP_DAYS[step];
  const daysLeft = gap - days;
  return daysLeft <= 0 ? "Due now" : `In ${daysLeft} day${daysLeft !== 1 ? "s" : ""}`;
}

function NoShowRow({ lead }: { lead: Lead }) {
  const step = lead.no_show_sequence_step || 0;
  return (
    <tr style={{ borderBottom: `1px solid ${L.border}` }} className="row-hover">
      <td style={{ padding: "10px 14px" }}>
        <Link href={`/dashboard/leads/${lead.lead_id}`} style={{ fontSize: 13, fontWeight: 700, color: L.text, textDecoration: "none" }}>{lead.company}</Link>
        <div style={{ fontSize: 11.5, color: L.dimmed }}>{lead.contact_name}</div>
      </td>
      <td style={{ padding: "10px 14px", fontSize: 12.5, color: L.text }}>{lead.no_show_at ? formatDateTime(lead.no_show_at) : "—"}</td>
      <td style={{ padding: "10px 14px", fontSize: 12.5, color: L.text }}>{NO_SHOW_STEP_LABELS[step]}</td>
      <td style={{ padding: "10px 14px", fontSize: 12.5, color: L.text }}>{lead.no_show_last_sent_at ? formatDateTime(lead.no_show_last_sent_at) : "—"}</td>
      <td style={{ padding: "10px 14px", fontSize: 12.5, color: step >= 3 ? "#16a34a" : L.text, fontWeight: step >= 3 ? 700 : 400 }}>{noShowNextDueLabel(lead)}</td>
    </tr>
  );
}

function NoShowTable({ title, leads }: { title: string; leads: Lead[] }) {
  return (
    <div style={{ background: L.surface, border: `1px solid ${L.border}` }}>
      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${L.border}`, fontSize: 11, fontWeight: 700, color: L.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {title} — {leads.length}
      </div>
      {leads.length === 0 ? (
        <div style={{ padding: 32, textAlign: "center", color: L.dimmed, fontSize: 13 }}>Nobody here right now.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 700, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {["Lead", "No-show since", "Step", "Last sent", "Next nudge"].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "9px 14px", fontSize: 10, fontWeight: 700, color: L.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>{leads.map(lead => <NoShowRow key={lead.lead_id} lead={lead} />)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default async function DashboardPage() {
  const sb = createSupabaseClient();

  const [leads, { data: events }, { data: sends }, todaysMeetings, { count: namesRemaining }] = await Promise.all([
    fetchAllRows<Lead>((from, to) => sb.from("leads").select("*").order("date_added", { ascending: false }).range(from, to)),
    sb.from("email_events").select("*").order("created_at", { ascending: false }),
    sb.from("email_sends").select("*").order("sent_at", { ascending: false }),
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

  // So each pipeline card can show its own send history without a click
  // through to the full lead page.
  const sendsByLead: Record<string, EmailSend[]> = {};
  for (const send of (sends || []) as EmailSend[]) {
    (sendsByLead[send.lead_id] ||= []).push(send);
  }

  // This board is cold-call only — email-outreach leads have their own
  // pages (Email Outreach, Email Tracking). Uncalled prospects live in the
  // Call Queue, not here; this is everyone actually called, emailed, or booked.
  const coldCallLeads = allLeads.filter(l => l.source === "cold_call");
  const pipelineLeads = coldCallLeads.filter(l => l.status !== "not_contacted" && !l.post_call_stage);

  const sections = [{ key: "all", label: "All Cold Call Leads", leads: pipelineLeads }];
  const columns = COLD_CALL_COLUMNS;

  // --- Discovery Pipeline tab data — leads only land here once the meeting
  // has actually happened (dragging its card to "Meeting Done" on the
  // Pipeline board above sets discovery_done), not just because a meeting
  // was booked.
  const discoveryAwaitingOutcome = coldCallLeads.filter((l) => l.status === "discovery_done" && !l.post_call_stage);
  const discoveryGraduated = coldCallLeads.filter((l) => !!l.post_call_stage);

  // --- No-Show Sequence tab data
  const noShowLeads = allLeads
    .filter((l) => l.status === "no_show")
    .sort((a, b) => (b.no_show_at || "").localeCompare(a.no_show_at || ""));
  const noShowInSequence = noShowLeads.filter(l => (l.no_show_sequence_step || 0) < 3);
  const noShowComplete = noShowLeads.filter(l => (l.no_show_sequence_step || 0) >= 3);

  const pipelineTab = (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <BackfillNamesButton totalRemaining={namesRemaining || 0} />
      </div>

      {pipelineLeads.length === 0 ? (
        <div className="surface-card" style={{ padding: 32, textAlign: "center", color: L.dimmed, fontSize: 13 }}>
          No cold-call leads yet — run the <Link href="/dashboard/scraper" style={{ color: "var(--accent)", fontWeight: 700 }}>Scraper</Link> to add some.
        </div>
      ) : (
        <PipelineBoard sections={sections} columns={columns} engagement={engagement} sends={sendsByLead} activeSource="cold_call" />
      )}
    </div>
  );

  const discoveryTab = (
    <DiscoveryPipelineClient initialAwaitingOutcome={discoveryAwaitingOutcome} initialGraduated={discoveryGraduated} />
  );

  const noShowTab = (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <NoShowTable title="In Sequence" leads={noShowInSequence} />
      <NoShowTable title="Sequence Complete — Ready For You To Call" leads={noShowComplete} />
    </div>
  );

  return (
    <div style={{ background: "#f1f5f9", minHeight: "100vh" }}>
      <Suspense fallback={null}><FlashMessage /></Suspense>
      <Topbar title="Pipeline" subtitle="Cold-call leads, post-meeting discovery, and the no-show sequence — all in one place" />

      <div style={{ padding: "20px 28px 60px" }}>
        <SectionTabs
          tabs={[
            { id: "pipeline", label: "Pipeline", content: pipelineTab },
            { id: "discovery", label: "Discovery Pipeline", badge: discoveryAwaitingOutcome.length, content: discoveryTab },
            { id: "no-show", label: "No-Show Sequence", badge: noShowInSequence.length, content: noShowTab },
          ]}
        />
      </div>
    </div>
  );
}
