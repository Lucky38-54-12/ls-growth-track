import Link from "next/link";
import { Calendar, Video, ArrowUpRight, MessageCircleHeart, Inbox, ShieldAlert } from "lucide-react";
import { createSupabaseClient, fetchAllRows } from "@/lib/supabase";
import { listCalendarEvents, getDayRangeUTC, CalendarEvent } from "@/lib/calendar";
import { nextStepFor, stillHeld } from "@/lib/leads";
import { formatDateTime } from "@/lib/format";
import { Lead, EmailEvent, EmailSend, RevenueClient, RevenueGoal, EmailCheck } from "@/lib/types";
import Topbar from "@/components/Topbar";
import RevenueGoalCard from "@/components/RevenueGoalCard";
import DailyNotes from "@/components/DailyNotes";
import CheckRepliesButton from "@/components/CheckRepliesButton";
import FlashMessage from "@/app/dashboard/FlashMessage";
import { Suspense } from "react";

export const revalidate = 0;

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };
const TZ = "Pacific/Auckland";

const dateKeyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const timeFmt = new Intl.DateTimeFormat("en-NZ", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true });

function todayKey(): string {
  return dateKeyFmt.format(new Date());
}

export default async function TodayPage() {
  const sb = createSupabaseClient();

  const [leads, { data: sends }, { data: events }, { data: revenueClients }, { data: revenueGoal }, { data: heldChecks }] = await Promise.all([
    fetchAllRows<Lead>((from, to) => sb.from("leads").select("*").order("date_added", { ascending: false }).range(from, to)),
    sb.from("email_sends").select("*").order("sent_at", { ascending: false }),
    sb.from("email_events").select("*").order("created_at", { ascending: false }),
    sb.from("revenue_clients").select("*").order("added_at", { ascending: false }),
    sb.from("revenue_goal").select("*").eq("id", 1).maybeSingle(),
    // cold_call_followup holds live on the Cold Call page instead (that's
    // where they're generated and reviewed), not in this global panel.
    sb.from("email_checks").select("*").eq("verdict", "rejected").eq("sent", false).neq("step", "cold_call_followup").order("created_at", { ascending: false }).limit(20),
  ]);

  const allLeads = leads;
  const allSends = (sends || []) as EmailSend[];
  const allEvents = (events || []) as EmailEvent[];
  const allRevenueClients = (revenueClients || []) as RevenueClient[];
  const monthlyGoal = Number((revenueGoal as RevenueGoal | null)?.monthly_goal ?? 3000);
  const heldEmails = stillHeld((heldChecks || []) as EmailCheck[], allSends);

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

  // Leads that replied and are sitting untouched — this is the human-touchpoint queue.
  // Once you move a lead off "replied" in the pipeline it naturally drops out of this list.
  // Email-outreach replies already surface in the Email Pipeline's own Replied
  // column, so only cold-call replies belong in this cross-pipeline panel.
  const repliedLeads = pipelineLeads.filter(l => l.status === "replied" && l.source === "cold_call");
  const heldByLeadId = new Map(allLeads.map(l => [l.lead_id, l]));
  const needsAttentionCount = repliedLeads.length + heldEmails.length;

  // Leads explicitly snoozed to a future date (e.g. "booked out until
  // September") via the Remind Me field on the lead page — surfaces here
  // once that date arrives instead of the note just sitting there forever.
  const followUpsDue = allLeads
    .filter(l => l.follow_up_at && l.follow_up_at <= today)
    .sort((a, b) => (a.follow_up_at || "").localeCompare(b.follow_up_at || ""));

  function dayLabel(ts: string): string {
    const key = dateKeyFmt.format(new Date(ts));
    const todayStr = today;
    const yesterdayStr = dateKeyFmt.format(new Date(Date.now() - 86400000));
    if (key === todayStr) return "Today";
    if (key === yesterdayStr) return "Yesterday";
    return new Intl.DateTimeFormat("en-NZ", { timeZone: TZ, weekday: "long", day: "numeric", month: "short" }).format(new Date(ts));
  }

  const dateLabel = new Intl.DateTimeFormat("en-NZ", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(new Date());

  return (
    <div>
      <Topbar title="TODAY" subtitle={dateLabel} />

      <div style={{ padding: "20px 28px 60px", display: "flex", flexDirection: "column", gap: 16 }}>

        <Suspense fallback={null}><FlashMessage /></Suspense>

        {/* Needs Attention — replies waiting for a human touchpoint + AI-held emails */}
        {needsAttentionCount === 0 ? (
          <div className="surface-card" style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 10, background: "#f0fdf4", borderColor: "#bbf7d0" }}>
            <MessageCircleHeart style={{ width: 15, height: 15, color: "#16a34a", flexShrink: 0 }} />
            <span style={{ fontSize: 12.5, fontWeight: 700, color: "#166534" }}>All caught up — no replies waiting and nothing held for review.</span>
            <div style={{ marginLeft: "auto" }}><CheckRepliesButton /></div>
          </div>
        ) : (
          <div className="surface-card" style={{ overflow: "hidden", borderColor: "#fecdd3" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: "1px solid #fecdd3", background: "#fff1f2" }}>
              <ShieldAlert style={{ width: 15, height: 15, color: "#be123c" }} />
              <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "#be123c" }}>Needs Your Attention</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#be123c" }}>{needsAttentionCount}</span>
              <div style={{ marginLeft: "auto" }}><CheckRepliesButton /></div>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {repliedLeads.map(lead => (
                <Link key={`reply-${lead.lead_id}`} href={`/dashboard/leads/${lead.lead_id}`} className="row-hover" style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "12px 18px", borderBottom: `1px solid ${L.border}`, textDecoration: "none",
                }}>
                  <Inbox style={{ width: 14, height: 14, color: "#2563eb", flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: L.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {lead.contact_name || lead.company}
                    </p>
                    <p style={{ fontSize: 11.5, color: L.dimmed }}>Replied — {lead.company}{lead.reply_category ? ` · ${lead.reply_category.replace(/_/g, " ")}` : ""}</p>
                  </div>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: "#2563eb", textTransform: "uppercase", letterSpacing: "0.04em", flexShrink: 0 }}>Reply</span>
                  <ArrowUpRight style={{ width: 12, height: 12, color: L.dimmed, flexShrink: 0 }} />
                </Link>
              ))}
              {heldEmails.map(check => {
                const lead = heldByLeadId.get(check.lead_id);
                return (
                  <Link key={`held-${check.id}`} href={lead ? `/dashboard/leads/${lead.lead_id}` : "#"} className="row-hover" style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "12px 18px", borderBottom: `1px solid ${L.border}`, textDecoration: "none",
                  }}>
                    <ShieldAlert style={{ width: 14, height: 14, color: "#be123c", flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: L.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {lead?.company || check.lead_id}
                      </p>
                      <p style={{ fontSize: 11.5, color: L.dimmed, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        Held ({check.step}) — {(check.mechanical_fails?.[0] || check.judgment_flags?.[0] || check.reasoning || "flagged by AI check")}
                      </p>
                    </div>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: "#be123c", textTransform: "uppercase", letterSpacing: "0.04em", flexShrink: 0 }}>Held</span>
                    <ArrowUpRight style={{ width: 12, height: 12, color: L.dimmed, flexShrink: 0 }} />
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Follow-ups due — leads snoozed to today or earlier */}
        {followUpsDue.length > 0 && (
          <div className="surface-card" style={{ overflow: "hidden", borderColor: "#fde68a" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: "1px solid #fde68a", background: "#fffbeb" }}>
              <Calendar style={{ width: 15, height: 15, color: "#b45309" }} />
              <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "#b45309" }}>Follow-ups Due</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#b45309" }}>{followUpsDue.length}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {followUpsDue.map(lead => (
                <Link key={`followup-${lead.lead_id}`} href={`/dashboard/leads/${lead.lead_id}`} className="row-hover" style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "12px 18px", borderBottom: `1px solid ${L.border}`, textDecoration: "none",
                }}>
                  <Calendar style={{ width: 14, height: 14, color: "#b45309", flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: L.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {lead.contact_name && lead.contact_name !== "there" ? lead.contact_name : lead.company}
                    </p>
                    <p style={{ fontSize: 11.5, color: L.dimmed }}>{lead.company} — due {lead.follow_up_at}</p>
                  </div>
                  <ArrowUpRight style={{ width: 12, height: 12, color: L.dimmed, flexShrink: 0 }} />
                </Link>
              ))}
            </div>
          </div>
        )}

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
                  const subLine = [attendeeName, lead?.company].filter(Boolean).join(" · ");
                  // Meeting reminders are fully automated now (sendMeetingTouchpoints
                  // in lib/calendarSync.ts sends one on the day, off the same
                  // calendar data this card reads) — a manual "remind" button here
                  // was redundant. Shows sent-email count instead so it's obvious
                  // at a glance whether this lead's been through the sequence
                  // before the meeting, not just a bare link to go check.
                  const sentCount = lead ? allSends.filter(s => s.lead_id === lead!.lead_id).length : 0;
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
                      {lead && (
                        <Link href={`/dashboard/leads/${lead.lead_id}`} className="pill-hover" style={{
                          display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", fontSize: 11.5, fontWeight: 700,
                          color: L.muted, border: `1px solid ${L.border}`, textDecoration: "none", flexShrink: 0,
                        }}>
                          {sentCount} email{sentCount !== 1 ? "s" : ""} sent
                        </Link>
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
        @media (max-width: 900px) {
          .today-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
