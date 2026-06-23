import Link from "next/link";
import { Calendar, Video, ArrowUpRight, Mail, MousePointerClick, Clock, Flame, MailCheck, MousePointer2, MessageCircleHeart, LayoutDashboard } from "lucide-react";
import { createSupabaseClient, fetchAllRows } from "@/lib/supabase";
import { listCalendarEvents, getDayRangeUTC, CalendarEvent } from "@/lib/calendar";
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

const PIPELINE_STAGES: { key: string; label: string }[] = [
  { key: "not_contacted", label: "New Lead" },
  { key: "contacted", label: "Contacted" },
  { key: "followup_1_sent", label: "Follow-up 1" },
  { key: "followup_2_sent", label: "Follow-up 2" },
  { key: "replied", label: "Replied" },
  { key: "booked", label: "Booked" },
  { key: "closed", label: "Closed" },
];

const dateKeyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const timeFmt = new Intl.DateTimeFormat("en-NZ", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true });

function todayKey(): string {
  return dateKeyFmt.format(new Date());
}

export default async function TodayPage() {
  const sb = createSupabaseClient();

  const [leads, { data: sends }, { data: events }] = await Promise.all([
    fetchAllRows<Lead>((from, to) => sb.from("leads").select("*").order("date_added", { ascending: false }).range(from, to)),
    sb.from("email_sends").select("*").order("sent_at", { ascending: false }),
    sb.from("email_events").select("*").order("created_at", { ascending: false }),
  ]);

  const allLeads = leads;
  const allSends = (sends || []) as EmailSend[];
  const allEvents = (events || []) as EmailEvent[];

  // Next 7 days of calendar events, for the calendar overview panel.
  let upcomingEvents: CalendarEvent[] = [];
  try {
    const { startISO } = getDayRangeUTC(todayKey(), TZ);
    const endDateStr = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" })
      .format(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
    const { startISO: endRangeStart } = getDayRangeUTC(endDateStr, TZ);
    upcomingEvents = await listCalendarEvents(startISO, endRangeStart);
  } catch {
    upcomingEvents = [];
  }
  const today = todayKey();
  const leadByEmail = new Map(allLeads.map(l => [l.email.toLowerCase(), l]));
  const leadByContact = new Map(allLeads.filter(l => l.contact_name).map(l => [l.contact_name.toLowerCase().trim(), l]));

  // Cold-call prospects that haven't actually been called yet live in the
  // Call Queue, not the pipeline (see /dashboard page for the same rule).
  const pipelineLeads = allLeads.filter(l => !(l.source === "cold_call" && l.status === "not_contacted"));

  // Pipeline stats
  const active = pipelineLeads.filter(l => !CLOSED_STATUSES.has(l.status));
  const dueLeads = allLeads.filter(l => nextStepFor(l) !== null);
  const contacted = pipelineLeads.filter(l => l.status !== "not_contacted").length;
  const warm = pipelineLeads.filter(l => WARM_STATUSES.has(l.status)).length;
  const replyRate = contacted > 0 ? Math.round((warm / contacted) * 100) : 0;

  const stageCounts: Record<string, number> = {};
  for (const stage of PIPELINE_STAGES) stageCounts[stage.key] = 0;
  for (const lead of pipelineLeads) {
    const key = CLOSED_STATUSES.has(lead.status) ? "closed" : lead.status;
    if (stageCounts[key] !== undefined) stageCounts[key]++;
    else stageCounts["not_contacted"]++;
  }

  // Email performance
  const { overall } = buildAnalytics(allSends, allEvents);
  const openRate = rate(overall.opened, overall.sent);
  const clickRate = rate(overall.clicked, overall.sent);

  // Recent activity — last 7 days, merged and sorted newest first
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  type ActivityItem =
    | { kind: "event"; ts: string; ev: EmailEvent }
    | { kind: "send"; ts: string; s: EmailSend };
  const recentActivity: ActivityItem[] = [
    ...allEvents.filter(ev => new Date(ev.created_at) >= sevenDaysAgo).map(ev => ({ kind: "event" as const, ts: ev.created_at, ev })),
    ...allSends.filter(s => new Date(s.sent_at) >= sevenDaysAgo).map(s => ({ kind: "send" as const, ts: s.sent_at, s })),
  ].sort((a, b) => b.ts.localeCompare(a.ts));

  function dayLabel(ts: string): string {
    const key = dateKeyFmt.format(new Date(ts));
    const todayStr = today;
    const yesterdayStr = dateKeyFmt.format(new Date(Date.now() - 86400000));
    if (key === todayStr) return "Today";
    if (key === yesterdayStr) return "Yesterday";
    return new Intl.DateTimeFormat("en-NZ", { timeZone: TZ, weekday: "long", day: "numeric", month: "short" }).format(new Date(ts));
  }

  const dateLabel = new Intl.DateTimeFormat("en-NZ", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(new Date());

  const cards = [
    { label: "Active Pipeline", value: String(active.length), sub: "leads in motion", icon: Flame },
    { label: "Due For Follow-up", value: String(dueLeads.length), sub: "ready to send", icon: Clock },
    { label: "Open Rate", value: `${openRate}%`, sub: `${overall.opened} of ${overall.sent} emails`, icon: MailCheck },
    { label: "Click Rate", value: `${clickRate}%`, sub: `${overall.clicked} of ${overall.sent} emails`, icon: MousePointer2 },
    { label: "Reply Rate", value: `${replyRate}%`, sub: `${warm} replied or booked`, icon: MessageCircleHeart },
  ];

  return (
    <div>
      <Topbar title="TODAY" subtitle={dateLabel} />

      <div style={{ padding: "20px 28px 60px", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Stats */}
        <div className="today-stats" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14 }}>
          {cards.map(({ label, value, sub, icon: Icon }) => (
            <div key={label} className="stat-card" style={{ padding: "18px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: L.muted }}>{label}</p>
                <div style={{ width: 26, height: 26, borderRadius: 8, background: "#fef2f2", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Icon style={{ width: 13, height: 13, color: "var(--red)" }} />
                </div>
              </div>
              <div style={{ fontSize: 34, fontWeight: 800, color: L.text, lineHeight: 1, marginBottom: 5, letterSpacing: "-0.02em" }}>{value}</div>
              <p style={{ fontSize: 11, color: L.muted }}>{sub}</p>
            </div>
          ))}
        </div>

        <div className="today-grid" style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 16, alignItems: "start" }}>

          {/* Calendar — next 7 days */}
          <div className="surface-card" style={{ overflow: "hidden", gridRow: "1 / 3" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: `1px solid ${L.border}` }}>
              <Calendar style={{ width: 15, height: 15, color: L.muted }} />
              <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: L.text }}>Calendar — Next 7 Days</span>
              <Link href="/dashboard/calendar" className="pill-hover" style={{ marginLeft: "auto", fontSize: 11, color: L.dimmed, textDecoration: "none" }}>
                {upcomingEvents.length} event{upcomingEvents.length !== 1 ? "s" : ""}
              </Link>
            </div>
            {upcomingEvents.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: L.dimmed, fontSize: 12.5 }}>Nothing booked in the next 7 days.</div>
            ) : (() => {
              let lastDay = "";
              return (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {upcomingEvents.map(ev => {
                  const day = dayLabel(ev.startISO);
                  const showDivider = day !== lastDay;
                  if (showDivider) lastDay = day;
                  let attendeeEmail = ev.attendeeEmail;
                  let attendeeName = ev.attendeeName;

                  // Cold-call bookings store name/email in description as "Name <email>"
                  if (!attendeeEmail && ev.description) {
                    const m = ev.description.match(/^(.*?)\s*<([^>@]+@[^>]+)>/);
                    if (m) { attendeeName = attendeeName || m[1].trim(); attendeeEmail = m[2].trim().toLowerCase(); }
                  }

                  // Try lead lookup by email first, then fall back to contact name from event title
                  let lead = attendeeEmail ? leadByEmail.get(attendeeEmail) : undefined;
                  if (!lead) {
                    const nameFromTitle = ev.summary.replace(/^(meet(ing)?|call|chat|catch[ -]?up)\s+(with\s+)?/i, "").trim();
                    const byName = leadByContact.get(nameFromTitle.toLowerCase());
                    if (byName) {
                      lead = byName;
                      if (!attendeeName) attendeeName = nameFromTitle;
                      if (!attendeeEmail) attendeeEmail = byName.email;
                    }
                  }

                  const timeStr = ev.allDay ? "today" : timeFmt.format(new Date(ev.startISO)).replace(" ", "").toLowerCase();
                  const firstName = (attendeeName || "").split(" ")[0] || "there";
                  const subLine = [attendeeName, lead?.company].filter(Boolean).join(" · ");
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
                    <div key={ev.eventId}>
                    {showDivider && (
                      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 18px", background: "#f8fafc", borderBottom: `1px solid ${L.border}` }}>
                        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: L.muted }}>{day}</span>
                        <div style={{ flex: 1, height: 1, background: L.border }} />
                      </div>
                    )}
                    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 18px", borderBottom: `1px solid ${L.border}` }}>
                      <div style={{ width: 56, flexShrink: 0, fontSize: 13, fontWeight: 800, color: L.text }}>{timeStr}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: L.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {ev.summary || ev.attendeeName || ev.attendeeEmail}
                        </p>
                        {subLine && (
                          <p style={{ fontSize: 11.5, color: L.dimmed, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{subLine}</p>
                        )}
                      </div>
                      {attendeeEmail && (
                        <MeetingReminderButton
                          to={attendeeEmail}
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
                    </div>
                  );
                })}
              </div>
              );
            })()}
          </div>

          {/* Pipeline overview */}
          <div className="surface-card" style={{ overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: `1px solid ${L.border}` }}>
              <LayoutDashboard style={{ width: 15, height: 15, color: L.muted }} />
              <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: L.text }}>Pipeline Overview</span>
              <Link href="/dashboard" className="pill-hover" style={{ marginLeft: "auto", fontSize: 11, color: L.dimmed, textDecoration: "none" }}>
                {active.length} active
              </Link>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {PIPELINE_STAGES.map(stage => (
                <Link key={stage.key} href={`/dashboard?source=all`} className="row-hover" style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "10px 18px", borderBottom: `1px solid ${L.border}`, textDecoration: "none",
                }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: L.text, flex: 1 }}>{stage.label}</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: L.text }}>{stageCounts[stage.key]}</span>
                </Link>
              ))}
            </div>
          </div>

          {/* Needs follow-up */}
          <div className="surface-card" style={{ overflow: "hidden" }}>
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
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: "#fef2f2", color: "var(--red)", textTransform: "uppercase", letterSpacing: "0.04em", flexShrink: 0 }}>
                      {nextStepFor(lead)}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent activity — last 7 days */}
        <div className="surface-card" style={{ overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: `1px solid ${L.border}` }}>
            <Mail style={{ width: 15, height: 15, color: L.muted }} />
            <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: L.text }}>Recent Activity</span>
            <span style={{ marginLeft: "auto", fontSize: 11, color: L.dimmed }}>last 7 days · {recentActivity.length} events</span>
          </div>
          {recentActivity.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: L.dimmed, fontSize: 12.5 }}>No activity in the last 7 days.</div>
          ) : (() => {
            let lastDay = "";
            return (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {recentActivity.map((item, i) => {
                  const day = dayLabel(item.ts);
                  const showDivider = day !== lastDay;
                  if (showDivider) lastDay = day;
                  if (item.kind === "event") {
                    const ev = item.ev;
                    const lead = allLeads.find(l => l.lead_id === ev.lead_id);
                    const isOpen = ev.event_type === "open";
                    return (
                      <div key={`ev-${ev.id}-${i}`}>
                        {showDivider && (
                          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 18px", background: "#f8fafc", borderBottom: `1px solid ${L.border}` }}>
                            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: L.muted }}>{day}</span>
                            <div style={{ flex: 1, height: 1, background: L.border }} />
                          </div>
                        )}
                        <Link href={lead ? `/dashboard/leads/${lead.lead_id}` : "#"} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 18px", borderBottom: `1px solid ${L.border}`, textDecoration: "none" }} className="row-hover">
                          {isOpen
                            ? <Mail style={{ width: 13, height: 13, color: "#3b82f6", flexShrink: 0 }} />
                            : <MousePointerClick style={{ width: 13, height: 13, color: "#16a34a", flexShrink: 0 }} />}
                          <span style={{ fontSize: 13, color: L.text, fontWeight: 700, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {lead?.company || ev.lead_id}
                          </span>
                          <span style={{ fontSize: 12, color: L.muted, flexShrink: 0 }}>{isOpen ? "opened email" : "clicked link"}</span>
                          <span style={{ marginLeft: "auto", fontSize: 11.5, color: L.dimmed, flexShrink: 0 }}>
                            {new Intl.DateTimeFormat("en-NZ", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(ev.created_at)).replace(" ", "").toLowerCase()}
                          </span>
                        </Link>
                      </div>
                    );
                  } else {
                    const s = item.s;
                    const lead = allLeads.find(l => l.lead_id === s.lead_id);
                    return (
                      <div key={`send-${s.id}-${i}`}>
                        {showDivider && (
                          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 18px", background: "#f8fafc", borderBottom: `1px solid ${L.border}` }}>
                            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: L.muted }}>{day}</span>
                            <div style={{ flex: 1, height: 1, background: L.border }} />
                          </div>
                        )}
                        <Link href={lead ? `/dashboard/leads/${lead.lead_id}` : "#"} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 18px", borderBottom: `1px solid ${L.border}`, textDecoration: "none" }} className="row-hover">
                          <ArrowUpRight style={{ width: 13, height: 13, color: L.dimmed, flexShrink: 0 }} />
                          <span style={{ fontSize: 13, color: L.text, fontWeight: 700, flexShrink: 0 }}>{lead?.company || s.lead_id}</span>
                          <span style={{ fontSize: 12, color: L.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>email sent — &quot;{s.subject}&quot;</span>
                          <span style={{ marginLeft: "auto", fontSize: 11.5, color: L.dimmed, flexShrink: 0 }}>
                            {new Intl.DateTimeFormat("en-NZ", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(s.sent_at)).replace(" ", "").toLowerCase()}
                          </span>
                        </Link>
                      </div>
                    );
                  }
                })}
              </div>
            );
          })()}
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
