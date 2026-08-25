import { createSupabaseClient, fetchAllRows } from "./supabase";
import { getHealthSnapshot, computeSegmentSaturation } from "./leads";
import { searchDriveDocs, readGoogleDocText } from "./googleDocs";
import { listCalendarEvents, getDayRangeUTC } from "./calendar";
import { readLeadSheet, getSheetTitle, hasCallInfo } from "./sheets";
import { searchInboxByKeyword } from "./gmail";
import { getCampaignInsights } from "./metaAds";
import { findWorkingAds } from "./adResearch";
import { getRecentLearnings } from "./brainLearnings";
import { getAdLearningsForClient } from "./adLearnings";
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

// Generic English/app words that show up in almost every message and are
// too short to be a real name/company signal — without this, a plain "the"
// (from something as ordinary as "move the call...") substring-matches the
// placeholder contact_name "there" (many leads without a real contact name
// have this literal value) via ilike's raw %the%, silently attaching a
// drafted email to a completely unrelated lead. Word-boundary matching
// below closes most of this on its own, but a stopword list is cheap
// insurance against a short real word (e.g. "and") legitimately appearing
// inside an unrelated company name.
const STOPWORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "have", "your", "you", "him", "her", "his", "she", "who",
  "what", "when", "where", "why", "how", "can", "could", "would", "should", "just", "also", "get", "got", "let",
  "know", "tell", "send", "email", "call", "calls", "update", "updated", "move", "moving", "time", "today",
  "tomorrow", "tmrw", "week", "month", "need", "want", "make", "made", "give", "take", "look", "see", "said",
  "says", "say", "its", "our", "out", "about", "into", "over", "then", "than", "them", "they", "their", "there",
  "was", "were", "been", "will", "not", "are", "letting", "instead", "please", "thanks", "thank",
]);

function significantWords(text: string): string[] {
  return text
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w.toLowerCase()));
}

// Matches leads by company name OR contact name against words in the user's
// question — the aggregate pipeline snapshot never lists individual leads,
// so this is the only way the model ever learns a real lead_id slug to draft
// against. Originally company-only, which meant asking about a contact by
// first name alone (e.g. "what did Ray say", after a real meeting with him)
// found nothing and the model had no way to place who that even was —
// matching contact_name too is what actually resolves a name to a lead.
// Uses word-boundary regex (imatch), not ilike substring — "gav" must match
// a whole word, not silently substring-match some unrelated longer word.
async function matchingLeads(sb: ReturnType<typeof createSupabaseClient>, userQuestion: string): Promise<string> {
  const words = significantWords(userQuestion);
  if (words.length === 0) return "";

  const seen = new Map<string, { lead_id: string; company: string; contact_name: string; email: string; status: string }>();
  for (const word of words.slice(0, 6)) {
    const boundary = `\\y${word}\\y`;
    const { data } = await sb
      .from("leads")
      .select("lead_id, company, contact_name, email, status")
      .or(`company.imatch.${boundary},contact_name.imatch.${boundary}`)
      .limit(5);
    for (const row of data || []) seen.set(row.lead_id, row);
    if (seen.size >= 8) break;
  }
  if (seen.size === 0) return "";

  return Array.from(seen.values())
    .map((l) => `lead_id: ${l.lead_id} | company: ${l.company} | contact: ${l.contact_name || "unknown"} | email: ${l.email} | status: ${l.status}`)
    .join("\n");
}

interface AdConceptRow {
  name: string;
  angle: string;
  hypothesis: string;
  creativeReference?: { url: string | null } | null;
}

