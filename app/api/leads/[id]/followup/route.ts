import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
import { createSupabaseClient } from "@/lib/supabase";
import { sendGmailFollowup } from "@/lib/email";
import { createBooking, fillMeetingLink } from "@/lib/calendar";
import { Lead } from "@/lib/types";
import { generateCallFollowupEmail } from "@/lib/generateCallEmail";
import { statusTimestampUpdates } from "@/lib/leads";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const { callNotes, subject, bodyHtml, status, meetingDateTime, followUpAt } = body as {
    callNotes?: string;
    subject?: string;
    bodyHtml?: string;
    status?: string;
    meetingDateTime?: string;
    followUpAt?: string;
  };

  const sb = createSupabaseClient();
  const { data: lead, error } = await sb.from("leads").select("*").eq("lead_id", params.id).single();
  if (error || !lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  const today = new Date().toISOString().split("T")[0];
  const updates: Record<string, unknown> = {};

  if (callNotes?.trim()) {
    const entry = `[${today} call] ${callNotes.trim()}`;
    updates.notes = lead.notes?.trim() ? `${lead.notes}\n${entry}` : entry;
  }

  let meetingLink = "";
  let meetingBooked = false;
  let meetingError: string | null = null;
  if (meetingDateTime) {
    try {
      const contactName = lead.contact_name && lead.contact_name !== "there" ? lead.contact_name : "";
      const booking = await createBooking({
        summary: `Meet with ${contactName || lead.company}`,
        attendeeEmail: lead.email,
        attendeeName: contactName || undefined,
        startISO: meetingDateTime,
      });
      meetingLink = booking.hangoutLink;
      meetingBooked = true;
    } catch (e) {
      meetingError = e instanceof Error ? e.message : "Calendar booking failed";
    }
  }

  let sent = false;
  let sendError: string | null = null;

  // Auto-generate email from call notes if no manual email was provided
  let resolvedSubject = subject?.trim() || "";
  let resolvedBody = bodyHtml?.trim() || "";
  if (!resolvedSubject && callNotes?.trim() && lead.email) {
    const generated = await generateCallFollowupEmail(lead as Lead, callNotes);
    if (generated) {
      resolvedSubject = generated.subject;
      resolvedBody = generated.bodyHtml;
    }
  }

  // Builder-trade leads get a "hey it's Lucky" video intro dropped into the
  // post-call follow-up — matches the messy free-text trade values seen on
  // cold-call leads (e.g. "builder", "Builders", "home builder / renovation",
  // "construction / renovations"), not just an exact "Builders" match.
  // Off by default (VIDEO_FOLLOWUP_ENABLED unset) — Lucky wants to review the
  // surrounding email copy before this can fire on a real call unreviewed.
  const isBuilderTrade = process.env.VIDEO_FOLLOWUP_ENABLED === "true" && /build|renovat|construction/i.test(lead.trade || "");

  if (resolvedSubject && resolvedBody) {
    try {
      let finalBody = fillMeetingLink(resolvedBody, meetingLink);
      if (isBuilderTrade) {
        const base = process.env.APP_URL || "https://app.lsgrowth.agency";
        const videoUrl = `${base}/videos/lucky-intro.mp4`;
        const thumbUrl = `${base}/videos/lucky-intro-thumb.jpg`;
        // Email clients don't render <video> inline (Gmail/Outlook strip it),
        // so this is a thumbnail with a play button baked in that links out
        // to the real file — same pattern every video-email tool (Loom,
        // BombBomb) actually uses under the hood.
        finalBody += `<p><a href="${videoUrl}"><img src="${thumbUrl}" alt="A quick message from Lucky — tap to watch" width="320" style="max-width:320px;width:100%;height:auto;border:0;display:block;border-radius:8px;" /></a></p>`;
      }
      await sendGmailFollowup(lead as Lead, resolvedSubject, finalBody);
      sent = true;
      updates.last_followup = today;
      updates.followup_count = (lead.followup_count || 0) + 1;
    } catch (e) {
      sendError = e instanceof Error ? e.message : "Send failed";
    }
  }

  const isColdCall = lead.source === "cold_call";

  if (meetingBooked) {
    updates.status = isColdCall ? "meeting_booked" : "booked";
    if (!lead.date_contacted) updates.date_contacted = today;
  } else if (isColdCall && lead.status === "called" && sent) {
    updates.status = "emailed";
    updates.date_contacted = today;
  } else if (!isColdCall && lead.status === "not_contacted" && sent) {
    updates.status = "contacted";
    updates.date_contacted = today;
  }

  if (status && status !== lead.status) {
    updates.status = status;
  }

  if (followUpAt !== undefined) {
    updates.follow_up_at = followUpAt || null;
  }

  if (typeof updates.status === "string") Object.assign(updates, statusTimestampUpdates(updates.status));

  if (Object.keys(updates).length) {
    await sb.from("leads").update(updates).eq("lead_id", params.id);
  }

  return NextResponse.json({ sent, sendError, meetingBooked, meetingLink, meetingError });
}
