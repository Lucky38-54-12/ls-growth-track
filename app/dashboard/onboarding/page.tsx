import { createSupabaseClient } from "@/lib/supabase";
import Topbar from "@/components/Topbar";
import OnboardingWorkspace from "./OnboardingWorkspace";

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


export default async function OnboardingPage() {
  const sb = createSupabaseClient();
  const { data: clients } = await sb
    .from("onboarding_clients")
    .select("id, name, company, email, completed_steps, created_at")
    .order("created_at", { ascending: false });

  return (
    <div style={{ background: "#f1f5f9", minHeight: "100vh" }}>
      <Topbar title="CLIENT ONBOARDING" subtitle="Paste your Read.ai notes, send a recap, generate a proposal" />
      <OnboardingWorkspace clients={clients || []} />
    </div>
  );
}
