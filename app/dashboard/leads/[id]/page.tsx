import { createSupabaseClient } from "@/lib/supabase";
import { notFound } from "next/navigation";
import CallForm from "./CallForm";
import { Lead } from "@/lib/types";

export const revalidate = 0;

export default async function LeadCallPage({ params }: { params: { id: string } }) {
  const sb = createSupabaseClient();
  const { data: lead } = await sb.from("leads").select("*").eq("lead_id", params.id).single();
  if (!lead) notFound();
  return <CallForm lead={lead as Lead} />;
}
