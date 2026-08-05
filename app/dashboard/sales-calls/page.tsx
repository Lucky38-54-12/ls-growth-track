import { createSupabaseClient, fetchAllRows } from "@/lib/supabase";
import { Lead, SalesCall, ScriptVersion, ScriptProposal, PatternTracker } from "@/lib/types";
import { computePatterns } from "@/lib/salesCallsStats";
import { cleanNotes } from "@/lib/notes";
import Topbar from "@/components/Topbar";
import SalesCallsClient from "@/components/salesCalls/SalesCallsClient";

export const revalidate = 0;

function buildPrepNotes(lead: Lead): string {
  const lines: string[] = [];
  const who = lead.contact_name && lead.contact_name !== "there" ? lead.contact_name : "Contact";
  const where = [lead.trade, lead.location].filter(Boolean).join(" · ");
  lines.push(`${who} — ${lead.company}${where ? ` (${where})` : ""}`);
  if (lead.phone) lines.push(`Phone: ${lead.phone}`);
  if (lead.email) lines.push(`Email: ${lead.email}`);
  if (lead.website) lines.push(`Website: ${lead.website}`);
  const noteText = cleanNotes(lead.notes).map((n) => (n.label ? `[${n.label}] ${n.text}` : n.text)).join("\n");
  if (noteText) lines.push("", "Notes:", noteText);
  return lines.join("\n");
}

export default async function SalesCallsPage({
  searchParams,
}: {
  searchParams: { leadId?: string };
}) {
  const sb = createSupabaseClient();

  const [calls, { data: versions }, { data: pendingProposals }, { data: scriptPatterns }, prepLead] = await Promise.all([
    fetchAllRows<SalesCall>((from, to) => sb.from("sales_calls").select("*").order("created_at", { ascending: false }).range(from, to)),
    sb.from("sales_script_versions").select("*").order("version", { ascending: false }),
    sb.from("sales_script_proposals").select("*").eq("status", "pending").order("created_at", { ascending: false }),
    sb.from("sales_pattern_tracker").select("*").order("created_at", { ascending: false }),
    searchParams?.leadId
      ? sb.from("leads").select("*").eq("lead_id", searchParams.leadId).maybeSingle().then((r) => r.data as Lead | null)
      : Promise.resolve(null),
  ]);

  const allVersions = (versions || []) as ScriptVersion[];
  const currentVersion = allVersions.find((v) => v.is_current) || allVersions[0] || null;
  const proposals = (pendingProposals || []) as ScriptProposal[];

  const patterns = computePatterns(calls);

  return (
    <div>
      <Topbar title="SALES" subtitle="Log every call and keep the script evolving" />
      <SalesCallsClient
        initialCalls={calls}
        initialVersions={allVersions}
        initialCurrentVersion={currentVersion}
        initialPendingProposals={proposals}
        initialPatterns={patterns}
        scriptPatterns={(scriptPatterns || []) as PatternTracker[]}
        initialTab={prepLead ? "prep" : undefined}
        initialPrepNotes={prepLead ? buildPrepNotes(prepLead) : undefined}
      />
    </div>
  );
}
