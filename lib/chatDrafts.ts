import { createSupabaseClient } from "./supabase";

export interface ChatDraft {
  id: string;
  kind: "email" | "note" | "lead_update" | "calendar_booking" | "reschedule_booking" | "sheet_update" | "ad_learning" | "recommendation";
  title: string;
  content: string;
  status: string;
  created_at: string;
  lead: { company: string; lead_id: string } | null;
  payload?: Record<string, unknown> | null;
}

// Shared by /dashboard/brain (drafts created in that chat session) and
// /dashboard/approvals (every pending draft, regardless of which chat it
// came from) — same data, same shape, so both pages render it through the
// same ApprovalQueue component.
export async function getPendingChatDrafts(sb: ReturnType<typeof createSupabaseClient>): Promise<ChatDraft[]> {
  const { data: drafts } = await sb
    .from("chat_drafts")
    .select("id, kind, title, content, status, created_at, lead_id, payload")
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  const leadIds = Array.from(new Set((drafts || []).map((d) => d.lead_id).filter(Boolean))) as string[];
  const leadsById = new Map<string, { company: string; lead_id: string }>();
  if (leadIds.length > 0) {
    const { data: leads } = await sb.from("leads").select("id, company, lead_id").in("id", leadIds);
    for (const l of leads || []) leadsById.set(l.id, { company: l.company, lead_id: l.lead_id });
  }

  return (drafts || []).map((d) => ({
    id: d.id,
    kind: d.kind,
    title: d.title,
    content: d.content,
    status: d.status,
    created_at: d.created_at,
    lead: d.lead_id ? leadsById.get(d.lead_id) || null : null,
    payload: d.payload as Record<string, unknown> | null,
  }));
}
