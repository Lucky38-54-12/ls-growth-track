import { Resend } from "resend";
import { createSupabaseClient } from "@/lib/supabase";
import { logAdminAction } from "@/lib/adminActivityLog";

// This goes to the client's own lead, not to the client — showing up as
// "Lucky from LS Growth" would read as some agency butting in on a call the
// lead booked with the business itself. Sent from our verified domain (so
// it actually delivers) but under the business's name, with replies routed
// to the business's own inbox.
const FROM_DOMAIN = "outreach@lsgrowth.agency";

// Booked calls/visits are only reminded once, in the window 20-40 minutes
// before scheduled_at. Runs on a 15-min cron (see
// /api/cron/lead-qual-callback-reminders), so every booking passes through
// this window on at least one run without needing per-lead scheduling.
const WINDOW_START_MINUTES = 20;
const WINDOW_END_MINUTES = 40;

interface DueLead {
  id: string;
  client_id: string;
  contact_email: string | null;
  scheduled_at: string;
  conversation_id: string | null;
}

// Ray (or whichever client) gets an email when a callback is booked — this
// is the other half: the lead themselves gets a short heads-up shortly
// before the call so it doesn't come out of nowhere.
export async function dispatchDueCallbackReminders(): Promise<{ sent: number; errors: number }> {
  const sb = createSupabaseClient();
  const resend = new Resend(process.env.RESEND_API_KEY);

  const now = Date.now();
  const windowStart = new Date(now + WINDOW_START_MINUTES * 60_000).toISOString();
  const windowEnd = new Date(now + WINDOW_END_MINUTES * 60_000).toISOString();

  const { data: due } = await sb
    .from("lq_leads")
    .select("id, client_id, contact_email, scheduled_at, conversation_id")
    .eq("booking_status", "booked")
    .is("reminder_sent_at", null)
    .not("contact_email", "is", null)
    .gte("scheduled_at", windowStart)
    .lte("scheduled_at", windowEnd);

  let sent = 0;
  let errors = 0;

  for (const lead of (due || []) as DueLead[]) {
    try {
      const [{ data: client }, { data: conversation }] = await Promise.all([
        sb.from("lq_clients").select("name, email, timezone").eq("id", lead.client_id).single(),
        lead.conversation_id
          ? sb.from("lq_conversations").select("extracted_fields").eq("id", lead.conversation_id).single()
          : Promise.resolve({ data: null }),
      ]);
      const fields = (conversation?.extracted_fields as Record<string, unknown>) || {};
      const leadFirstName = typeof fields.name === "string" ? String(fields.name).trim().split(/\s+/)[0] : null;
      const businessName = client?.name || "the team";
      const timezone = client?.timezone || "Pacific/Auckland";

      const callTime = new Date(lead.scheduled_at).toLocaleString("en-NZ", {
        timeZone: timezone, hour: "numeric", minute: "2-digit",
      });

      const subject = `${businessName} will be calling you shortly`;
      const text = [
        `Hi${leadFirstName ? ` ${leadFirstName}` : ""},`,
        "",
        `Just a heads up — ${businessName} will be giving you a call in about half an hour, around ${callTime}.`,
        "",
        "Talk soon,",
        businessName,
      ].join("\n");

      const { error: sendError } = await resend.emails.send({
        from: `"${businessName.replace(/"/g, "")}" <${FROM_DOMAIN}>`,
        to: lead.contact_email as string,
        ...(client?.email ? { replyTo: client.email } : {}),
        subject,
        text,
      });

      if (sendError) throw new Error(sendError.message);

      await sb.from("lq_leads").update({ reminder_sent_at: new Date().toISOString() }).eq("id", lead.id);
      await sb.from("lq_email_sends").insert({
        client_id: lead.client_id,
        lead_id: lead.id,
        step: 0,
        audience: "lead",
        to_email: lead.contact_email as string,
        subject,
        body: text,
      });
      sent++;
    } catch (err) {
      errors++;
      await logAdminAction({
        action: "Email sent",
        target: lead.contact_email || lead.id,
        status: "error",
        summary: err instanceof Error ? err.message : "Callback reminder failed",
      });
    }
  }

  return { sent, errors };
}
