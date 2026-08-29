import { Resend } from "resend";
import { createSupabaseClient } from "@/lib/supabase";
import type { NurtureStep } from "./nurture";

// These go to the client's own lead, not the client — showing up as "Lucky
// from LS Growth" would read as some agency butting in on their enquiry.
// Sent from our verified domain (so it actually delivers) but under the
// business's name, with replies routed to the business's own inbox.
const FROM_DOMAIN = "outreach@lsgrowth.agency";

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] || "");
}

interface DueEnrollment {
  id: string;
  lead_id: string;
  client_id: string;
  sequence_id: string;
  current_step: number;
  contact_email: string;
}

// Runs on a schedule (see /api/cron/lead-qual-nurture) — sends whichever
// step is due for each active enrollment, then advances to the next step or
// marks the sequence completed if there isn't one.
export async function dispatchDueNurtureEmails(): Promise<{ sent: number; errors: number }> {
  const sb = createSupabaseClient();
  const resend = new Resend(process.env.RESEND_API_KEY);

  const { data: due } = await sb
    .from("lq_nurture_enrollments")
    .select("id, lead_id, client_id, sequence_id, current_step, contact_email")
    .eq("status", "active")
    .lte("next_send_at", new Date().toISOString());

  let sent = 0;
  let errors = 0;

  for (const enrollment of (due || []) as DueEnrollment[]) {
    try {
      const [{ data: sequence }, { data: lead }, { data: client }] = await Promise.all([
        sb.from("lq_nurture_sequences").select("steps").eq("id", enrollment.sequence_id).single(),
        sb.from("lq_leads").select("conversation_id").eq("id", enrollment.lead_id).single(),
        sb.from("lq_clients").select("name, email").eq("id", enrollment.client_id).single(),
      ]);
      const steps = (sequence?.steps as NurtureStep[]) || [];
      const step = steps[enrollment.current_step];
      if (!step) {
        await sb.from("lq_nurture_enrollments").update({ status: "completed" }).eq("id", enrollment.id);
        continue;
      }

      const { data: conversation } = await sb
        .from("lq_conversations")
        .select("extracted_fields")
        .eq("id", lead?.conversation_id)
        .single();
      const fields = (conversation?.extracted_fields as Record<string, string>) || {};

      const vars = {
        job_type: fields.job_type || "your job",
        location: fields.location || "your area",
        business_name: client?.name || "the team",
      };

      const subject = renderTemplate(step.subject, vars);
      const body = renderTemplate(step.body_template, vars);

      const businessName = client?.name || "the team";
      const { error: sendError } = await resend.emails.send({
        from: `"${businessName.replace(/"/g, "")}" <${FROM_DOMAIN}>`,
        to: enrollment.contact_email,
        ...(client?.email ? { replyTo: client.email } : {}),
        subject,
        text: body,
      });
      if (sendError) throw new Error(sendError.message);

      await sb.from("lq_email_sends").insert({
        enrollment_id: enrollment.id,
        lead_id: enrollment.lead_id,
        client_id: enrollment.client_id,
        step: enrollment.current_step,
        to_email: enrollment.contact_email,
        subject,
        body,
      });

      const nextStep = enrollment.current_step + 1;
      const next = steps[nextStep];
      if (next) {
        await sb
          .from("lq_nurture_enrollments")
          .update({ current_step: nextStep, next_send_at: new Date(Date.now() + next.delay_hours * 60 * 60 * 1000).toISOString() })
          .eq("id", enrollment.id);
      } else {
        await sb.from("lq_nurture_enrollments").update({ current_step: nextStep, status: "completed" }).eq("id", enrollment.id);
      }
      sent++;
    } catch (err) {
      console.error("nurture email dispatch failed for enrollment", enrollment.id, err);
      errors++;
    }
  }

  return { sent, errors };
}
