import { createSupabaseClient, fetchAllRows } from "@/lib/supabase";
import { SalesCall, ScriptVersion, ScriptProposal, PatternTracker, OnboardingNote } from "@/lib/types";
import { computePatterns } from "@/lib/salesCallsStats";
import Topbar from "@/components/Topbar";
import SalesCallsClient from "@/components/salesCalls/SalesCallsClient";

export const revalidate = 0;

export default async function SalesCallsPage() {
  const sb = createSupabaseClient();

  const [calls, { data: versions }, { data: pendingProposals }, { data: scriptPatterns }, { data: onboardingNotes }] = await Promise.all([
    fetchAllRows<SalesCall>((from, to) => sb.from("sales_calls").select("*").order("created_at", { ascending: false }).range(from, to)),
    sb.from("sales_script_versions").select("*").order("version", { ascending: false }),
    sb.from("sales_script_proposals").select("*").eq("status", "pending").order("created_at", { ascending: false }),
    sb.from("sales_pattern_tracker").select("*").order("created_at", { ascending: false }),
    sb.from("onboarding_notes").select("*").order("created_at", { ascending: false }),
  ]);

  const allVersions = (versions || []) as ScriptVersion[];
  const currentVersion = allVersions.find((v) => v.is_current) || allVersions[0] || null;
  const proposals = (pendingProposals || []) as ScriptProposal[];

  const patterns = computePatterns(calls);

  return (
    <div>
      <Topbar title="SALES & ONBOARDING" subtitle="Log every call, keep the script evolving, and manage client agreements" />
      <SalesCallsClient
        initialCalls={calls}
        initialVersions={allVersions}
        initialCurrentVersion={currentVersion}
        initialPendingProposals={proposals}
        initialPatterns={patterns}
        scriptPatterns={(scriptPatterns || []) as PatternTracker[]}
        initialOnboardingNotes={(onboardingNotes || []) as OnboardingNote[]}
      />
    </div>
  );
}
