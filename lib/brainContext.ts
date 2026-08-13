import { createSupabaseClient, fetchAllRows } from "./supabase";
import { getHealthSnapshot, computeSegmentSaturation } from "./leads";
import { searchDriveDocs, readGoogleDocText } from "./googleDocs";
import { listCalendarEvents, getDayRangeUTC } from "./calendar";
import { readLeadSheet, getSheetTitle, hasCallInfo } from "./sheets";
import { searchInboxByKeyword } from "./gmail";
import { getCampaignInsights } from "./metaAds";
import { getRecentLearnings } from "./brainLearnings";
import { Lead } from "./types";

interface AutomationRow {
  name: string;
  kind: "routine" | "cron";
  enabled: boolean;
  last_run_at: string | null;
  last_status: "ok" | "error" | null;
  last_summary: string | null;
}

async function summarizeLeads(sb: ReturnType<typeof createSupabaseClient>): Promise<string> {
  const leads = await fetchAllRows<Pick<Lead, "status" | "trade" | "location">>((from, to) =>
    sb.from("leads").select("status, trade, location").range(from, to)
  );

  const statusCounts = new Map<string, number>();
  for (const lead of leads) statusCounts.set(lead.status, (statusCounts.get(lead.status) || 0) + 1);
  const statusLines = Array.from(statusCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([status, count]) => `${status}: ${count}`)
    .join(", ");

  const saturation = computeSegmentSaturation(leads);
  const saturated = Array.from(saturation.values()).filter((s) => s.saturated);
  const saturatedLine = saturated.length
    ? saturated.map((s) => `${s.trade || "uncategorized"} in ${s.location || "unknown"} (${s.count} live)`).join("; ")
    : "none";

  const health = await getHealthSnapshot(sb);

  return [
    `Total leads: ${leads.length}`,
    `By status: ${statusLines || "none"}`,
    `Saturated segments (enough live meetings, deprioritize more calling here): ${saturatedLine}`,
    `Emails held for review over 24h: ${health.stuck_over_24h}`,
    `Stale sheet syncs: ${health.stale_sheet_syncs.length}`,
  ].join("\n");
}

// Matches leads by company name OR contact name against words in the user's
// question — the aggregate pipeline snapshot never lists individual leads,
// so this is the only way the model ever learns a real lead_id slug to draft
// against. Originally company-only, which meant asking about a contact by
// first name alone (e.g. "what did Ray say", after a real meeting with him)
// found nothing and the model had no way to place who that even was —
// matching contact_name too is what actually resolves a name to a lead.
async function matchingLeads(sb: ReturnType<typeof createSupabaseClient>, userQuestion: string): Promise<string> {
  const words = userQuestion
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3);
  if (words.length === 0) return "";

  const seen = new Map<string, { lead_id: string; company: string; contact_name: string; email: string; status: string }>();
  for (const word of words.slice(0, 6)) {
    const { data } = await sb
      .from("leads")
      .select("lead_id, company, contact_name, email, status")
      .or(`company.ilike.%${word}%,contact_name.ilike.%${word}%`)
      .limit(5);
    for (const row of data || []) seen.set(row.lead_id, row);
    if (seen.size >= 8) break;
  }
  if (seen.size === 0) return "";

  return Array.from(seen.values())
    .map((l) => `lead_id: ${l.lead_id} | company: ${l.company} | contact: ${l.contact_name || "unknown"} | email: ${l.email} | status: ${l.status}`)
    .join("\n");
}

async function summarizeAutomations(sb: ReturnType<typeof createSupabaseClient>): Promise<string> {
  const { data } = await sb.from("automations").select("name, kind, enabled, last_run_at, last_status, last_summary");
  const automations = (data || []) as AutomationRow[];
  if (automations.length === 0) return "None configured.";
  return automations
    .map((a) => {
      const status = !a.enabled ? "disabled" : !a.last_run_at ? "never run" : a.last_status === "error" ? "last run failed" : "running fine";
      return `${a.name} (${a.kind}, ${status})${a.last_summary ? ` — ${a.last_summary}` : ""}`;
    })
    .join("\n");
}

// Live full-text search against Drive, not a stored index — Lucky's actual
// client planning (ad plans, onboarding notes, layouts) lives in Google
// Docs, not this app's database, so a question the brain can't answer from
// Supabase alone should still check Drive before giving up.
async function relevantDriveDocs(userQuestion: string): Promise<string> {
  try {
    const matches = await searchDriveDocs(userQuestion, 3);
    if (matches.length === 0) return "";
    const bodies = await Promise.all(
      matches.map(async (m) => {
        try {
          const text = await readGoogleDocText(m.id, 3000);
          return `### ${m.name} (${m.url})\n${text}`;
        } catch {
          return `### ${m.name} (${m.url})\n(could not read content)`;
        }
      })
    );
    return bodies.join("\n\n");
  } catch {
    // Drive search failing (auth issue, no matches, quota) should never
    // block the chat from answering with whatever other context it has.
    return "";
  }
}

