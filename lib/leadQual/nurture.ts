import { createSupabaseClient } from "@/lib/supabase";

export interface NurtureStep {
  delay_hours: number;
  subject: string;
  body_template: string;
}

// A sensible starting sequence, editable per client afterward — avoids
// silently doing nothing for the first client with no sequence configured.
export function defaultNurtureSteps(): NurtureStep[] {
  return [
    {
      delay_hours: 1,
      subject: "Still thinking about your {{job_type}}?",
      body_template:
        "Hey,\n\nThanks for reaching out about your {{job_type}} in {{location}}. No pressure at all — just wanted to check in in case you had any questions.\n\nHappy to help whenever you're ready.\n\n{{business_name}}",
    },
    {
      delay_hours: 72,
      subject: "Following up on your {{job_type}}",
      body_template:
        "Hey,\n\nJust following up on the {{job_type}} in {{location}} — still keen to help out whenever the timing's right for you.\n\nLet us know if you'd like a quote.\n\n{{business_name}}",
    },
    {
      delay_hours: 168,
      subject: "Last check-in about your {{job_type}}",
      body_template:
        "Hey,\n\nLast note from us on this one — if you still need {{job_type}} sorted in {{location}}, just reply and we'll get it booked in.\n\n{{business_name}}",
    },
  ];
}

async function getOrCreateDefaultSequence(clientId: string): Promise<string> {
  const sb = createSupabaseClient();
  const { data: existing } = await sb
    .from("lq_nurture_sequences")
    .select("id")
    .eq("client_id", clientId)
    .eq("active", true)
    .limit(1)
    .maybeSingle();
  if (existing) return existing.id;

  const { data: created, error } = await sb
    .from("lq_nurture_sequences")
    .insert({ client_id: clientId, name: "Default nurture sequence", active: true, steps: defaultNurtureSteps() })
    .select()
    .single();
  if (error) throw error;
  return created.id;
}

export async function enrollInNurture(leadId: string, clientId: string, contactEmail: string): Promise<void> {
  const sequenceId = await getOrCreateDefaultSequence(clientId);
  const sb = createSupabaseClient();
  const { data: sequence } = await sb.from("lq_nurture_sequences").select("steps").eq("id", sequenceId).single();
  const steps = (sequence?.steps as NurtureStep[]) || defaultNurtureSteps();
  const firstDelayHours = steps[0]?.delay_hours ?? 1;

  const { error } = await sb.from("lq_nurture_enrollments").insert({
    lead_id: leadId,
    client_id: clientId,
    sequence_id: sequenceId,
    current_step: 0,
    status: "active",
    contact_email: contactEmail,
    next_send_at: new Date(Date.now() + firstDelayHours * 60 * 60 * 1000).toISOString(),
  });
  if (error) throw error;
}

// A lead that books gets pulled out of the sequence immediately — called
// from wherever a booking gets confirmed for a previously-nurtured lead.
export async function stopNurtureForLead(leadId: string): Promise<void> {
  const sb = createSupabaseClient();
  await sb.from("lq_nurture_enrollments").update({ status: "booked" }).eq("lead_id", leadId).eq("status", "active");
}
