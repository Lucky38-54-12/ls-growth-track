import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createSupabaseClient } from "@/lib/supabase";
import { bookJobOnClientCalendar } from "@/lib/leadQual/googleCalendar";
import { logAdminAction } from "@/lib/adminActivityLog";

// Admin-only — gated by the dashboard session cookie via middleware.ts.
// Manual callback booking for a lead that came in outside the normal
// Messenger-qualified flow (e.g. phoned in), so it still lands on the
// client's own connected calendar and the client gets notified by email,
// without anyone having to run a local script.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  const { leadName, leadPhone, leadEmail, notes, startISO, durationMinutes, timeZone } = body;

  if (!leadName || !startISO) {
    return NextResponse.json({ error: "leadName and startISO are required" }, { status: 400 });
  }

  const sb = createSupabaseClient();
  const { data: client } = await sb.from("lq_clients").select("id, name, email").eq("id", id).maybeSingle();
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });
  if (!client.email) return NextResponse.json({ error: "This client has no email on file to notify" }, { status: 400 });

  const description = [leadName, leadPhone, leadEmail, notes].filter(Boolean).join(" — ");

  try {
    const booking = await bookJobOnClientCalendar({
      clientId: id,
      summary: `Callback - ${leadName}`,
      description,
      startISO,
      durationMinutes: durationMinutes || 30,
      timeZone: timeZone || "Pacific/Auckland",
    });

    await logAdminAction({
      action: "Calendar booking",
      target: client.name,
      summary: `Booked "Callback - ${leadName}" on their calendar.`,
      details: { eventId: booking.eventId, leadName, leadPhone, leadEmail, startISO },
    });

    const resend = new Resend(process.env.RESEND_API_KEY);
    const emailText = [
      `Hey ${client.name.split(" ")[0]},`,
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

    const { error: sendError } = await resend.emails.send({
      from: "Lucky from LS Growth <outreach@lsgrowth.agency>",
      to: client.email,
      subject: `Lead to call back — ${leadName}`,
      text: emailText,
    });

    await logAdminAction({
      action: "Email sent",
      target: client.email,
      status: sendError ? "error" : "ok",
      summary: sendError ? sendError.message : `Lead notes for ${leadName}.`,
    });
    if (sendError) throw new Error(sendError.message);

    return NextResponse.json({ eventId: booking.eventId, emailedTo: client.email });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Booking failed" }, { status: 400 });
  }
}
