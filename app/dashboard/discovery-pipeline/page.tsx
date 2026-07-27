import { createSupabaseClient, fetchAllRows } from "@/lib/supabase";
import { Lead, SalesCall } from "@/lib/types";
import { computeStats } from "@/lib/salesCallsStats";
import Topbar from "@/components/Topbar";
import DiscoveryPipelineClient from "@/components/discoveryPipeline/DiscoveryPipelineClient";

export const revalidate = 0;

export default async function DiscoveryPipelinePage() {
  const sb = createSupabaseClient();

  const [leads, calls] = await Promise.all([
    fetchAllRows<Lead>((from, to) => sb.from("leads").select("*").eq("source", "cold_call").order("date_added", { ascending: false }).range(from, to)),
    fetchAllRows<SalesCall>((from, to) => sb.from("sales_calls").select("*").order("created_at", { ascending: false }).range(from, to)),
  ]);

  const awaitingOutcome = leads.filter((l) => l.status === "booked" && !l.post_call_stage);
  const graduated = leads.filter((l) => !!l.post_call_stage);
  const stats = computeStats(calls);

  return (
    <div>
      <Topbar title="Discovery Pipeline" subtitle="Every lead after the first sales call — proposals, follow-ups and onboarding" />
      <DiscoveryPipelineClient initialAwaitingOutcome={awaitingOutcome} initialGraduated={graduated} stats={stats} />
    </div>
  );
}
