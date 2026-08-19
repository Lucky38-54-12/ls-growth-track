import { createSupabaseClient, fetchAllRows } from "./supabase";
import { notifySlack } from "./slackNotify";
import { listTodaysEvents } from "./calendar";
import { reportAutomationStatus } from "./automationStatus";
import {
  listColdCallSheetFiles, rankColdCallSheets, renameSheetFile, findPriorityCoverageGaps,
  parseCampaignFromTitle, PRIORITY_TRADES, COLD_CALL_SHEETS_FOLDER_ID,
  hasTodayTag, stripTodayTag, withTodayTag,
} from "./sheets";
import { computeSegmentSaturation, segmentKey } from "./leads";
import { Lead } from "./types";

const TZ = "Pacific/Auckland";
const timeFmt = new Intl.DateTimeFormat("en-NZ", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true });

// Below this many total untouched leads across the scanned sheets, it's
// worth flagging that it's time to prospect more rather than just calling.
const LOW_INVENTORY_THRESHOLD = Number(process.env.COLD_CALL_SHEETS_LOW_THRESHOLD || "30");

// How many sheets stay tagged "today's picks" at once — matches the size of
// the working list Lucky was keeping by hand before this was automated.
const TARGET_TODAY_COUNT = 5;

// Pre-existing automations row (added before this was ever wired to code —
// see /dashboard/automations) that this exact feature reports to.
const SHEET_TRIAGE_SLUG = "daily-sheet-triage";

