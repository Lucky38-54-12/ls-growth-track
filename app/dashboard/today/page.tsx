import Link from "next/link";
import { Calendar, Video, ArrowUpRight, Clock, Flame, MailCheck, MousePointer2, MessageCircleHeart } from "lucide-react";
import { createSupabaseClient, fetchAllRows } from "@/lib/supabase";
import { listCalendarEvents, getDayRangeUTC, CalendarEvent } from "@/lib/calendar";
import { buildAnalytics, rate } from "@/lib/analytics";
import { nextStepFor } from "@/lib/leads";
import { formatDateTime } from "@/lib/format";
import { Lead, EmailEvent, EmailSend, RevenueClient, RevenueGoal } from "@/lib/types";
import Topbar from "@/components/Topbar";
import MeetingReminderButton from "@/components/MeetingReminderButton";
import RevenueGoalCard from "@/components/RevenueGoalCard";
import DailyNotes from "@/components/DailyNotes";

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

  const [leads, { data: sends }, { data: events }, { data: revenueClients }, { data: revenueGoal }] = await Promise.all([
    fetchAllRows<Lead>((from, to) => sb.from("leads").select("*").order("date_added", { ascending: false }).range(from, to)),
    sb.from("email_sends").select("*").order("sent_at", { ascending: false }),
    sb.from("email_events").select("*").order("created_at", { ascending: false }),
    sb.from("revenue_clients").select("*").order("added_at", { ascending: false }),
    sb.from("revenue_goal").select("*").eq("id", 1).maybeSingle(),
  ]);

  const allLeads = leads;
  const allSends = (sends || []) as EmailSend[];
  const allEvents = (events || []) as EmailEvent[];
  const allRevenueClients = (revenueClients || []) as RevenueClient[];
  const monthlyGoal = Number((revenueGoal as RevenueGoal | null)?.monthly_goal ?? 3000);

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

  // Email performance
  const { overall } = buildAnalytics(allSends, allEvents);
  const openRate = rate(overall.opened, overall.sent);
  const clickRate = rate(overall.clicked, overall.sent);

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
    { label: "Active Pipeline", value: String(active.length), sub: "leads in motion", icon: Flame, color: "#dc2626", bg: "#fef2f2" },
    { label: "Due For Follow-up", value: String(dueLeads.length), sub: "ready to send", icon: Clock, color: "#d97706", bg: "#fffbeb" },
    { label: "Open Rate", value: `${openRate}%`, sub: `${overall.opened} of ${overall.sent} emails`, icon: MailCheck, color: "#2563eb", bg: "#eff6ff" },
    { label: "Click Rate", value: `${clickRate}%`, sub: `${overall.clicked} of ${overall.sent} emails`, icon: MousePointer2, color: "#9333ea", bg: "#faf5ff" },
    { label: "Reply Rate", value: `${replyRate}%`, sub: `${warm} replied or booked`, icon: MessageCircleHeart, color: "#16a34a", bg: "#f0fdf4" },
  ];

  return (
    <div>
      <Topbar title="TODAY" subtitle={dateLabel} />

      <div style={{ padding: "20px 28px 60px", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Stats */}
        <div className="today-stats" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14 }}>
          {cards.map(({ label, value, sub, icon: Icon, color, bg }) => (
            <div key={label} className="stat-card" style={{ padding: "18px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: L.muted }}>{label}</p>
                <div style={{ width: 26, height: 26, background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Icon style={{ width: 13, height: 13, color }} />
                </div>
              </div>
              <div style={{ fontSize: 34, fontWeight: 800, color, lineHeight: 1, marginBottom: 5, letterSpacing: "-0.02em" }}>{value}</div>
              <p style={{ fontSize: 11, color: L.muted }}>{sub}</p>
            </div>
          ))}
        </div>

        {/* Daily notes */}
        <DailyNotes />

        <div className="today-grid" style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 16, alignItems: "start" }}>

          {/* Calendar — next 7 days */}
          <div className="surface-card" style={{ overflow: "hidden" }}>
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

          {/* Monthly revenue goal */}
          <RevenueGoalCard clients={allRevenueClients} monthlyGoal={monthlyGoal} />
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
