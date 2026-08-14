import { createSupabaseClient, fetchAllRows } from "./supabase";
import { notifySlack } from "./slackNotify";
import { listTodaysEvents } from "./calendar";
import { Lead } from "./types";

const TZ = "Pacific/Auckland";
const timeFmt = new Intl.DateTimeFormat("en-NZ", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true });

// Runs early (7am NZT, before daily-maintenance's 9am slot) so Lucky sees
// today's schedule and what's due before his day actually starts. Mirrors
// the same "Needs Your Attention" / "Follow-ups Due" logic as the Today
// page (app/dashboard/today/page.tsx) so the Slack ping and the dashboard
// panel never disagree about what counts as due. Skips sending entirely on
// a quiet day — a ping with nothing on it just trains you to ignore it.
export async function sendMorningBrief(): Promise<{ sent: boolean; meetings: number; dueItems: number }> {
  const sb = createSupabaseClient();

  const [events, allLeads] = await Promise.all([
    listTodaysEvents(TZ).catch(() => []),
    fetchAllRows<Lead>((from, to) => sb.from("leads").select("*").range(from, to)),
  ]);

  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const pipelineLeads = allLeads.filter((l) => !(l.source === "cold_call" && l.status === "not_contacted"));
  const repliedLeads = pipelineLeads.filter((l) => l.status === "replied");
  const followUpsDue = allLeads.filter((l) => l.follow_up_at && l.follow_up_at <= todayStr);

  const dueItems = repliedLeads.length + followUpsDue.length;
  if (events.length === 0 && dueItems === 0) return { sent: false, meetings: 0, dueItems: 0 };

  const lines: string[] = [`☀️ *Morning brief*`];

  if (events.length > 0) {
    lines.push(`\n📅 ${events.length} meeting${events.length !== 1 ? "s" : ""} today:`);
    for (const ev of events) {
      const timeStr = ev.allDay ? "all day" : timeFmt.format(new Date(ev.startISO)).replace(" ", "").toLowerCase();
      const who = ev.attendeeName || ev.attendeeEmail || "";
      lines.push(`• ${timeStr} — ${ev.summary}${who ? ` (${who})` : ""}`);
    }
  }

  if (dueItems > 0) {
    lines.push(`\n📌 ${dueItems} thing${dueItems !== 1 ? "s" : ""} due:`);
    for (const lead of repliedLeads) {
      lines.push(`• Reply waiting — ${lead.contact_name || lead.company}${lead.reply_category ? ` (${lead.reply_category.replace(/_/g, " ")})` : ""}`);
    }
    for (const lead of followUpsDue) {
      lines.push(`• Follow-up due — ${lead.contact_name || lead.company}`);
    }
  }

  await notifySlack(lines.join("\n"));
  return { sent: true, meetings: events.length, dueItems };
}
