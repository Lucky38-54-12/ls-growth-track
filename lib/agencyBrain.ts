import { createSupabaseClient } from "./supabase";

export interface AgencyBrainSection {
  key: string;
  title: string;
  content: string;
  sort_order: number;
  updated_at: string;
}

export async function getAgencyBrainSections(): Promise<AgencyBrainSection[]> {
  const sb = createSupabaseClient();
  const { data } = await sb.from("agency_brain").select("*").order("sort_order", { ascending: true });
  return (data || []) as AgencyBrainSection[];
}

// Formats every filled-in section into a single block every AI email/reply
// prompt can be handed, the same way writing-style.md carries Lucky's voice
// rules — this carries what he's actually written about how the agency
// operates, so editing a section here changes future AI-drafted messages
// without touching any prompt code.
export async function getAgencyBrainContext(): Promise<string> {
  const sections = await getAgencyBrainSections();
  const filled = sections.filter(s => s.content.trim());
  if (filled.length === 0) return "";
  return filled.map(s => `### ${s.title}\n${s.content.trim()}`).join("\n\n");
}
