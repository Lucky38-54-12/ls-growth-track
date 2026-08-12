import { createSupabaseClient, fetchAllRows } from "./supabase";
import { getHealthSnapshot, computeSegmentSaturation } from "./leads";
import { searchDriveDocs, readGoogleDocText } from "./googleDocs";
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

// Matches leads by company name against words in the user's question — the
// aggregate pipeline snapshot never lists individual leads, so this is the
// only way the model ever learns a real lead_id slug to draft against
// ("draft a follow-up for Acme Electrical" needs to resolve to the actual
// row, not a guessed slug).
async function matchingLeads(sb: ReturnType<typeof createSupabaseClient>, userQuestion: string): Promise<string> {
  const words = userQuestion
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3);
  if (words.length === 0) return "";

  const seen = new Map<string, { lead_id: string; company: string; email: string; status: string }>();
  for (const word of words.slice(0, 6)) {
    const { data } = await sb
      .from("leads")
      .select("lead_id, company, email, status")
      .ilike("company", `%${word}%`)
      .limit(5);
    for (const row of data || []) seen.set(row.lead_id, row);
    if (seen.size >= 8) break;
  }
  if (seen.size === 0) return "";

  return Array.from(seen.values())
    .map((l) => `lead_id: ${l.lead_id} | company: ${l.company} | email: ${l.email} | status: ${l.status}`)
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

// Assembles everything the /dashboard/brain chat needs to answer a question
// or draft something, beyond what withWritingStyle() already adds (voice
// rules + Agency Brain sections) — one context block, built fresh per
// message from live data rather than a stored/indexed copy.
export async function buildBrainContext(userQuestion: string): Promise<string> {
  const sb = createSupabaseClient();

  const [leadsSummary, matchedLeads, automationsSummary, driveDocs] = await Promise.all([
    summarizeLeads(sb).catch(() => "Lead data unavailable."),
    matchingLeads(sb, userQuestion).catch(() => ""),
    summarizeAutomations(sb).catch(() => "Automation data unavailable."),
    relevantDriveDocs(userQuestion),
  ]);

  const sections = [
    `LEAD PIPELINE SNAPSHOT:\n${leadsSummary}`,
    matchedLeads ? `LEADS MATCHING THIS QUESTION (use the exact lead_id here when drafting an email):\n${matchedLeads}` : "",
    `AUTOMATIONS STATUS:\n${automationsSummary}`,
    driveDocs ? `RELEVANT GOOGLE DOCS (found via live Drive search, may not be exhaustive):\n${driveDocs}` : "",
  ].filter(Boolean);

  return sections.join("\n\n---\n\n");
}
