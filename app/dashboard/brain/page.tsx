import { createSupabaseClient } from "@/lib/supabase";
import { getPendingChatDrafts } from "@/lib/chatDrafts";
import { cleanNotes } from "@/lib/notes";
import { Lead } from "@/lib/types";
import Topbar from "@/components/Topbar";
import BrainChat from "./BrainChat";

export const revalidate = 0;

// Same information the old "Call Prep" tab's prefilled notes box gave the
// generator, now handed to the Brain as a starting message instead — see
// the "Prep this call" link in components/PipelineBoard.tsx.
function buildPrepPrompt(lead: Lead): string {
  const who = lead.contact_name && lead.contact_name !== "there" ? lead.contact_name : "the contact";
  const where = [lead.trade, lead.location].filter(Boolean).join(" · ");
  const lines = [`Prep me for my upcoming call with ${who} at ${lead.company}${where ? ` (${where})` : ""}.`];
  if (lead.phone) lines.push(`Phone: ${lead.phone}`);
  if (lead.email) lines.push(`Email: ${lead.email}`);
  if (lead.website) lines.push(`Website: ${lead.website}`);
  const noteText = cleanNotes(lead.notes).map((n) => (n.label ? `[${n.label}] ${n.text}` : n.text)).join("\n");
  if (noteText) lines.push("", "Notes on file:", noteText);
  return lines.join("\n");
}

export default async function BrainPage({ searchParams }: { searchParams: { prepLeadId?: string } }) {
  const sb = createSupabaseClient();
  const [initialDrafts, lead] = await Promise.all([
    getPendingChatDrafts(sb),
    searchParams?.prepLeadId
      ? sb.from("leads").select("*").eq("lead_id", searchParams.prepLeadId).maybeSingle().then((r) => r.data as Lead | null)
      : Promise.resolve(null),
  ]);

  return (
    <div style={{ background: "#f1f5f9", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <Topbar title="Brain" subtitle="Ask about the business, get things drafted for your approval" />
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", padding: "20px 28px" }}>
        <BrainChat initialDrafts={initialDrafts} initialInput={lead ? buildPrepPrompt(lead) : undefined} />
      </div>
    </div>
  );
}
