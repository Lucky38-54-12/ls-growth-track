import { Resend } from "resend";
import { createSupabaseClient } from "@/lib/supabase";
import { bookJobOnClientCalendar } from "./googleCalendar";
import { logAdminAction } from "@/lib/adminActivityLog";

export interface BookAndNotifyInput {
  clientId: string;
  leadName: string;
  leadPhone?: string | null;
  leadEmail?: string | null;
  notes?: string | null;
  startISO: string;
  durationMinutes?: number;
  timeZone?: string;
}

export interface CallbackEmailContent {
  subject: string;
  text: string;
}

// Pure text builder shared by the preview endpoint and the actual send, so
// what Lucky approves is guaranteed to be exactly what goes out — no risk of
// the preview and the real email drifting apart.
export function buildCallbackEmail(clientName: string, leadName: string, leadPhone?: string | null, leadEmail?: string | null, notes?: string | null): CallbackEmailContent {
  const text = [
    `Hey ${clientName.split(" ")[0]},`,
    "",
    "New lead for you:",
    "",
    leadName,
    leadPhone ? `Phone: ${leadPhone}` : null,
    leadEmail ? `Email: ${leadEmail}` : null,
    notes || null,
    "",
    "I've put this straight on your calendar so it doesn't slip through.",
    "",
    "Cheers,",
    "Lucky",
  ].filter((l) => l !== null).join("\n");

  return { subject: `Lead to call back — ${leadName}`, text };
}

export async function getClientForBooking(clientId: string): Promise<{ id: string; name: string; email: string | null }> {
  const sb = createSupabaseClient();
  const { data: client } = await sb.from("lq_clients").select("id, name, email").eq("id", clientId).maybeSingle();
  if (!client) throw new Error("Client not found");
  if (!client.email) throw new Error("This client has no email on file to notify");
  return client;
}

// Books a lead straight onto the client's connected Google Calendar and
// emails them the details — the shared core of both the manual "book a
// callback" form and dragging a pipeline card into the Booked column
// (after the human has approved the preview).
export async function bookAndNotifyClient(input: BookAndNotifyInput): Promise<{ eventId: string; emailedTo: string }> {
  const client = await getClientForBooking(input.clientId);
  const description = [input.leadName, input.leadPhone, input.leadEmail, input.notes].filter(Boolean).join(" — ");

  const booking = await bookJobOnClientCalendar({
    clientId: input.clientId,
    summary: `Callback - ${input.leadName}`,
    description,
    startISO: input.startISO,
    durationMinutes: input.durationMinutes || 30,
    timeZone: input.timeZone || "Pacific/Auckland",
  });

  await logAdminAction({
    action: "Calendar booking",
    target: client.name,
    summary: `Booked "Callback - ${input.leadName}" on their calendar.`,
    details: { eventId: booking.eventId, leadName: input.leadName, leadPhone: input.leadPhone, leadEmail: input.leadEmail, startISO: input.startISO },
  });

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { subject, text } = buildCallbackEmail(client.name, input.leadName, input.leadPhone, input.leadEmail, input.notes);

  const { error: sendError } = await resend.emails.send({
    from: "Lucky from LS Growth <outreach@lsgrowth.agency>",
    to: client.email as string,
    subject,
    text,
  });

  if (!sendError) {
    const sb = createSupabaseClient();
    await sb.from("lq_email_sends").insert({
      client_id: input.clientId,
      lead_id: null,
      step: 0,
      audience: "client",
      to_email: client.email as string,
      subject,
      body: text,
    });
  }

  await logAdminAction({
    action: "Email sent",
    target: client.email as string,
    status: sendError ? "error" : "ok",
    summary: sendError ? sendError.message : `Lead notes for ${input.leadName}.`,
  });
  if (sendError) throw new Error(sendError.message);

  return { eventId: booking.eventId, emailedTo: client.email as string };
}
