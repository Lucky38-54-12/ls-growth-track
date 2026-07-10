import Topbar from "@/components/Topbar";
import OnboardingWorkspace from "./OnboardingWorkspace";
import PipelineBoard from "@/components/PipelineBoard";
import { createSupabaseClient, fetchAllRows } from "@/lib/supabase";
import { Lead, EmailEvent, EngagementSummary } from "@/lib/types";

export const revalidate = 0;

export const ONBOARDING_STEPS = [
  { key: "contract_signed",    label: "Contract signed" },
  { key: "kickoff_booked",     label: "Kick-off call booked" },
  { key: "kickoff_done",       label: "Kick-off call completed" },
  { key: "slack_invited",      label: "Added to Slack" },
  { key: "icp_documented",     label: "ICP / target market locked in" },
  { key: "email_setup",        label: "Email account set up & warming" },
  { key: "lead_list_approved", label: "Lead list approved" },
  { key: "templates_approved", label: "Email templates approved" },
  { key: "campaign_launched",  label: "First campaign launched" },
  { key: "first_review",       label: "First results review scheduled" },
];

// Mirrors the discovery-to-launch journey — a lead lands here once a
// discovery call is booked and rides this board until they're live.
const ONBOARDING_PIPELINE_COLUMNS = [
  { key: "meeting_booked",    label: "Discovery Booked" },
  { key: "discovery_done",    label: "Discovery Done" },
  { key: "proposal_sent",     label: "Proposal Sent" },
  { key: "thinking_about_it", label: "Thinking" },
  { key: "onboarding",        label: "Onboarding" },
  { key: "ready_to_launch",   label: "Ready to Launch" },
];
const ONBOARDING_PIPELINE_STATUSES = new Set(ONBOARDING_PIPELINE_COLUMNS.map(c => c.key));

export default async function OnboardingPage() {
  const sb = createSupabaseClient();
  const [allLeads, { data: events }] = await Promise.all([
    fetchAllRows<Lead>((from, to) => sb.from("leads").select("*").order("date_added", { ascending: false }).range(from, to)),
    sb.from("email_events").select("*").order("created_at", { ascending: false }),
  ]);

  const pipelineLeads = allLeads.filter(l => ONBOARDING_PIPELINE_STATUSES.has(l.status));

  const engagement: Record<string, EngagementSummary> = {};
  for (const ev of (events || []) as EmailEvent[]) {
    if (!engagement[ev.lead_id]) engagement[ev.lead_id] = { opens: 0, clicks: 0, last_event_at: null };
    if (ev.event_type === "open") engagement[ev.lead_id].opens++;
    if (ev.event_type === "click") engagement[ev.lead_id].clicks++;
    if (!engagement[ev.lead_id].last_event_at) engagement[ev.lead_id].last_event_at = ev.created_at;
  }

  return (
    <div style={{ background: "#f1f5f9", minHeight: "100vh" }}>
      <Topbar title="CLIENT ONBOARDING" subtitle="Paste your Read.ai notes, send a recap, generate a proposal" />

      <div style={{ padding: "20px 28px 0" }}>
        <PipelineBoard
          sections={[{ key: "onboarding", label: `${pipelineLeads.length} in pipeline`, leads: pipelineLeads }]}
          columns={ONBOARDING_PIPELINE_COLUMNS}
          engagement={engagement}
          activeSource="onboarding"
        />
      </div>

      <OnboardingWorkspace />
    </div>
  );
}
