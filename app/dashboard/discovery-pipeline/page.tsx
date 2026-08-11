import { createSupabaseClient, fetchAllRows } from "@/lib/supabase";
import { Lead } from "@/lib/types";
import Topbar from "@/components/Topbar";
import DiscoveryPipelineClient from "@/components/discoveryPipeline/DiscoveryPipelineClient";

export const revalidate = 0;

export default async function DiscoveryPipelinePage() {
  const sb = createSupabaseClient();

  const leads = await fetchAllRows<Lead>((from, to) =>
    sb.from("leads").select("*").eq("source", "cold_call").order("date_added", { ascending: false }).range(from, to)
  );

  const awaitingOutcome = leads.filter((l) => l.status === "booked" && !l.post_call_stage);
  const graduated = leads.filter((l) => !!l.post_call_stage);

  return (
    <div>
      <Topbar title="Discovery Pipeline" subtitle="Every lead after the first sales call — proposals, follow-ups and onboarding" />
      <DiscoveryPipelineClient initialAwaitingOutcome={awaitingOutcome} initialGraduated={graduated} />
    </div>
  );
}
