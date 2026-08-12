import { createSupabaseClient } from "@/lib/supabase";
import Topbar from "@/components/Topbar";
import BrainChat from "./BrainChat";

export const revalidate = 0;

export interface ChatDraft {
  id: string;
  kind: "email" | "note" | "lead_update";
  title: string;
  content: string;
  status: string;
  created_at: string;
  lead: { company: string; lead_id: string } | null;
}

export default async function BrainPage() {
  const sb = createSupabaseClient();
  const { data: drafts } = await sb
    .from("chat_drafts")
    .select("id, kind, title, content, status, created_at, lead_id")
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  const leadIds = Array.from(new Set((drafts || []).map((d) => d.lead_id).filter(Boolean))) as string[];
  const leadsById = new Map<string, { company: string; lead_id: string }>();
  if (leadIds.length > 0) {
    const { data: leads } = await sb.from("leads").select("id, company, lead_id").in("id", leadIds);
    for (const l of leads || []) leadsById.set(l.id, { company: l.company, lead_id: l.lead_id });
  }

  const initialDrafts: ChatDraft[] = (drafts || []).map((d) => ({
    id: d.id,
    kind: d.kind,
    title: d.title,
    content: d.content,
    status: d.status,
    created_at: d.created_at,
    lead: d.lead_id ? leadsById.get(d.lead_id) || null : null,
  }));

  return (
    <div style={{ background: "#f1f5f9", minHeight: "100vh" }}>
      <Topbar title="Brain" subtitle="Ask about the business, get things drafted for your approval" />
      <div style={{ padding: "20px 28px 60px", maxWidth: 900, margin: "0 auto" }}>
        <BrainChat initialDrafts={initialDrafts} />
      </div>
    </div>
  );
}
