import { createSupabaseClient } from "@/lib/supabase";
import { OnboardingClient, SalesCall } from "@/lib/types";
import Topbar from "@/components/Topbar";
import OnboardingTabs from "@/components/onboarding/OnboardingTabs";

export const revalidate = 0;

export default async function OnboardingOverviewPage() {
  const sb = createSupabaseClient();

  const [{ data: clients }, { data: calls }] = await Promise.all([
    sb.from("onboarding_clients").select("*").order("created_at", { ascending: false }),
    sb.from("sales_calls").select("*"),
  ]);

  const allClients = (clients || []) as OnboardingClient[];
  const callsById: Record<string, SalesCall> = {};
  for (const c of (calls || []) as SalesCall[]) callsById[c.id] = c;

  return (
    <div>
      <Topbar title="ONBOARDING" subtitle="Every client's journey from call to fully onboarded, in one place" />
      <div style={{ height: 20 }} />
      <OnboardingTabs clients={allClients} callsById={callsById} />
    </div>
  );
}
