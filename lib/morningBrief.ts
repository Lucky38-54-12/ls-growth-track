import { createSupabaseClient, fetchAllRows } from "./supabase";
import { notifySlack } from "./slackNotify";
import { listTodaysEvents } from "./calendar";
import {
  listColdCallSheetFiles, rankColdCallSheets, renameSheetFile, findPriorityCoverageGaps,
  parseCampaignFromTitle, PRIORITY_TRADES, COLD_CALL_SHEETS_FOLDER_ID,
} from "./sheets";
import { Lead } from "./types";

const TZ = "Pacific/Auckland";
const timeFmt = new Intl.DateTimeFormat("en-NZ", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true });

// Below this many total untouched leads across the scanned sheets, it's
// worth flagging that it's time to prospect more rather than just calling.
const LOW_INVENTORY_THRESHOLD = Number(process.env.COLD_CALL_SHEETS_LOW_THRESHOLD || "30");

const TODAY_TAG = "📞 TODAY — ";
// How many sheets stay tagged "today's picks" at once — matches the size of
// the working list Lucky was keeping by hand before this was automated.
const TARGET_TODAY_COUNT = 5;

async function getColdCallSheetBrief(): Promise<string[]> {
  const lines: string[] = [];
  try {
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID || COLD_CALL_SHEETS_FOLDER_ID;
    const files = await listColdCallSheetFiles(folderId);
    // Lower concurrency + a bigger time budget than the dashboard page uses —
    // this route has a 60s ceiling (see api/cron/morning-brief/route.ts) and
    // nothing else competing for it, so it's worth spending more of that on
    // a fuller scan (concurrency 3 was tripping the Sheets API's per-minute
    // read quota on an 80-sheet folder).
    const { sheets, scanned } = await rankColdCallSheets(files, { concurrency: 2, timeBudgetMs: 45000 });
    if (sheets.length === 0) return lines;

    // 1. Untag anything in today's picks that's been fully worked through.
    const tagged = sheets.filter((s) => s.sheetTitle.startsWith(TODAY_TAG));
    const finished = tagged.filter((s) => s.freshRows === 0);
    for (const s of finished) {
      await renameSheetFile(s.sheetId, s.sheetTitle.slice(TODAY_TAG.length)).catch(() => {});
    }
    const stillActive = tagged.filter((s) => s.freshRows > 0);

    // 2. Top up today's picks — priority (higher-ticket) trades first, then
    // whatever has the most untouched leads left.
    const untagged = sheets.filter((s) => !s.sheetTitle.startsWith(TODAY_TAG) && s.freshRows > 0);
    const ranked = [...untagged].sort((a, b) => {
      const aPri = PRIORITY_TRADES.includes(parseCampaignFromTitle(a.sheetTitle).trade || "") ? 1 : 0;
      const bPri = PRIORITY_TRADES.includes(parseCampaignFromTitle(b.sheetTitle).trade || "") ? 1 : 0;
      if (aPri !== bPri) return bPri - aPri;
      return b.freshRows - a.freshRows;
    });
    const needed = Math.max(0, TARGET_TODAY_COUNT - stillActive.length);
    const newlyTagged = ranked.slice(0, needed);
    for (const s of newlyTagged) {
      await renameSheetFile(s.sheetId, `${TODAY_TAG}${s.sheetTitle}`).catch(() => {});
    }

    const finalToday = [
      ...stillActive,
      ...newlyTagged.map((s) => ({ ...s, sheetTitle: `${TODAY_TAG}${s.sheetTitle}` })),
    ].sort((a, b) => b.freshRows - a.freshRows);

    if (finalToday.length > 0) {
      lines.push(`\n📋 Today's call sheets:`);
      for (const s of finalToday) {
        lines.push(`• ${s.sheetTitle.slice(TODAY_TAG.length)} — ${s.freshRows} untouched`);
      }
    }
    if (finished.length > 0) {
      lines.push(`✅ Wrapped up: ${finished.map((s) => s.sheetTitle.slice(TODAY_TAG.length)).join(", ")}`);
    }

    const totalFresh = sheets.reduce((sum, s) => sum + s.freshRows, 0);
    if (scanned < files.length) {
      lines.push(`(scanned ${scanned}/${files.length} sheets — ran out of time)`);
    }
    if (totalFresh < LOW_INVENTORY_THRESHOLD) {
      lines.push(`⚠️ Only ${totalFresh} untouched leads left across scanned sheets — time to prospect more.`);
    }

    // 3. Coverage gaps for higher-ticket trades (Renovations, Roofing,
    // Builders) — cities with no sheet yet, or one that's nearly exhausted.
    // Reported only, not auto-scraped: the scraper still runs locally, not
    // from this cron (see lead-scraper's Task Scheduler job instead).
    // "missing" (no sheet found) is only trustworthy on a full scan — a
    // partial scan just means that city/trade combo wasn't reached yet, not
    // that it doesn't exist. "low" is safe either way: it's only reported
    // for sheets that were actually read this run.
    const fullScan = scanned >= files.length;
    const gaps = findPriorityCoverageGaps(sheets).filter((g) => fullScan || g.reason === "low");
    if (gaps.length > 0) {
      const missing = gaps.filter((g) => g.reason === "missing");
      const low = gaps.filter((g) => g.reason === "low");
      lines.push(`\n🎯 High-value trade gaps:`);
      if (missing.length > 0) lines.push(`• No sheet yet: ${missing.map((g) => `${g.trade} ${g.location}`).join(", ")}`);
      if (low.length > 0) lines.push(`• Running low: ${low.map((g) => `${g.trade} ${g.location} (${g.freshRows} left)`).join(", ")}`);
    }
  } catch {
    // Drive/Sheets outage shouldn't block the rest of the brief from sending.
  }
  return lines;
}

// Runs early (7am NZT, before daily-maintenance's 9am slot) so Lucky sees
// today's schedule and what's due before his day actually starts. Mirrors
// the same "Needs Your Attention" / "Follow-ups Due" logic as the Today
// page (app/dashboard/today/page.tsx) so the Slack ping and the dashboard
// panel never disagree about what counts as due. Skips sending entirely on
// a quiet day — a ping with nothing on it just trains you to ignore it.
export async function sendMorningBrief(): Promise<{ sent: boolean; meetings: number; dueItems: number }> {
  const sb = createSupabaseClient();

  const [events, allLeads, sheetLines] = await Promise.all([
    listTodaysEvents(TZ).catch(() => []),
    fetchAllRows<Lead>((from, to) => sb.from("leads").select("*").range(from, to)),
    getColdCallSheetBrief(),
  ]);

  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const pipelineLeads = allLeads.filter((l) => !(l.source === "cold_call" && l.status === "not_contacted"));
  const repliedLeads = pipelineLeads.filter((l) => l.status === "replied");
  const followUpsDue = allLeads.filter((l) => l.follow_up_at && l.follow_up_at <= todayStr);

  const dueItems = repliedLeads.length + followUpsDue.length;
  if (events.length === 0 && dueItems === 0 && sheetLines.length === 0) return { sent: false, meetings: 0, dueItems: 0 };

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

  lines.push(...sheetLines);

  await notifySlack(lines.join("\n"));
  return { sent: true, meetings: events.length, dueItems };
}
