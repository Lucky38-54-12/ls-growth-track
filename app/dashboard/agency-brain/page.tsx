import { getAgencyBrainSections } from "@/lib/agencyBrain";
import Topbar from "@/components/Topbar";
import AgencyBrainSections from "./AgencyBrainSections";

export const revalidate = 0;

export default async function AgencyBrainPage() {
  const sections = await getAgencyBrainSections();

  return (
    <div style={{ background: "#f1f5f9", minHeight: "100vh" }}>
      <Topbar title="Agency Brain" subtitle="How LS Growth actually operates — every AI-drafted email and follow-up reads this before it writes anything" />
      <div style={{ padding: "20px 28px 60px", maxWidth: 860, margin: "0 auto" }}>
        <AgencyBrainSections sections={sections} />
      </div>
    </div>
  );
}