// force=true skips the once-per-NZT-day gate — used by the manual
// /api/admin/run-sheet-triage trigger to re-apply a fixed cap/threshold the
// same day it was deployed, instead of waiting for tomorrow's scheduled run.
export async function getColdCallSheetBrief(sb: ReturnType<typeof createSupabaseClient>, allLeads: Lead[], force = false, scanTimeBudgetMs = 45000): Promise<string[]> {
  const lines: string[] = [];
  try {
    // The GitHub Actions trigger window is generous on purpose (jitter on
    // this workflow has run 20-40+ min late in practice, see cron.yml) —
    // this DB check is what actually prevents running the triage (and
    // sending a duplicate Slack message) more than once per NZT day,
    // regardless of how many times a run lands inside that window.
    const todayNZT = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const { data: triageRow } = await sb.from("automations").select("last_run_at").eq("slug", SHEET_TRIAGE_SLUG).maybeSingle();
    if (!force && triageRow?.last_run_at) {
      const lastRunNZT = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(triageRow.last_run_at));
      if (lastRunNZT === todayNZT) return lines;
    }
    // Segments already converting well (booked/proposal/closed meetings) —
    // no point tagging or sourcing more leads for a trade+city that's
    // already paying off; that effort is better spent somewhere still cold.
    // Same threshold/statuses the Call Queue page uses for its "Paused —
    // Already Got Meetings" section, so the two never disagree.
    const saturation = computeSegmentSaturation(allLeads);
    const isSaturated = (trade: string, location: string) => saturation.get(segmentKey(trade, location))?.saturated === true;

    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID || COLD_CALL_SHEETS_FOLDER_ID;
    const rawFiles = await listColdCallSheetFiles(folderId);
    // Drive's orderBy=name sorts the 📞 TODAY prefix after plain ASCII
    // titles, so on a folder too big to fully scan within the time budget,
    // a straight alphabetical pass could finish without ever reaching a
    // single already-tagged sheet — caught live: a 31/80 partial scan read
    // zero of the 10 tagged sheets, so step 1/1b below had no freshRows data
    // to untag or trim anything with. Tagged sheets go first so this run's
    // budget is always spent finding out their status before spending any
    // of it looking for new ones to add.
    const files = [...rawFiles].sort((a, b) => Number(hasTodayTag(b.name)) - Number(hasTodayTag(a.name)));
    // Lower concurrency + a bigger time budget than the dashboard page uses —
    // this route has a 60s ceiling (see api/cron/morning-brief/route.ts) and
    // nothing else competing for it, so it's worth spending more of that on
    // a fuller scan (concurrency 3 was tripping the Sheets API's per-minute
    // read quota on an 80-sheet folder).
    const { sheets, scanned } = await rankColdCallSheets(files, { concurrency: 2, timeBudgetMs: scanTimeBudgetMs });
    if (sheets.length === 0) return lines;

    // Total currently-tagged count from the raw file listing, not just from
    // `sheets` — a partial scan (see timeBudgetMs below) only reads a subset
    // of the folder, so counting tagged sheets from `sheets` alone
    // undercounts on any run that doesn't reach every file, and step 2 below
    // would keep adding new tags run after run without ever recognizing the
    // quota was already full.
    const allTaggedCount = files.filter((f) => hasTodayTag(f.name)).length;

    // 1. Untag anything in today's picks that's been fully worked through
    // (only sheets this run actually read have a known freshRows).
    const tagged = sheets.filter((s) => hasTodayTag(s.sheetTitle));
    const finished = tagged.filter((s) => s.freshRows === 0);
    // Renamed in parallel, not sequentially — this route shares its 60s
    // ceiling with the scan above, and awaiting each Drive rename one at a
    // time (previously true of every rename loop here) burned enough of the
    // remaining budget on top of a full scan to 504 once trimming (below)
    // started renaming several more sheets in the same run.
    await Promise.all(finished.map((s) => renameSheetFile(s.sheetId, stripTodayTag(s.sheetTitle)).catch(() => {})));
    const stillActive = tagged.filter((s) => s.freshRows > 0);
    const stillActiveCount = allTaggedCount - finished.length;

    const byPriorityThenFresh = (a: { sheetTitle: string; freshRows: number }, b: { sheetTitle: string; freshRows: number }) => {
      const aPri = PRIORITY_TRADES.includes(parseCampaignFromTitle(a.sheetTitle).trade || "") ? 1 : 0;
      const bPri = PRIORITY_TRADES.includes(parseCampaignFromTitle(b.sheetTitle).trade || "") ? 1 : 0;
      if (aPri !== bPri) return bPri - aPri;
      return b.freshRows - a.freshRows;
    };

    // 1b. Trim excess — stillActiveCount can run above target on its own
    // (e.g. sheets tagged before this cap existed, or several tagged in one
    // partial-scan run before an earlier run's undercount was fixed), and
    // nothing before this ever pulled it back down since step 2 below only
    // ever adds. Only trims from sheets this run actually scanned (know
    // their freshRows/trade); tagged sheets outside the scan window are left
    // alone rather than guessed at. Keeps the same priority-trade-first,
    // most-untouched-leads ranking used to pick new ones, so trimming always
    // drops the least valuable sheets first.
    const unscannedActiveCount = Math.max(0, stillActiveCount - stillActive.length);
    const slotsForScannedActive = Math.max(0, TARGET_TODAY_COUNT - unscannedActiveCount);
    const sortedActive = [...stillActive].sort(byPriorityThenFresh);
    const keepActive = sortedActive.slice(0, slotsForScannedActive);
    const excessActive = sortedActive.slice(slotsForScannedActive);
    await Promise.all(excessActive.map((s) => renameSheetFile(s.sheetId, stripTodayTag(s.sheetTitle)).catch(() => {})));

    // 2. Top up today's picks — priority (higher-ticket) trades first, then
    // whatever has the most untouched leads left. Skips segments that
    // already have enough live meetings — calling into an already-won city
    // just to fill out the list isn't worth it.
    const untagged = sheets.filter((s) => {
      if (hasTodayTag(s.sheetTitle) || s.freshRows === 0) return false;
      const { trade, location } = parseCampaignFromTitle(s.sheetTitle);
      return !(trade && location && isSaturated(trade, location));
    });
    const ranked = [...untagged].sort(byPriorityThenFresh);
    const needed = Math.max(0, TARGET_TODAY_COUNT - (unscannedActiveCount + keepActive.length));
    const newlyTagged = ranked.slice(0, needed);

    // Final today's picks, in priority order — renamed with a 1-based rank
    // prefix (not just the plain tag) so the order is visible straight in
    // Drive, not only in this Slack summary. Every sheet here gets rewritten
    // even if it was already tagged: today's rank can differ from
    // yesterday's even when the same sheet stays in the list.
    const finalToday = [...keepActive, ...newlyTagged].sort(byPriorityThenFresh);
    await Promise.all(finalToday.map((s, i) => {
      const newTitle = withTodayTag(s.sheetTitle, i + 1);
      if (newTitle === s.sheetTitle) return Promise.resolve();
      return renameSheetFile(s.sheetId, newTitle).catch(() => {});
    }));

    if (finalToday.length > 0) {
      lines.push(`\n📋 Today's call sheets:`);
      finalToday.forEach((s, i) => {
        lines.push(`${i + 1}. ${stripTodayTag(s.sheetTitle)} — ${s.freshRows} untouched`);
      });
    }
    if (excessActive.length > 0) {
      lines.push(`↩️ Untagged (over today's cap of ${TARGET_TODAY_COUNT}): ${excessActive.map((s) => stripTodayTag(s.sheetTitle)).join(", ")}`);
    }
    if (finished.length > 0) {
      lines.push(`✅ Wrapped up: ${finished.map((s) => stripTodayTag(s.sheetTitle)).join(", ")}`);
    }
    const unscannedTaggedCount = stillActiveCount - stillActive.length;
    if (unscannedTaggedCount > 0) {
      lines.push(`(+${unscannedTaggedCount} more already-tagged sheet${unscannedTaggedCount !== 1 ? "s" : ""} not re-scanned this run)`);
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
    const gaps = findPriorityCoverageGaps(sheets, { isSaturated }).filter((g) => fullScan || g.reason === "low");
    if (gaps.length > 0) {
      const missing = gaps.filter((g) => g.reason === "missing");
      const low = gaps.filter((g) => g.reason === "low");
      lines.push(`\n🎯 High-value trade gaps:`);
      if (missing.length > 0) lines.push(`• No sheet yet: ${missing.map((g) => `${g.trade} ${g.location}`).join(", ")}`);
      if (low.length > 0) lines.push(`• Running low: ${low.map((g) => `${g.trade} ${g.location} (${g.freshRows} left)`).join(", ")}`);
    }

    await reportAutomationStatus(sb, SHEET_TRIAGE_SLUG, "ok", lines.join(" ").trim() || "Nothing to pick — no sheets found.");
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
const MORNING_BRIEF_SLUG = "morning-brief";

export async function sendMorningBrief(): Promise<{ sent: boolean; meetings: number; dueItems: number }> {
  const sb = createSupabaseClient();

  // Same reasoning as getColdCallSheetBrief's own guard: the cron trigger
  // window is intentionally wide to survive GitHub Actions' scheduling
  // jitter (see cron.yml), so this is what actually stops a second run
  // landing inside that window from sending a duplicate Slack message.
  const todayNZT = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const { data: briefRow } = await sb.from("automations").select("last_run_at").eq("slug", MORNING_BRIEF_SLUG).maybeSingle();
  if (briefRow?.last_run_at) {
    const lastRunNZT = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(briefRow.last_run_at));
    if (lastRunNZT === todayNZT) return { sent: false, meetings: 0, dueItems: 0 };
  }
  // Recorded as "attempted" right away (not "sent"), so even a quiet day
  // with nothing to report still counts as today's run and a later
  // duplicate trigger inside the same window won't re-check from scratch.
  await reportAutomationStatus(sb, MORNING_BRIEF_SLUG, "ok", "Checked — see daily-sheet-triage / Slack for details.");

  const [events, allLeads] = await Promise.all([
    listTodaysEvents(TZ).catch(() => []),
    fetchAllRows<Lead>((from, to) => sb.from("leads").select("*").range(from, to)),
  ]);
  const sheetLines = await getColdCallSheetBrief(sb, allLeads);

  const todayStr = todayNZT;
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
