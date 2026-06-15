import Link from "next/link";
import { Calendar, Video, ArrowUpRight, Mail, MousePointerClick, Clock } from "lucide-react";
import { createSupabaseClient } from "@/lib/supabase";
import { listTodaysEvents, CalendarEvent } from "@/lib/calendar";
import { buildAnalytics, rate } from "@/lib/analytics";
import { nextStepFor } from "@/lib/leads";
import { formatDateTime } from "@/lib/format";
import { Lead, EmailEvent, EmailSend } from "@/lib/types";
import Topbar from "@/components/Topbar";
import MeetingReminderButton from "@/components/MeetingReminderButton";

export const revalidate = 0;

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };
const CLOSED_STATUSES = new Set(["sequence_complete", "not_interested", "bounced"]);
const WARM_STATUSES = new Set(["replied", "booked"]);
const TZ = "Pacific/Auckland";

const dateKeyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const timeFmt = new Intl.DateTimeFormat("en-NZ", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true });

function todayKey(): string {
  return dateKeyFmt.format(new Date());
}

export default async function TodayPage() {
  const sb = createSupabaseClient();

  const [{ data: leads }, { data: sends }, { data: events }] = await Promise.all([
    sb.from("leads").select("*").order("date_added", { ascending: false }),
    sb.from("email_sends").select("*").order("sent_at", { ascending: false }),
    sb.from("email_events").select("*").order("created_at", { ascending: false }),
  ]);

  const allLeads = (leads || []) as Lead[];
  const allSends = (sends || []) as EmailSend[];
  const allEvents = (events || []) as EmailEvent[];

  let todaysMeetings: CalendarEvent[] = [];
  try {
    todaysMeetings = await listTodaysEvents();
  } catch {
    todaysMeetings = [];
  }

  const today = todayKey();
  const leadByEmail = new Map(allLeads.map(l => [l.email.toLowerCase(), l]));

  // Pipeline stats
  const active = allLeads.filter(l => !CLOSED_STATUSES.has(l.status));
  const dueLeads = allLeads.filter(l => nextStepFor(l) !== null);
  const contacted = allLeads.filter(l => l.status !== "not_contacted").length;
  const warm = allLeads.filter(l => WARM_STATUSES.has(l.status)).length;
  const replyRate = contacted > 0 ? Math.round((warm / contacted) * 100) : 0;

  // Email performance
  const { overall } = buildAnalytics(allSends, allEvents);
  const openRate = rate(overall.opened, overall.sent);
  const clickRate = rate(overall.clicked, overall.sent);

  // Today's activity
  const todaysEvents = allEvents.filter(ev => dateKeyFmt.format(new Date(ev.created_at)) === today);
  const todaysSends = allSends.filter(s => dateKeyFmt.format(new Date(s.sent_at)) === today);

  const dateLabel = new Intl.DateTimeFormat("en-NZ", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(new Date());

  const cards = [
    { label: "Active Pipeline", value: String(active.length), sub: "leads in motion" },
    { label: "Due For Follow-up", value: String(dueLeads.length), sub: "ready to send" },
    { label: "Open Rate", value: `${openRate}%`, sub: `${overall.opened} of ${overall.sent} emails` },
    { label: "Click Rate", value: `${clickRate}%`, sub: `${overall.clicked} of ${overall.sent} emails` },
    { label: "Reply Rate", value: `${replyRate}%`, sub: `${warm} replied or booked` },
  ];

  return (
    <div>
      <Topbar title="TODAY" subtitle={dateLabel} />

      <div style={{ padding: "20px 28px 60px", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Stats */}
        <div className="today-stats" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
          {cards.map(({ label, value, sub }) => (
            <div key={label} style={{ background: L.surface, border: `1px solid ${L.border}`, padding: "16px 18px" }}>
              <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: L.muted, marginBottom: 8 }}>{label}</p>
              <div style={{ fontSize: 38, fontWeight: 900, color: L.text, lineHeight: 1, marginBottom: 5 }}>{value}</div>
              <p style={{ fontSize: 11, color: L.muted }}>{sub}</p>
            </div>
          ))}
        </div>

        <div className="today-grid" style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 16, alignItems: "start" }}>

          {/* Today's meetings */}
          <div style={{ background: L.surface, border: `1px solid ${L.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: `1px solid ${L.border}` }}>
              <Calendar style={{ width: 15, height: 15, color: L.muted }} />
              <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: L.text }}>Today&apos;s Meetings</span>
              <span style={{ marginLeft: "auto", fontSize: 11, color: L.dimmed }}>{todaysMeetings.length}</span>
            </div>
            {todaysMeetings.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: L.dimmed, fontSize: 12.5 }}>Nothing booked for today.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {todaysMeetings.map(ev => {
                  const lead = leadByEmail.get(ev.attendeeEmail.toLowerCase());
                  const timeStr = ev.allDay ? "today" : timeFmt.format(new Date(ev.startISO)).replace(" ", "").toLowerCase();
                  const firstName = (ev.attendeeName || "").split(" ")[0] || "there";
                  const subLine = [ev.attendeeName, lead?.company].filter(Boolean).join(" · ");
                  const reminderBody = [
                    `Hey ${firstName},`,
                    "",
                    `Just a reminder we have our meeting today at ${timeStr}. Looking forward to chatting!`,
                    "",
                    ...(ev.hangoutLink ? [`You can join here: ${ev.hangoutLink}`, ""] : []),
                    "Cheers,",
                    "Lucky",
                  ].join("\n");
                  return (
                    <div key={ev.eventId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 18px", borderBottom: `1px solid ${L.border}` }}>
                      <div style={{ width: 56, flexShrink: 0, fontSize: 13, fontWeight: 800, color: L.text }}>{timeStr}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: L.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {ev.summary || ev.attendeeName || ev.attendeeEmail}
                        </p>
                        {subLine && (
                          <p style={{ fontSize: 11.5, color: L.dimmed, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{subLine}</p>
                        )}
                      </div>
                      {ev.attendeeEmail && (
                        <MeetingReminderButton
                          to={ev.attendeeEmail}
                          defaultSubject={`Quick reminder — our meeting today at ${timeStr}`}
                          defaultBody={reminderBody}
                        />
                      )}
                      {ev.hangoutLink && (
                        <a href={ev.hangoutLink} target="_blank" rel="noopener noreferrer" className="pill-hover" style={{
                          display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", fontSize: 11.5, fontWeight: 700,
                          color: "var(--blue)", border: `1px solid ${L.border}`, textDecoration: "none", flexShrink: 0,
                        }}>
                          <Video style={{ width: 12, height: 12 }} /> Join
                        </a>
                      )}
                      {lead && (
                        <Link href={`/dashboard/leads/${lead.lead_id}`} className="pill-hover" style={{
                          display: "flex", alignItems: "center", padding: "5px", border: `1px solid ${L.border}`, color: L.muted, flexShrink: 0,
                        }}>
                          <ArrowUpRight style={{ width: 12, height: 12 }} />
                        </Link>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Needs follow-up */}
          <div style={{ background: L.surface, border: `1px solid ${L.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: `1px solid ${L.border}` }}>
              <Clock style={{ width: 15, height: 15, color: L.muted }} />
              <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: L.text }}>Needs Follow-up</span>
              <span style={{ marginLeft: "auto", fontSize: 11, color: L.dimmed }}>{dueLeads.length}</span>
            </div>
            {dueLeads.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: L.dimmed, fontSize: 12.5 }}>Nothing due — you&apos;re all caught up.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {dueLeads.slice(0, 8).map(lead => (
                  <Link key={lead.lead_id} href={`/dashboard/leads/${lead.lead_id}`} className="row-hover" style={{
                    display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", borderBottom: `1px solid ${L.border}`, textDecoration: "none",
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: L.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lead.company}</p>
                      <p style={{ fontSize: 11.5, color: L.dimmed }}>{lead.trade || "—"}{lead.location ? ` · ${lead.location}` : ""}</p>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", background: "#fef2f2", color: "var(--red)", textTransform: "uppercase", letterSpacing: "0.04em", flexShrink: 0 }}>
                      {nextStepFor(lead)}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Today's activity */}
        <div style={{ background: L.surface, border: `1px solid ${L.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: `1px solid ${L.border}` }}>
            <Mail style={{ width: 15, height: 15, color: L.muted }} />
            <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: L.text }}>Today&apos;s Activity</span>
            <span style={{ marginLeft: "auto", fontSize: 11, color: L.dimmed }}>{todaysSends.length} sent · {todaysEvents.length} events</span>
          </div>
          {todaysSends.length === 0 && todaysEvents.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: L.dimmed, fontSize: 12.5 }}>No email activity yet today.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {todaysEvents.slice(0, 10).map(ev => {
                const lead = allLeads.find(l => l.lead_id === ev.lead_id);
                const isOpen = ev.event_type === "open";
                return (
                  <div key={`ev-${ev.id}`} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 18px", borderBottom: `1px solid ${L.border}` }}>
                    {isOpen ? <Mail style={{ width: 13, height: 13, color: "var(--blue)", flexShrink: 0 }} /> : <MousePointerClick style={{ width: 13, height: 13, color: "var(--green)", flexShrink: 0 }} />}
                    <span style={{ fontSize: 13, color: L.text, fontWeight: 600 }}>{lead?.company || ev.lead_id}</span>
                    <span style={{ fontSize: 12, color: L.muted }}>{isOpen ? "opened an email" : "clicked a link"}</span>
                    <span style={{ marginLeft: "auto", fontSize: 11.5, color: L.dimmed }}>{formatDateTime(ev.created_at)}</span>
                  </div>
                );
              })}
              {todaysSends.slice(0, 10).map(s => {
                const lead = allLeads.find(l => l.lead_id === s.lead_id);
                return (
                  <div key={`send-${s.id}`} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 18px", borderBottom: `1px solid ${L.border}` }}>
                    <ArrowUpRight style={{ width: 13, height: 13, color: L.muted, flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: L.text, fontWeight: 600 }}>{lead?.company || s.lead_id}</span>
                    <span style={{ fontSize: 12, color: L.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>sent &quot;{s.subject}&quot;</span>
                    <span style={{ marginLeft: "auto", fontSize: 11.5, color: L.dimmed, flexShrink: 0 }}>{formatDateTime(s.sent_at)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <style suppressHydrationWarning>{`
        @media (max-width: 1100px) {
          .today-stats { grid-template-columns: repeat(3, 1fr) !important; }
        }
        @media (max-width: 900px) {
          .today-grid { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 640px) {
          .today-stats { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>
    </div>
  );
}
