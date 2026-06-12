import { createSupabaseClient } from "@/lib/supabase";
import { notFound } from "next/navigation";
import CallForm from "./CallForm";
import { EmailEvent, Lead } from "@/lib/types";

export const revalidate = 0;

export default async function LeadCallPage({ params }: { params: { id: string } }) {
  const sb = createSupabaseClient();
  const [{ data: lead }, { data: events }] = await Promise.all([
    sb.from("leads").select("*").eq("lead_id", params.id).single(),
    sb.from("email_events").select("*").eq("lead_id", params.id).order("created_at", { ascending: false }),
  ]);
  if (!lead) notFound();
  return <CallForm lead={lead as Lead} events={(events || []) as EmailEvent[]} />;
}
