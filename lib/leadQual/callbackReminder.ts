import { Resend } from "resend";
import { createSupabaseClient } from "@/lib/supabase";
import { logAdminAction } from "@/lib/adminActivityLog";
import { buildMeetingIcs } from "@/lib/ics";

// This goes to the client's own lead, not to the client — showing up as
// "Lucky from LS Growth" would read as some agency butting in on a call the
// lead booked with the business itself. Sent from our verified domain (so
// it actually delivers) but under the business's name, with replies routed
// to the business's own inbox.
const FROM_DOMAIN = "outreach@lsgrowth.agency";

// Two touches per booking: one at 7pm the evening before (when tradespeople
// are off the tools and actually checking email), one 3 hours before the
// call itself — replaces the old single ~30-min-before reminder, which
// wasn't landing reliably. Runs on the same hourly cron (see
// /api/cron/lead-qual-callback-reminders and cron.yml).
const DAY_BEFORE_HOUR = 19; // 7pm local, the evening before the call
// Cron catch-up (see comment below) used to have no upper bound, so a run
// landing hours late (observed: GitHub Actions gaps of 3-5+ hours) sent the
// "day before" email as late as 11pm — unprofessional to land in a lead's
// inbox at that hour. Past this cutoff, skip the day-before touch entirely
// for that call rather than send it in the middle of the night; the
// same-day reminder still covers it.
const DAY_BEFORE_CUTOFF_HOUR = 21; // 9pm local — stop trying after this
// 3 hours before the call, ±15min padding; the ">=" catch-up logic below
// means an hourly cron still fires this within about an hour of the target,
// it just isn't pinned to a narrow 15-min slot anymore.
const SAME_DAY_LEAD_MINUTES = 180;
const SAME_DAY_WINDOW_MINUTES = 15;

interface DueLead {
  id: string;
  client_id: string;
  contact_email: string | null;
  scheduled_at: string;
  conversation_id: string | null;
  day_before_reminder_sent_at: string | null;
  same_day_reminder_sent_at: string | null;
}

