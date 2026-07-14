import { createSupabaseClient } from "@/lib/supabase";
import { notFound } from "next/navigation";
import Topbar from "@/components/Topbar";
import { ONBOARDING_STEPS } from "@/lib/onboardingSteps";
import OnboardingChecklist from "@/components/salesCalls/OnboardingChecklist";

export const revalidate = 0;

export default async function OnboardingDetailPage({ params }: { params: { id: string } }) {
  const sb = createSupabaseClient();
  const { data: client, error } = await sb
    .from("onboarding_clients")
    .select("*")
    .eq("id", params.id)
    .single();

  if (error || !client) notFound();

  return (
    <div style={{ background: "#f1f5f9", minHeight: "100vh" }}>
      <Topbar title={client.company} subtitle={`Onboarding · ${client.name}`} />
      <div style={{ padding: "24px 28px 60px", maxWidth: 680 }}>
        <OnboardingChecklist client={client} steps={ONBOARDING_STEPS} />
      </div>
    </div>
  );
}