// Real campaign-brief content (ad concepts, reference links, the actual
// Google Doc URL) for whichever onboarded client the question is about —
// the Brain used to have no way to answer questions about a client's actual
// campaign doc beyond a generic Drive keyword search, so it would claim it
// couldn't read the doc at all even though this data already lives in
// campaign_briefs.service_details. Cross-service reference-link duplication
// (the same Instagram/TikTok link cited as "evidence" for two different
// services, e.g. a deck-build reel showing up under Renovation) is flagged
// here in code rather than left for the model to notice by eye — that's
// exactly the class of bug that prompted this: Buildit All's Renovation and
// Home extension services both cited the same two deck-build reels as their
// process-video reference.
async function campaignBriefSummary(sb: ReturnType<typeof createSupabaseClient>, userQuestion: string): Promise<string> {
  const words = significantWords(userQuestion).map((w) => w.toLowerCase());
  if (words.length === 0) return "";

  const { data: clients } = await sb.from("lq_clients").select("id, name").eq("status", "active");
  const matchedClient = (clients || []).find((c) =>
    words.some((w) => c.name.toLowerCase().includes(w) || w.includes(c.name.toLowerCase()))
  );
  if (!matchedClient) return "";

  const { data: brief } = await sb
    .from("campaign_briefs")
    .select("google_doc_url, service_details")
    .eq("client_id", matchedClient.id)
    .maybeSingle();
  if (!brief) return "";

  const serviceDetails = (brief.service_details || {}) as Record<string, { ads?: AdConceptRow[] }>;
  const services = Object.keys(serviceDetails);
  if (services.length === 0) return "";

  const linkToServices = new Map<string, Set<string>>();
  const serviceLines: string[] = [];
  for (const service of services) {
    const ads = serviceDetails[service]?.ads || [];
    if (ads.length === 0) continue;
    const adLines = ads.map((a, i) => {
      const link = a.creativeReference?.url;
      if (link) {
        if (!linkToServices.has(link)) linkToServices.set(link, new Set());
        linkToServices.get(link)!.add(service);
      }
      return `  ${i + 1}. "${a.name}" (${a.angle}) — hypothesis: ${a.hypothesis} — reference: ${link || "none"}`;
    });
    serviceLines.push(`${service}:\n${adLines.join("\n")}`);
  }

  const duplicated = Array.from(linkToServices.entries()).filter(([, svcs]) => svcs.size > 1);
  const duplicateWarning = duplicated.length
    ? `\n\nMISMATCHED REFERENCE LINKS DETECTED (same link cited as evidence for more than one service, likely wrong on at least one page): ${duplicated
        .map(([link, svcs]) => `${link} appears under ${Array.from(svcs).join(" AND ")}`)
        .join("; ")}`
    : "";

  return `Client: ${matchedClient.name} | Doc: ${brief.google_doc_url || "no doc linked"}\n\n${serviceLines.join("\n\n")}${duplicateWarning}`;
}

// Durable ad-performance patterns already banked for whichever client the
// question names (see lib/adLearnings.ts) — the compounding half of the
// learning loop described in AD_INTELLIGENCE_PROMPT below. Every row here
// already passed through Lucky's own approval (chat_drafts kind
// "ad_learning"), so these are treated as trusted prior evidence, not
// something to re-derive from scratch each time.
async function adLearningsSummary(sb: ReturnType<typeof createSupabaseClient>, userQuestion: string): Promise<string> {
  const words = significantWords(userQuestion).map((w) => w.toLowerCase());
  if (words.length === 0) return "";

  const { data: clients } = await sb.from("lq_clients").select("id, name").eq("status", "active");
  const matchedClient = (clients || []).find((c) =>
    words.some((w) => c.name.toLowerCase().includes(w) || w.includes(c.name.toLowerCase()))
  );
  if (!matchedClient) return "";

  const learnings = await getAdLearningsForClient(sb, matchedClient.id);
  if (learnings.length === 0) return "";

  return learnings
    .map((l) => {
      const tags = [l.service, l.angle, l.creative, l.offer].filter(Boolean).join(" | ");
      const inference = l.inference ? `\n  Inference: ${l.inference}` : "";
      const nextTest = l.next_test ? `\n  Next test: ${l.next_test}` : "";
      return `- [${l.confidence.replace(/_/g, " ")}] ${tags ? `(${tags}) ` : ""}Observed: ${l.observed}${inference}${nextTest}`;
    })
    .join("\n");
}

// Onboarded LQ clients (a different set of businesses from the leads
// pipeline above — these are LS Growth's own paying clients). List is small
// enough to give in full, same treatment as summarizeAutomations, so the
// Brain always has a real client_id to use for campaign_brief rather than
// guessing one from a name.
async function summarizeClients(sb: ReturnType<typeof createSupabaseClient>): Promise<string> {
  const { data } = await sb.from("lq_clients").select("id, name, trade").eq("status", "active").order("name");
  if (!data || data.length === 0) return "No active onboarded clients yet.";

  const { data: configs } = await sb
    .from("lq_client_configs")
    .select("client_id, services, version")
    .order("version", { ascending: false });
  const servicesByClient = new Map<string, string[]>();
  for (const c of configs || []) {
    if (!servicesByClient.has(c.client_id)) servicesByClient.set(c.client_id, c.services || []);
  }

  return data
    .map((c) => {
      const services = servicesByClient.get(c.id) || [];
      return `client_id: ${c.id} | name: ${c.name} | trade: ${c.trade || "not set"} | services: ${services.length ? services.join(", ") : "none set"}`;
    })
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
  return significantWords(userQuestion);
}

