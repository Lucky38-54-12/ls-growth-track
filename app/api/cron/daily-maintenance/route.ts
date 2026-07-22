import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient } from "@/lib/supabase";
import { checkForReplies } from "@/lib/campaignReplies";
import { syncAllTrackedSheets } from "@/lib/sheetSync";
import { getHealthSnapshot } from "@/lib/leads";
import { syncCalendarBookings } from "@/lib/calendarSync";
import { generateEmailLearnings } from "@/lib/emailLearning";
import { dispatchDueNurtureEmails } from "@/lib/leadQual/nurtureEmail";
import { escalateStaleReplies } from "@/lib/staleReplies";
import { sendDueProposalFollowups } from "@/lib/proposalFollowup";
import { sendWeeklyDigestIfDue } from "@/lib/weeklyDigest";
import { checkMessengerChannelHealth } from "@/lib/leadQual/meta";
import { notifySlack } from "@/lib/slackNotify";

export const dynamic = "force-dynamic";

// Vercel's free plan caps projects at 2 cron jobs, both already spoken for
// (this one and the daily-send /api/cron), so check-replies/sheet-sync/health
// were previously only run by an external routine hitting the bearer-protected
// GET routes over HTTPS — but that routine's sandbox can lose outbound network
// access for hours with no way to fix it from here, silently stalling the
// whole pipeline (replies never marked, sheets never synced). Running all of
// this natively inside Vercel's own cron removes that external hop entirely:
// Vercel calling its own deployed route never leaves Vercel's network.
// calendar-sync is folded in here too (rather than kept as its own cron slot)
// purely to stay within the 2-job cap — it was never part of the egress
// problem, this is just where the spare slot went.
export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = createSupabaseClient();
  const results: Record<string, unknown> = {};

  try {
    results.replies = await checkForReplies();
  } catch (e) {
    results.replies = { error: e instanceof Error ? e.message : "check-replies failed" };
  }

  try {
    results.sheetSync = await syncAllTrackedSheets(sb);
  } catch (e) {
    results.sheetSync = { error: e instanceof Error ? e.message : "sheet-sync failed" };
  }

  try {
    results.calendarSync = await syncCalendarBookings();
  } catch (e) {
    results.calendarSync = { error: e instanceof Error ? e.message : "calendar-sync failed" };
  }

  try {
    results.health = await getHealthSnapshot(sb);
  } catch (e) {
    results.health = { error: e instanceof Error ? e.message : "health check failed" };
  }

  try {
    results.emailLearnings = await generateEmailLearnings(sb);
  } catch (e) {
    results.emailLearnings = { error: e instanceof Error ? e.message : "email learning failed" };
  }

  try {
    results.leadQualNurture = await dispatchDueNurtureEmails();
  } catch (e) {
    results.leadQualNurture = { error: e instanceof Error ? e.message : "lead-qual nurture dispatch failed" };
  }

  try {
    results.staleReplies = await escalateStaleReplies();
  } catch (e) {
    results.staleReplies = { error: e instanceof Error ? e.message : "stale reply escalation failed" };
  }

  try {
    results.proposalFollowups = await sendDueProposalFollowups();
  } catch (e) {
    results.proposalFollowups = { error: e instanceof Error ? e.message : "proposal follow-up dispatch failed" };
  }

  try {
    results.weeklyDigest = await sendWeeklyDigestIfDue(sb);
  } catch (e) {
    results.weeklyDigest = { error: e instanceof Error ? e.message : "weekly digest failed" };
  }

  try {
    const deadChannels = await checkMessengerChannelHealth();
    results.messengerHealth = { deadChannels };
    if (deadChannels.length > 0) {
      await notifySlack(
        `🔴 Lead-qual Messenger connection dead for ${deadChannels.length} client(s) — leads are not getting replies right now:\n` +
        deadChannels.map((d) => `• *${d.clientName}* (page ${d.pageId}): ${d.reason}`).join("\n") +
        `\nReconnect from /dashboard/lead-qual.`
      );
    }
  } catch (e) {
    results.messengerHealth = { error: e instanceof Error ? e.message : "messenger health check failed" };
  }

  return NextResponse.json(results);
}
