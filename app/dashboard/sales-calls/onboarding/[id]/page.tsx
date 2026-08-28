import { createSupabaseClient } from "@/lib/supabase";
import { notFound } from "next/navigation";
import Topbar from "@/components/Topbar";
import { ONBOARDING_STEPS } from "@/lib/onboardingSteps";
import OnboardingChecklist from "@/components/salesCalls/OnboardingChecklist";
import { SalesCall, OnboardingClient } from "@/lib/types";
import ClientCallPanel from "@/components/salesCalls/ClientCallPanel";
import KickoffEmailCard from "@/components/salesCalls/KickoffEmailCard";

export const revalidate = 0;

export default async function OnboardingDetailPage({ params }: { params: { id: string } }) {
  const sb = createSupabaseClient();
  const { data: client, error } = await sb
    .from("onboarding_clients")
    .select("*")
    .eq("id", params.id)
    .single();

  if (error || !client) notFound();

  const { data: call } = client.sales_call_id
    ? await sb.from("sales_calls").select("*").eq("id", client.sales_call_id).single()
    : { data: null };

  return (
    <div style={{ background: "#f1f5f9", minHeight: "100vh" }}>
      <Topbar title={client.company} subtitle={`Onboarding · ${client.name}`} />
      <div style={{ padding: "24px 28px 60px", maxWidth: 680 }}>
        {call && (
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", padding: "16px 18px", marginBottom: 20 }}>
            <ClientCallPanel call={call as SalesCall} />
          </div>
        )}
        <KickoffEmailCard client={client as OnboardingClient} />
        <OnboardingChecklist client={client} steps={ONBOARDING_STEPS} />
      </div>
    </div>
  );
}
