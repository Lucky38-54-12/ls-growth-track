import { getAgencyBrainSections } from "@/lib/agencyBrain";
import { createSupabaseClient } from "@/lib/supabase";
import { getRecentLearnings } from "@/lib/brainLearnings";
import Topbar from "@/components/Topbar";
import AgencyBrainSections from "./AgencyBrainSections";
import LearnedInsights from "./LearnedInsights";

export const revalidate = 0;

export default async function AgencyBrainPage() {
  const sb = createSupabaseClient();
  const [sections, learnings] = await Promise.all([
    getAgencyBrainSections(),
    getRecentLearnings(sb, 100),
  ]);

  return (
    <div style={{ background: "#f1f5f9", minHeight: "100vh" }}>
      <Topbar title="Agency Brain" subtitle="How LS Growth actually operates — every AI-drafted email and follow-up reads this before it writes anything" />
      <div style={{ padding: "20px 28px 60px", maxWidth: 860, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        <AgencyBrainSections sections={sections} />
        <LearnedInsights initialLearnings={learnings} />
      </div>
    </div>
  );
}
