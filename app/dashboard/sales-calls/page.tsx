import { createSupabaseClient, fetchAllRows } from "@/lib/supabase";
import { SalesCall, ScriptVersion, ScriptProposal, PatternTracker } from "@/lib/types";
import { computePatterns } from "@/lib/salesCallsStats";
import Topbar from "@/components/Topbar";
import SalesCallsClient from "@/components/salesCalls/SalesCallsClient";

export const revalidate = 0;

export default async function SalesCallsPage() {
  const sb = createSupabaseClient();

  const [calls, { data: versions }, { data: pendingProposals }, { data: scriptPatterns }, { data: onboardingRows }] = await Promise.all([
    fetchAllRows<SalesCall>((from, to) => sb.from("sales_calls").select("*").order("created_at", { ascending: false }).range(from, to)),
    sb.from("sales_script_versions").select("*").order("version", { ascending: false }),
    sb.from("sales_script_proposals").select("*").eq("status", "pending").order("created_at", { ascending: false }),
    sb.from("sales_pattern_tracker").select("*").order("created_at", { ascending: false }),
    sb.from("onboarding_clients").select("id, sales_call_id, onboarding_call_completed_at").not("sales_call_id", "is", null),
  ]);

  const allVersions = (versions || []) as ScriptVersion[];
  const currentVersion = allVersions.find((v) => v.is_current) || allVersions[0] || null;
  const proposals = (pendingProposals || []) as ScriptProposal[];

  const patterns = computePatterns(calls);

  // Maps a closed sales call straight to its onboarding client record, so
  // the call list can point at "next: book the onboarding call" instead of
  // Lucky having to separately remember to go find the client under
  // Onboarding — same client record, same call.id as the bridge.
  const onboardingBySalesCallId: Record<string, { id: string; done: boolean }> = {};
  for (const row of onboardingRows || []) {
    if (!row.sales_call_id) continue;
    onboardingBySalesCallId[row.sales_call_id] = { id: row.id, done: Boolean(row.onboarding_call_completed_at) };
  }

  return (
    <div>
      <Topbar title="SALES" subtitle="What's logged, what the script looks like, what's recurring" />
      <SalesCallsClient
        initialCalls={calls}
        initialVersions={allVersions}
        initialCurrentVersion={currentVersion}
        initialPendingProposals={proposals}
        initialPatterns={patterns}
        scriptPatterns={(scriptPatterns || []) as PatternTracker[]}
        onboardingBySalesCallId={onboardingBySalesCallId}
      />
    </div>
  );
}
