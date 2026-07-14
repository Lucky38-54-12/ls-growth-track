import { createSupabaseClient, fetchAllRows } from "@/lib/supabase";
import { SalesCall, ScriptVersion, ScriptProposal, Lead, EmailEvent, EngagementSummary, PatternTracker } from "@/lib/types";
import { computeStats, computePatterns } from "@/lib/salesCallsStats";
import { ONBOARDING_PIPELINE_STATUSES } from "@/lib/onboardingSteps";
import Topbar from "@/components/Topbar";
import SalesCallsClient from "@/components/salesCalls/SalesCallsClient";

export const revalidate = 0;

export default async function SalesCallsPage() {
  const sb = createSupabaseClient();

  const [calls, { data: versions }, { data: pendingProposals }, allLeads, { data: events }, { data: scriptPatterns }] = await Promise.all([
    fetchAllRows<SalesCall>((from, to) => sb.from("sales_calls").select("*").order("created_at", { ascending: false }).range(from, to)),
    sb.from("sales_script_versions").select("*").order("version", { ascending: false }),
    sb.from("sales_script_proposals").select("*").eq("status", "pending").order("created_at", { ascending: false }),
    fetchAllRows<Lead>((from, to) => sb.from("leads").select("*").order("date_added", { ascending: false }).range(from, to)),
    sb.from("email_events").select("*").order("created_at", { ascending: false }),
    sb.from("sales_pattern_tracker").select("*").order("created_at", { ascending: false }),
  ]);

  const allVersions = (versions || []) as ScriptVersion[];
  const currentVersion = allVersions.find((v) => v.is_current) || allVersions[0] || null;
  const proposals = (pendingProposals || []) as ScriptProposal[];

  const stats = computeStats(calls);
  const patterns = computePatterns(calls);

  // Sales & Onboarding pipeline is cold-call only — email-outreach leads
  // have their own pages (Email Outreach, Email Tracking) and share these
  // same status values, so the source check is required here.
  const pipelineLeads = allLeads.filter((l) => l.source === "cold_call" && ONBOARDING_PIPELINE_STATUSES.has(l.status));
  const engagement: Record<string, EngagementSummary> = {};
  for (const ev of (events || []) as EmailEvent[]) {
    if (!engagement[ev.lead_id]) engagement[ev.lead_id] = { opens: 0, clicks: 0, last_event_at: null };
    if (ev.event_type === "open") engagement[ev.lead_id].opens++;
    if (ev.event_type === "click") engagement[ev.lead_id].clicks++;
    if (!engagement[ev.lead_id].last_event_at) engagement[ev.lead_id].last_event_at = ev.created_at;
  }

  return (
    <div>
      <Topbar title="SALES & ONBOARDING" subtitle="Log every call, keep the script evolving, and move clients through onboarding" />
      <SalesCallsClient
        initialCalls={calls}
        initialVersions={allVersions}
        initialCurrentVersion={currentVersion}
        initialPendingProposals={proposals}
        initialStats={stats}
        initialPatterns={patterns}
        pipelineLeads={pipelineLeads}
        engagement={engagement}
        scriptPatterns={(scriptPatterns || []) as PatternTracker[]}
      />
    </div>
  );
}