// Window starts 30 days back (from the start of that day, not just "now"),
// not just forward — a meeting held earlier today or a week or two ago (e.g.
// "what did Ray say on our call today", "who was that Friday") used to fall
// outside a "now to +7 days" window entirely (originally just 3 days back),
// so the model had no idea who a contact even was well after Lucky actually
// met them. Past events are just as useful context as upcoming ones for
// "who is X" / "what did we agree" questions. 30 days comfortably covers
// "last week" asks without the context block growing unbounded.
async function upcomingCalendarSummary(): Promise<string> {
  try {
    const timeZone = "Pacific/Auckland";
    const now = new Date();
    const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
    const { startISO: todayStartISO } = getDayRangeUTC(todayStr, timeZone);
    const rangeStart = new Date(new Date(todayStartISO).getTime() - 30 * 24 * 60 * 60 * 1000);
    const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const events = await listCalendarEvents(rangeStart.toISOString(), in7Days.toISOString());
    if (events.length === 0) return "Nothing on the calendar from the last 30 days through the next 7.";
    return events
      .map((e) => {
        const when = e.allDay
          ? e.startISO.slice(0, 10)
          : new Date(e.startISO).toLocaleString("en-NZ", { timeZone, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
        const who = e.attendeeName && e.attendeeEmail
          ? ` with ${e.attendeeName} <${e.attendeeEmail}>`
          : e.attendeeName || e.attendeeEmail
            ? ` with ${e.attendeeName || e.attendeeEmail}`
            : "";
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

// Real signed agreement examples live in brain_reference_examples (DB), not
// in source — this is real client business (names, fees, terms), which
// doesn't belong committed into git history. Add more rows there (same
// "agreement_template" key, or a new key) rather than hardcoding another
// one here.
async function agreementTemplateSummary(sb: ReturnType<typeof createSupabaseClient>, userQuestion: string): Promise<string> {
  const words = questionWords(userQuestion).map((w) => w.toLowerCase());
  const relevant = ["agreement", "contract", "onboarding", "onboard", "sign", "signed", "deal", "terms", "proposal"].some((k) => words.includes(k));
  if (!relevant) return "";

  const [{ data: examples }, liveDoc] = await Promise.all([
    sb.from("brain_reference_examples").select("title, content").eq("key", "agreement_template"),
    readGoogleDocText(AGREEMENT_TEMPLATE_DOC_ID, 8000).catch(() => ""),
  ]);

  const storedExamples = (examples || [])
    .map((e) => `${e.title}:\n${e.content}`)
    .join("\n\n---\n\n");

  return [
    storedExamples ? `Real signed example(s) (use their structure/section numbering as the pattern, swap in this deal's actual client name, dates, and numbers):\n${storedExamples}` : "",
    liveDoc ? `Additional reference doc from Drive:\n${liveDoc}` : "",
  ].filter(Boolean).join("\n\n---\n\n");
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

// Full funnel metrics per campaign (impressions -> CTR -> CPC -> results ->
// CPL), keyed to whichever onboarded client the question names — falls back
// to the single env-var account for a generic "how's meta ads doing"
// question with no client named. This app has no ad-set/ad level breakdown
// or downstream qualified-lead/appointment/sale tracking yet, so those
// stages are simply absent from the summary rather than guessed at.
async function metaAdsSummary(sb: ReturnType<typeof createSupabaseClient>, userQuestion: string): Promise<string> {
  try {
    const words = significantWords(userQuestion).map((w) => w.toLowerCase());
    const { data: clients } = await sb.from("lq_clients").select("id, name, meta_ad_account_id").eq("status", "active");
    const matchedClient = (clients || []).find(
      (c) => c.meta_ad_account_id && words.some((w) => c.name.toLowerCase().includes(w) || w.includes(c.name.toLowerCase()))
    );

    const adAccountId = matchedClient?.meta_ad_account_id || process.env.META_AD_ACCOUNT_ID;
    if (!adAccountId) return "";

    const campaigns = await getCampaignInsights(adAccountId, "last_30d");
    const label = matchedClient ? `${matchedClient.name} — ` : "";
    if (campaigns.length === 0) return `${label}No active Meta Ads campaigns.`;

    return campaigns
      .slice(0, 10)
      .map((c) => {
        const cpl = c.costPerResult ? `$${c.costPerResult.toFixed(2)} per ${c.resultType || "result"}` : "no cost-per-result yet";
        return `${label}${c.name} (${c.status}): $${c.spend.toFixed(2)} spend, ${c.impressions.toLocaleString()} impressions, ${c.ctr.toFixed(2)}% CTR, $${c.cpc.toFixed(2)} CPC, ${c.results ?? 0} ${c.resultType || "results"} (${cpl})`;
      })
      .join("\n")
      .concat("\n\n(No qualified-lead, appointment, or sale data is tracked in this app yet — treat CPL as the deepest funnel stage available, not the whole picture.)");
  } catch {
    return "";
  }
}

// Real Meta/Facebook ad research (see lib/adResearch.ts, same tool behind
// /dashboard/meta-ads' Research tab) — a hand-verified Ad Library cache when
// one exists for the niche/location asked about, otherwise a live AI web
// search for real current ad examples/angles. This is a genuine outbound web
// search (slow, and the AI-web-search fallback costs real API spend), so
// it's keyword-gated like agreementTemplateSummary rather than run on every
// message — only questions that actually read like "what ads/angles are
// working" should trigger it. META ADS SUMMARY above is a different thing
// (LS Growth's own campaign spend/performance), so a bare "meta" mention
// alone isn't enough here.
async function adResearchSummary(userQuestion: string): Promise<string> {
  const words = questionWords(userQuestion).map((w) => w.toLowerCase());
  const relevant = ["ad", "ads", "advert", "adverts", "advertising", "angle", "angles", "creative", "creatives"].some((k) => words.includes(k));
  if (!relevant) return "";

  try {
    const research = await findWorkingAds(userQuestion, "");
    if (!research.ads.length) return "";
    const adsList = research.ads
      .slice(0, 8)
      .map(
        (a) =>
          `- ${a.headline} | angle: ${a.angle}${a.offer ? ` | offer: ${a.offer}` : ""} | format: ${a.format}${a.source_business ? ` | business: ${a.source_business}` : ""}${a.source_url ? ` | source: ${a.source_url}` : ""}`
      )
      .join("\n");
    const sourceLabel = research.source === "live_ad_library" ? "verified Ad Library cache" : "AI web search — source links only present when actually found, never invented";
    return `${research.summary}\n${adsList}\n(source: ${sourceLabel})`;
  } catch {
    return "";
  }
}

// The Lead Generation Intelligence System: how the Brain should reason about
// ads specifically — treating campaign_briefs (strategy/hypotheses) and Meta
// Ads data (results) as two halves of a test-and-learn loop, not two
// unrelated facts to recite. Only appended for questions that actually read
// as ad/campaign work — injecting this into every single message would
// bloat the system prompt and bias ordinary lead-pipeline questions toward
// ad-speak they have nothing to do with.
const AD_INTELLIGENCE_KEYWORDS = [
  "ad", "ads", "advert", "adverts", "campaign", "campaigns", "angle", "angles", "creative", "creatives",
  "cpl", "ctr", "cpc", "cpm", "meta", "test", "tests", "testing", "winner", "winning", "losing", "performance",
  "performing", "hook", "offer", "offers",
];

const AD_INTELLIGENCE_PROMPT = `AD/CAMPAIGN INTELLIGENCE MODE — this question is about ad performance or ad ideas, so reason about it this way:

Treat every campaign as a series of hypotheses being tested, not random ads until something works. The goal is to discover WHO responds + to WHAT problem/desire + through WHICH angle + with WHICH creative + with WHICH offer — then use that to improve future campaigns. CAMPAIGN BRIEF / AD CONCEPTS below is the strategy/hypothesis half; META ADS below is the real-world result half. Cross-reference them — don't just recite one.

CREATING NEW ADS: use the client's campaign brief first (services, ideal customer, offers, competitor research). For each concept give ONLY: Who / Angle / Creative / Offer / Hypothesis / Primary Text / Headline. Deliberately vary the angle across a set (e.g. transformation, unused space, cost uncertainty, trust in the builder, quality, an ageing/failing status quo) — creative and offer should support the angle, not be picked at random. No long strategy explanations unless asked.

ANALYSING RESULTS: don't just name the cheapest CPL. Walk the funnel — impressions -> CTR -> CPC -> leads -> CPL (-> qualified leads -> appointments -> sales, only if that data is actually present) — and say where the bottleneck looks like it is: low CTR points at hook/creative/angle/relevance/offer; good CTR but weak lead conversion points at offer/primary text/landing-form experience; cheap CPL but poor quality points at messaging attracting the wrong people; higher CPL with strong quality should NOT be auto-labelled a loser — weigh it against downstream value.

CONFIDENCE: grade every claim — Early Signal (not enough data, interesting not conclusive) / Promising (enough to justify more testing) / Strong Evidence (consistently better with meaningful spend) / Proven (repeated across multiple campaigns). Never call something "proven" off a handful of leads — if data's thin, say so plainly.

PATTERNS OVER SINGLE WINNERS: when something performs well, don't just say "Ad 3 won" — break out what likely caused it (audience, angle, hook, creative format, offer, CTA, service, geography) and name the pattern, e.g. "the transformation angle with before/after creative is the strongest current signal — worth more variations of that specific combination." When recommending next tests, prioritize: exploit clear winners > investigate promising signals > test important unknowns > stop spend on clear losers. Don't fully abandon a winning angle just to get new creative — vary the hook/project/format/offer around it instead.

LEARNING LOOP: Research -> Hypothesis -> Test -> Meta Data -> Analysis -> Learning -> Next Test. When you state a learning, separate Observed (what the data directly shows) from Inference (what you think explains it) from Next Test (what would confirm/reject the inference) — never present an inference as settled fact. Check AD LEARNINGS, LEARNED FROM EXPERIENCE, and the client's campaign brief for prior evidence on this same industry/service/angle/offer before recommending a test as if starting from zero — AD LEARNINGS is exactly this: durable patterns already banked from past analysis of this specific client, already approved by Lucky.

BANKING NEW LEARNINGS: when analysis of real Meta data surfaces a pattern worth remembering for next time (Promising confidence or higher — not a bare Early Signal), propose it as an ad_learning draft so it gets saved to AD LEARNINGS for future turns, instead of just saying it once and losing it. This always needs a real approve/reject from Lucky first, same as every other draft kind — never claim it's already saved until he's approved it.

KEEP IT SIMPLE: "what should I test" -> best 3-5 tests. "what's working" -> what's working / what's not / why / confidence level / what to test next. "create ads" -> the concise test-card format only, nothing else.`;

function adIntelligenceInstructions(userQuestion: string): string {
  const words = questionWords(userQuestion).map((w) => w.toLowerCase());
  const relevant = AD_INTELLIGENCE_KEYWORDS.some((k) => words.includes(k));
  return relevant ? AD_INTELLIGENCE_PROMPT : "";
}

// Bounds any one context section to SECTION_TIMEOUT_MS so a single slow/hung
// external API (Gmail, Drive, Sheets, Calendar and Meta Ads have all been
// slow at points) can't drag the whole /api/brain/chat request past the
// serverless function's time budget — a request stuck for minutes either
// gets killed by the platform or abandoned by the browser, and either way
// the client only ever sees the generic "Couldn't reach the brain" error
// instead of a real answer built from whatever context did come back in time.
const SECTION_TIMEOUT_MS = 8000;
function withTimeout<T>(promise: Promise<T>, fallback: T, ms = SECTION_TIMEOUT_MS): Promise<T> {
  return Promise.race([promise, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
}

// Assembles everything the /dashboard/brain chat needs to answer a question
// or draft something, beyond what withWritingStyle() already adds (voice
// rules + Agency Brain sections) — one context block, built fresh per
// message from live data rather than a stored/indexed copy.
// recentUserMessages lets name/company matching survive a follow-up that
// only uses a pronoun ("send him an email") — the lead/sheet a question is
// actually about was often named a turn or two ago, not in this message.
export async function buildBrainContext(userQuestion: string, recentUserMessages: string[] = []): Promise<string> {
  const sb = createSupabaseClient();
  const matchContext = [...recentUserMessages.slice(-4), userQuestion].join(" ");

  const [leadsSummary, matchedLeads, clientsSummary, automationsSummary, driveDocs, calendarSummary, sheetsSummary, inboxSummary, adsSummary, adResearch, salesCallsSummary, campaignsSummary, learningsSummary, agreementTemplate, campaignBrief, adLearnings] = await Promise.all([
    withTimeout(summarizeLeads(sb).catch(() => "Lead data unavailable."), "Lead data unavailable."),
    withTimeout(matchingLeads(sb, matchContext).catch(() => ""), ""),
    withTimeout(summarizeClients(sb).catch(() => "Client data unavailable."), "Client data unavailable."),
    withTimeout(summarizeAutomations(sb).catch(() => "Automation data unavailable."), "Automation data unavailable."),
    withTimeout(relevantDriveDocs(userQuestion), ""),
    withTimeout(upcomingCalendarSummary(), ""),
    withTimeout(matchingSheets(sb, matchContext), ""),
    withTimeout(inboxSearchSummary(userQuestion), ""),
    withTimeout(metaAdsSummary(sb, matchContext), ""),
    withTimeout(adResearchSummary(userQuestion), "", 25000),
    withTimeout(summarizeSalesCalls(sb).catch(() => "Sales call data unavailable."), "Sales call data unavailable."),
    withTimeout(summarizeCampaignsAndRevenue(sb).catch(() => "Campaign/revenue data unavailable."), "Campaign/revenue data unavailable."),
    withTimeout(summarizeLearnings(sb), ""),
    withTimeout(agreementTemplateSummary(sb, userQuestion).catch(() => ""), ""),
    withTimeout(campaignBriefSummary(sb, matchContext).catch(() => ""), ""),
    withTimeout(adLearningsSummary(sb, matchContext).catch(() => ""), ""),
  ]);

  const todayLabel = new Intl.DateTimeFormat("en-NZ", {
    timeZone: "Pacific/Auckland", weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit",
  }).format(new Date());

  const adIntelligence = adIntelligenceInstructions(matchContext);

  const sections = [
    `TODAY: ${todayLabel} (NZ time) — use this to resolve any relative date/time reference (e.g. "Thursday 2pm") into a real ISO datetime.`,
    adIntelligence,
    `LEAD PIPELINE SNAPSHOT:\n${leadsSummary}`,
    matchedLeads ? `LEADS MATCHING THIS QUESTION (use the exact lead_id here when drafting an email):\n${matchedLeads}` : "",
    `ONBOARDED CLIENTS (use the exact client_id here when setting up a campaign brief, never invent one):\n${clientsSummary}`,
    `AUTOMATIONS STATUS:\n${automationsSummary}`,
    driveDocs ? `RELEVANT GOOGLE DOCS (found via live Drive search, may not be exhaustive):\n${driveDocs}` : "",
    calendarSummary ? `CALENDAR (last 30 days through next 7, "(past)" marks ones already happened):\n${calendarSummary}` : "",
    sheetsSummary ? `COLD-CALL SHEETS:\n${sheetsSummary}` : "",
    inboxSummary ? `INBOX SEARCH RESULTS (subject match, may not be exhaustive):\n${inboxSummary}` : "",
    adsSummary ? `META ADS (last 30 days):\n${adsSummary}` : "",
    adResearch ? `AD RESEARCH (real ad angles/examples relevant to this question):\n${adResearch}` : "",
    `SALES CALLS & SCRIPT:\n${salesCallsSummary}`,
    `CAMPAIGNS & REVENUE:\n${campaignsSummary}`,
    learningsSummary ? `LEARNED FROM EXPERIENCE (distilled from Lucky's past approve/reject decisions — treat these as standing preferences, not one-off notes):\n${learningsSummary}` : "",
    agreementTemplate ? `AGREEMENT TEMPLATE (the real example of what an LS Growth client agreement looks like — use its structure and wording as the pattern when drafting a new one, filling in this specific deal's details):\n${agreementTemplate}` : "",
    campaignBrief ? `CAMPAIGN BRIEF / AD CONCEPTS (real content from the client's actual campaign brief doc — you CAN read this, never claim you can't see the doc):\n${campaignBrief}` : "",
    adLearnings ? `AD LEARNINGS (durable patterns already banked for this client, each already approved by Lucky — treat as trusted prior evidence, check before recommending a test as if starting from zero):\n${adLearnings}` : "",
  ].filter(Boolean);

  return sections.join("\n\n---\n\n");
}