// Ray (or whichever client) gets an email when a callback is booked — this
// is the other half: the lead themselves gets a heads-up the evening before
// and again a couple hours out, so the call doesn't come out of nowhere.
export async function dispatchDueCallbackReminders(): Promise<{ sent: number; errors: number }> {
  const sb = createSupabaseClient();
  const resend = new Resend(process.env.RESEND_API_KEY);

  const { data: due } = await sb
    .from("lq_leads")
    .select("id, client_id, contact_email, scheduled_at, conversation_id, day_before_reminder_sent_at, same_day_reminder_sent_at")
    .eq("booking_status", "booked")
    .not("contact_email", "is", null)
    .gte("scheduled_at", new Date().toISOString())
    .or("day_before_reminder_sent_at.is.null,same_day_reminder_sent_at.is.null");

  let sent = 0;
  let errors = 0;

  for (const lead of (due || []) as DueLead[]) {
    try {
      const { data: client } = await sb
        .from("lq_clients")
        .select("name, contact_name, email, timezone")
        .eq("id", lead.client_id)
        .single();
      const timezone = client?.timezone || "Pacific/Auckland";

      // "Today" and "tomorrow" only mean something relative to the client's
      // own timezone, not the server's — a lead in Auckland booked for 8am
      // needs the day-before email to fire on Auckland's afternoon-before,
      // regardless of what UTC date the cron happens to be running on.
      const dateFmt = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" });
      const hourFmt = new Intl.DateTimeFormat("en-NZ", { timeZone: timezone, hour: "2-digit", hour12: false });

      const now = new Date();
      const scheduled = new Date(lead.scheduled_at);
      const nowDateStr = dateFmt.format(now);
      const nowHour = parseInt(hourFmt.format(now), 10);
      const dayBeforeDateStr = dateFmt.format(new Date(scheduled.getTime() - 24 * 60 * 60 * 1000));
      const minutesUntilCall = (scheduled.getTime() - now.getTime()) / 60_000;

      // ">=" rather than "===" on both checks below: the GitHub Actions cron
      // this runs on is documented to land late (observed gaps of 3-5+
      // hours despite an offset schedule meant to dodge scheduler pileup —
      // see cron.yml), so a run can easily land after its target window
      // instead of inside it. Catching up as soon as a run notices a
      // reminder is overdue beats requiring one to land in a narrow slot
      // and risking a silent miss. The nowDateStr===dayBeforeDateStr guard
      // still stops it firing on the wrong calendar day; the upper bound on
      // isSameDayDue still stops it firing hours early.
      const isDayBeforeDue =
        !lead.day_before_reminder_sent_at &&
        nowDateStr === dayBeforeDateStr &&
        nowHour >= DAY_BEFORE_HOUR &&
        nowHour < DAY_BEFORE_CUTOFF_HOUR;
      const isSameDayDue =
        !lead.same_day_reminder_sent_at &&
        minutesUntilCall <= SAME_DAY_LEAD_MINUTES + SAME_DAY_WINDOW_MINUTES;

      if (!isDayBeforeDue && !isSameDayDue) continue;
      const kind: "day_before" | "same_day" = isDayBeforeDue ? "day_before" : "same_day";

      const { data: conversation } = lead.conversation_id
        ? await sb.from("lq_conversations").select("extracted_fields").eq("id", lead.conversation_id).single()
        : { data: null };
      const fields = (conversation?.extracted_fields as Record<string, unknown>) || {};
      const leadFirstName = typeof fields.name === "string" ? String(fields.name).trim().split(/\s+/)[0] : null;
      const businessName = client?.name || "the team";
      const callerName = client?.contact_name || businessName;
      const signOff = client?.contact_name ? `${client.contact_name} from ${businessName}` : businessName;

      const callTime = scheduled.toLocaleString("en-NZ", { timeZone: timezone, hour: "numeric", minute: "2-digit" });
      const callDay = scheduled.toLocaleDateString("en-NZ", { timeZone: timezone, weekday: "long" });

      const subject =
        kind === "day_before" ? `${signOff} will be calling you tomorrow` : `${signOff} will be calling you shortly`;
      const text = [
        `Hi${leadFirstName ? ` ${leadFirstName}` : ""},`,
        "",
        kind === "day_before"
          ? `Just a heads up, ${callerName} will give you a call tomorrow (${callDay}) around ${callTime}.`
          : `Quick reminder, ${callerName} will give you a call in a couple hours, around ${callTime}.`,
        "",
        "Talk soon,",
        signOff,
      ].join("\n");

      // Attach a real calendar invite for the callback itself — a plain-text
      // reminder is easy to skim past, but Gmail/Outlook render a
      // text/calendar;method=REQUEST attachment as an actual invitation
      // (Yes/No/Maybe, add-to-calendar), much harder to miss. Organizer is
      // the client's own reply-to address where we have one, so it reads as
      // the business inviting the lead, not LS Growth.
      const icsInvite = buildMeetingIcs({
        eventId: lead.id,
        startISO: lead.scheduled_at,
        endISO: new Date(scheduled.getTime() + 30 * 60000).toISOString(),
        summary: `Call with ${businessName}`,
        organizerEmail: client?.email || FROM_DOMAIN,
        organizerName: signOff,
        attendeeEmail: lead.contact_email as string,
        attendeeName: leadFirstName || undefined,
      });

      const { error: sendError } = await resend.emails.send({
        from: `"${signOff.replace(/"/g, "")}" <${FROM_DOMAIN}>`,
        to: lead.contact_email as string,
        ...(client?.email ? { replyTo: client.email } : {}),
        subject,
        text,
        // Resend's API expects attachment content base64-encoded (the SDK
        // does no encoding itself — a raw string here would be sent verbatim
        // and render as garbled attachment content).
        attachments: [{ filename: "invite.ics", content: Buffer.from(icsInvite).toString("base64"), content_type: "text/calendar; charset=utf-8; method=REQUEST" }],
      });

      if (sendError) throw new Error(sendError.message);

      const updateField = kind === "day_before" ? "day_before_reminder_sent_at" : "same_day_reminder_sent_at";
      await sb.from("lq_leads").update({ [updateField]: new Date().toISOString() }).eq("id", lead.id);
      await sb.from("lq_email_sends").insert({
        client_id: lead.client_id,
        lead_id: lead.id,
        step: kind === "day_before" ? 0 : 1,
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
