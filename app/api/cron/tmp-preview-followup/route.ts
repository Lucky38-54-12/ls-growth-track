import { NextRequest, NextResponse } from "next/server";
import { sendGmailFollowup } from "@/lib/email";
import { buildMeetingIcs } from "@/lib/ics";
import { Lead } from "@/lib/types";

export const dynamic = "force-dynamic";

// Temporary one-off route to preview the meeting-booked confirmation email
// (with the new real calendar invite attached) in a real inbox. Gated on its
// own TMP_PREVIEW_SECRET env var (not committed anywhere) rather than
// CRON_SECRET, since this route itself is temporary. Delete after use, and
// remove the env var with it.
export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!process.env.TMP_PREVIEW_SECRET || secret !== process.env.TMP_PREVIEW_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const to = req.nextUrl.searchParams.get("to") || "luckyspersonal38@gmail.com";

  const fakeLead: Partial<Lead> = {
    lead_id: "test-preview-lead",
    company: "Test Co",
    contact_name: "Lucky",
    email: to,
    trade: "Builders",
  };

  const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
  start.setMinutes(0, 0, 0);
  const end = new Date(start.getTime() + 30 * 60000);

  const icsInvite = buildMeetingIcs({
    eventId: "test-preview-event",
    startISO: start.toISOString(),
    endISO: end.toISOString(),
    summary: "Meet with Test Co (PREVIEW)",
    location: "https://meet.google.com/test-preview",
    organizerEmail: process.env.GMAIL_USER!,
    attendeeEmail: to,
    attendeeName: "Lucky",
  });

  const subject = "[PREVIEW] Great chatting today, Lucky";
  const bodyHtml = [
    `<p>Hey Lucky,</p>`,
    `<p>This is a preview of the confirmation email that now goes out when a meeting gets booked on a call, with the real Google Calendar invite attached (Yes/No/Maybe card).</p>`,
    `<p>You can join here: <a href="https://meet.google.com/test-preview">https://meet.google.com/test-preview</a></p>`,
    `<p><a href="https://app.lsgrowth.agency/videos/lucky-intro.mp4"><img src="https://app.lsgrowth.agency/videos/lucky-intro-thumb.jpg" alt="A quick message from Lucky — tap to watch" width="320" style="max-width:320px;width:100%;height:auto;border:0;display:block;border-radius:8px;" /></a></p>`,
  ].join("\n");

  await sendGmailFollowup(fakeLead as Lead, subject, bodyHtml, "preview_test", icsInvite);
  return NextResponse.json({ ok: true, sentTo: to });
}