function questionWords(userQuestion: string): string[] {
  return userQuestion.replace(/[^a-zA-Z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length >= 3);
}

// Window starts 3 days back (from the start of that day, not just "now"),
// not just forward — a meeting held earlier today or a couple days ago (e.g.
// "what did Ray say on our call today") used to fall outside a "now to +7
// days" window entirely, so the model had no idea who a contact even was
// right after Lucky actually met them. Past events are just as useful
// context as upcoming ones for "who is X" / "what did we agree" questions.
async function upcomingCalendarSummary(): Promise<string> {
  try {
    const timeZone = "Pacific/Auckland";
    const now = new Date();
    const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
    const { startISO: todayStartISO } = getDayRangeUTC(todayStr, timeZone);
    const rangeStart = new Date(new Date(todayStartISO).getTime() - 3 * 24 * 60 * 60 * 1000);
    const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const events = await listCalendarEvents(rangeStart.toISOString(), in7Days.toISOString());
    if (events.length === 0) return "Nothing on the calendar from the last 3 days through the next 7.";
    return events
      .map((e) => {
        const when = e.allDay
          ? e.startISO.slice(0, 10)
          : new Date(e.startISO).toLocaleString("en-NZ", { timeZone, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
        const who = e.attendeeName || e.attendeeEmail ? ` with ${e.attendeeName || e.attendeeEmail}` : "";
        const past = new Date(e.startISO).getTime() < now.getTime() ? " (past)" : "";
        return `${when}${past}: ${e.summary}${who}`;
      })
      .join("\n");
  } catch {
    // Calendar auth/quota issues should never block the rest of the answer.
    return "";
  }
}

// tracked_sheets is cheap (one Supabase query, no Google API call) so every
// active sheet is always listed. Full sheet content (a real Sheets API call,
// which has a documented per-minute quota this app has hit before) is only
// read for the handful of sheets the question actually seems to be about.
async function matchingSheets(sb: ReturnType<typeof createSupabaseClient>, userQuestion: string): Promise<string> {
  try {
    const { data } = await sb
      .from("tracked_sheets")
      .select("sheet_id, trade_default, location_default, last_synced_at")
      .eq("active", true);
    const sheets = data || [];
    if (sheets.length === 0) return "No tracked sheets.";

    const overview = sheets
      .map((s) => `sheet_id: ${s.sheet_id} | ${s.trade_default || "?"} / ${s.location_default || "?"} — last synced ${s.last_synced_at ? new Date(s.last_synced_at).toLocaleDateString("en-NZ") : "never"}`)
      .join("\n");

    const words = questionWords(userQuestion);
    const matched = words.length
      ? sheets
          .filter((s) =>
            words.some(
              (w) =>
                (s.trade_default || "").toLowerCase().includes(w.toLowerCase()) ||
                (s.location_default || "").toLowerCase().includes(w.toLowerCase())
            )
          )
          .slice(0, 2)
      : [];

    let detail = "";
    if (matched.length > 0) {
      const details = await Promise.all(
        matched.map(async (s) => {
          try {
            const [title, rows] = await Promise.all([getSheetTitle(s.sheet_id), readLeadSheet(s.sheet_id)]);
            const called = rows.filter(hasCallInfo).length;
            return `${title || s.sheet_id} (sheet_id: ${s.sheet_id}, ${s.trade_default}/${s.location_default}): ${called} of ${rows.length} called`;
          } catch {
            return "";
          }
        })
      );
      detail = details.filter(Boolean).join("\n");
    }

    return [`Active tracked sheets:\n${overview}`, detail ? `Matched sheet detail:\n${detail}` : ""].filter(Boolean).join("\n\n");
  } catch {
    return "";
  }
}

// Only searches by subject keyword and only fetches envelope data (never
// fetchMessageDetail, which marks messages as read) — asking the brain a
// question must never silently mark a real unread email as read.
async function inboxSearchSummary(userQuestion: string): Promise<string> {
  try {
    const words = questionWords(userQuestion);
    if (words.length === 0) return "";
    const query = [...words].sort((a, b) => b.length - a.length)[0];
    const results = await searchInboxByKeyword(query);
    if (results.length === 0) return "";
    return results
      .slice(0, 3)
      .map((m) => `"${m.subject}" from ${m.from || m.fromEmail} on ${new Date(m.date).toLocaleDateString("en-NZ")}${m.seen ? "" : " (unread)"}`)
      .join("\n");
  } catch {
    return "";
  }
}

// Sales calls, the current master script, and open recurring patterns — none
// of this reached the brain before, so a request like "update the sales
// script" had nothing to work from and no way to actually propose a change.
async function summarizeSalesCalls(sb: ReturnType<typeof createSupabaseClient>): Promise<string> {
  const [{ data: calls }, { data: currentVersion }, { data: patterns }] = await Promise.all([
    sb.from("sales_calls").select("id, call_date, prospect_name, business_name, outcome, main_objection, next_step_booked, next_step_detail, went_well, work_ons").order("call_date", { ascending: false }).limit(20),
    sb.from("sales_script_versions").select("version, content, changelog").eq("is_current", true).maybeSingle(),
    sb.from("sales_pattern_tracker").select("id, pattern_summary, status, cost, occurrences, fix_applied_at, fix_landing_status").eq("status", "open").order("occurrences", { ascending: false }),
  ]);

  const recentCalls = (calls || [])
    .map((c) => `id: ${c.id} | ${c.call_date} | ${c.prospect_name || "?"} (${c.business_name || "?"}) | outcome: ${c.outcome}${c.main_objection ? ` | objection: ${c.main_objection}` : ""}${c.next_step_booked ? ` | next step: ${c.next_step_detail}` : ""}${c.went_well ? ` | went well: ${c.went_well}` : ""}${c.work_ons ? ` | work on: ${c.work_ons}` : ""}`)
    .join("\n");

  const openPatterns = (patterns || [])
    .map((p) => `id: ${p.id} | "${p.pattern_summary}" | cost: ${p.cost} | occurrences: ${p.occurrences}${p.fix_applied_at ? ` | fix applied, landing status: ${p.fix_landing_status}` : " | no fix applied yet"}`)
    .join("\n");

  return [
    `Current master script (version ${currentVersion?.version ?? "none"}):\n${currentVersion?.content?.trim() ? currentVersion.content : "No script saved yet."}`,
    `Recent logged calls (most recent first, use the exact id if referencing one):\n${recentCalls || "None logged yet."}`,
    `Open recurring patterns (things the script hasn't fixed yet):\n${openPatterns || "None open."}`,
  ].join("\n\n");
}

// The one canonical example of what an LS Growth client agreement looks
// like (Lucky's own Google Doc) — read live rather than copied in, so
// editing the doc is the only thing needed to change what the brain bases
// new agreements on. Only pulled in when the question actually looks like
// it's about an agreement/contract, same reasoning as the other
// keyword-gated sections: it's a large doc and most questions don't need it.
const AGREEMENT_TEMPLATE_DOC_ID = "1_AFoqdSBkeaJ4sOX55d_c1JAw4jNGNtPsbFXpyxstD4";

async function agreementTemplateSummary(userQuestion: string): Promise<string> {
  const words = questionWords(userQuestion).map((w) => w.toLowerCase());
  const relevant = ["agreement", "contract", "onboarding", "onboard", "sign", "signed", "deal", "terms", "proposal"].some((k) => words.includes(k));
  if (!relevant) return "";
  try {
    const text = await readGoogleDocText(AGREEMENT_TEMPLATE_DOC_ID, 8000);
    return text || "";
  } catch {
    return "";
  }
}

async function summarizeCampaignsAndRevenue(sb: ReturnType<typeof createSupabaseClient>): Promise<string> {
  const [{ data: campaigns }, { data: revenueClients }, { data: revenueGoal }, { data: warmLeads }] = await Promise.all([
    sb.from("campaigns").select("id, name, status, activated_at"),
    sb.from("revenue_clients").select("amount, added_at"),
    sb.from("revenue_goal").select("monthly_goal").eq("id", 1).maybeSingle(),
    sb.from("warm_leads").select("id").eq("called", false),
  ]);

  const campaignLines = (campaigns || [])
    .map((c) => `${c.name} (${c.status})`)
    .join(", ");

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthTotal = (revenueClients || [])
    .filter((r) => new Date(r.added_at) >= monthStart)
    .reduce((sum, r) => sum + Number(r.amount || 0), 0);
  const goal = Number(revenueGoal?.monthly_goal ?? 0);

  return [
    `Campaigns: ${campaignLines || "none"}`,
    `Revenue this month: $${monthTotal.toFixed(0)}${goal ? ` of $${goal.toFixed(0)} goal` : ""}`,
    `Uncalled warm leads: ${(warmLeads || []).length}`,
  ].join("\n");
}

// Insights distilled from Lucky's own approve/reject decisions (see
// lib/brainLearnings.ts) — a second, AI-populated source alongside the
// hand-written Agency Brain, fed into every future call the same way.
async function summarizeLearnings(sb: ReturnType<typeof createSupabaseClient>): Promise<string> {
  try {
    const learnings = await getRecentLearnings(sb, 40);
    if (learnings.length === 0) return "";
    return learnings.map((l) => `- ${l.insight}`).join("\n");
  } catch {
    return "";
  }
}

async function metaAdsSummary(): Promise<string> {
  try {
    const adAccountId = process.env.META_AD_ACCOUNT_ID;
    if (!adAccountId) return "";
    const campaigns = await getCampaignInsights(adAccountId, "last_30d");
    if (campaigns.length === 0) return "No active Meta Ads campaigns.";
    return campaigns
      .slice(0, 10)
      .map(
        (c) =>
          `${c.name} (${c.status}): $${c.spend.toFixed(0)} spent, ${c.results ?? "?"} ${c.resultType || "results"}${c.costPerResult ? ` at $${c.costPerResult.toFixed(0)} each` : ""}`
      )
      .join("\n");
  } catch {
    return "";
  }
}

// Assembles everything the /dashboard/brain chat needs to answer a question
// or draft something, beyond what withWritingStyle() already adds (voice
// rules + Agency Brain sections) — one context block, built fresh per
// message from live data rather than a stored/indexed copy.
export async function buildBrainContext(userQuestion: string): Promise<string> {
  const sb = createSupabaseClient();

  const [leadsSummary, matchedLeads, automationsSummary, driveDocs, calendarSummary, sheetsSummary, inboxSummary, adsSummary, salesCallsSummary, campaignsSummary, learningsSummary, agreementTemplate] = await Promise.all([
    summarizeLeads(sb).catch(() => "Lead data unavailable."),
    matchingLeads(sb, userQuestion).catch(() => ""),
    summarizeAutomations(sb).catch(() => "Automation data unavailable."),
    relevantDriveDocs(userQuestion),
    upcomingCalendarSummary(),
    matchingSheets(sb, userQuestion),
    inboxSearchSummary(userQuestion),
    metaAdsSummary(),
    summarizeSalesCalls(sb).catch(() => "Sales call data unavailable."),
    summarizeCampaignsAndRevenue(sb).catch(() => "Campaign/revenue data unavailable."),
    summarizeLearnings(sb),
    agreementTemplateSummary(userQuestion).catch(() => ""),
  ]);

  const todayLabel = new Intl.DateTimeFormat("en-NZ", {
    timeZone: "Pacific/Auckland", weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit",
  }).format(new Date());

  const sections = [
    `TODAY: ${todayLabel} (NZ time) — use this to resolve any relative date/time reference (e.g. "Thursday 2pm") into a real ISO datetime.`,
    `LEAD PIPELINE SNAPSHOT:\n${leadsSummary}`,
    matchedLeads ? `LEADS MATCHING THIS QUESTION (use the exact lead_id here when drafting an email):\n${matchedLeads}` : "",
    `AUTOMATIONS STATUS:\n${automationsSummary}`,
    driveDocs ? `RELEVANT GOOGLE DOCS (found via live Drive search, may not be exhaustive):\n${driveDocs}` : "",
    calendarSummary ? `CALENDAR (last 3 days through next 7, "(past)" marks ones already happened):\n${calendarSummary}` : "",
    sheetsSummary ? `COLD-CALL SHEETS:\n${sheetsSummary}` : "",
    inboxSummary ? `INBOX SEARCH RESULTS (subject match, may not be exhaustive):\n${inboxSummary}` : "",
    adsSummary ? `META ADS (last 30 days):\n${adsSummary}` : "",
    `SALES CALLS & SCRIPT:\n${salesCallsSummary}`,
    `CAMPAIGNS & REVENUE:\n${campaignsSummary}`,
    learningsSummary ? `LEARNED FROM EXPERIENCE (distilled from Lucky's past approve/reject decisions — treat these as standing preferences, not one-off notes):\n${learningsSummary}` : "",
    agreementTemplate ? `AGREEMENT TEMPLATE (the real example of what an LS Growth client agreement looks like — use its structure and wording as the pattern when drafting a new one, filling in this specific deal's details):\n${agreementTemplate}` : "",
  ].filter(Boolean);

  return sections.join("\n\n---\n\n");
}
