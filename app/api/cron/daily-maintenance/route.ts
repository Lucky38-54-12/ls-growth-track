import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClientAsync } from "@/lib/supabase";
import { checkForReplies } from "@/lib/campaignReplies";
import { syncAllTrackedSheets } from "@/lib/sheetSync";
import { getHealthSnapshot } from "@/lib/leads";
import { syncCalendarBookings } from "@/lib/calendarSync";
import { generateEmailLearnings } from "@/lib/emailLearning";
import { dispatchDueNurtureEmails } from "@/lib/leadQual/nurtureEmail";
import { escalateStaleReplies } from "@/lib/staleReplies";
import { sendDueProposalFollowups } from "@/lib/proposalFollowup";
import { sendColdCallNudges } from "@/lib/coldCallNudges";
import { sendDueNoShowFollowups } from "@/lib/noShowSequence";
import { sendWeeklyDigestIfDue } from "@/lib/weeklyDigest";
import { sendWeeklyCheckinIfDue } from "@/lib/weeklyCheckin";
import { sendLowQueueNudge } from "@/lib/callQueueNudge";
import { checkMessengerChannelHealth, reconcileHumanTakeovers, resubscribeAllMessengerChannels, discoverNewFacebookPages } from "@/lib/leadQual/meta";
import { checkOnboardingPhotoUploads } from "@/lib/onboardingPhotoCheck";
import { notifySlack } from "@/lib/slackNotify";
import { reportAutomationStatus } from "@/lib/automationStatus";
import { checkCampaignCompletions } from "@/lib/campaignCompletion";
import { checkCreativeDemand } from "@/lib/creativeDemandCheck";
import { checkLaunchedComboPerformance } from "@/lib/adLaunchTracking";
import { runAdsEngineAutopilot, autoLaunchReadyCombos } from "@/lib/adsEngineAutopilot";
import { checkLeadConversionTrend } from "@/lib/leadConversionCheck";
import { sendWeeklySystemsHealthIfDue } from "@/lib/systemsHealthDigest";
import { sendMidMonthCheckinPrepIfDue, sendEndOfMonthResultsPrepIfDue } from "@/lib/clientCatchupPrep";
import { sendPaymentRemindersIfDue } from "@/lib/paymentReminders";
import { generateInvoicesIfDue } from "@/lib/invoiceAutomation";

export const dynamic = "force-dynamic";
// ~26 sequential sub-jobs now run here, each awaited in order — real
// production logs show this has already hit a 300s timeout at least once
// (2026-11-10), which silently skips every sub-job still queued after the
// one that was running when the clock ran out (payment reminders/invoicing
// sit near the end of the list, so they're the most likely casualty). This
// doesn't raise the actual ceiling beyond the account's plan limit, but
// documents the real constraint explicitly rather than leaving it implicit.
export const maxDuration = 300;

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

  const sb = await createSupabaseClientAsync();

  // The GitHub Actions trigger window is intentionally wide (see cron.yml)
  // to survive scheduling jitter, so this is what actually stops a second
  // run landing inside that window from re-running the AI-generation steps
  // below (email learning, nurture emails) a second time same day — those
  // aren't behind COLD_OUTREACH_PAUSED and re-running them was flagged
  // before as a real spend driver.
  const todayNZT = new Intl.DateTimeFormat("en-CA", { timeZone: "Pacific/Auckland", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const { data: maintenanceRow } = await sb.from("automations").select("last_run_at").eq("slug", "daily-maintenance").maybeSingle();
  if (maintenanceRow?.last_run_at) {
    const lastRunNZT = new Intl.DateTimeFormat("en-CA", { timeZone: "Pacific/Auckland", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(maintenanceRow.last_run_at));
    if (lastRunNZT === todayNZT) {
      return NextResponse.json({ skipped: true, reason: "already ran today (NZT)" });
    }
  }

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
    results.coldCallNudges = await sendColdCallNudges();
  } catch (e) {
    results.coldCallNudges = { error: e instanceof Error ? e.message : "cold-call nudge dispatch failed" };
  }

  try {
    results.noShowFollowups = await sendDueNoShowFollowups();
  } catch (e) {
    results.noShowFollowups = { error: e instanceof Error ? e.message : "no-show follow-up dispatch failed" };
  }

  try {
    results.creativeDemandCheck = await checkCreativeDemand();
  } catch (e) {
    results.creativeDemandCheck = { error: e instanceof Error ? e.message : "creative demand check failed" };
  }

  try {
    results.adLaunchTracking = await checkLaunchedComboPerformance();
  } catch (e) {
    results.adLaunchTracking = { error: e instanceof Error ? e.message : "ad launch tracking failed" };
  }

  try {
    results.adsEngineAutopilot = await runAdsEngineAutopilot();
  } catch (e) {
    results.adsEngineAutopilot = { error: e instanceof Error ? e.message : "ads engine autopilot failed" };
  }

  try {
    results.adsEngineAutoLaunch = await autoLaunchReadyCombos();
  } catch (e) {
    results.adsEngineAutoLaunch = { error: e instanceof Error ? e.message : "ads engine auto-launch failed" };
  }

  try {
    results.weeklyDigest = await sendWeeklyDigestIfDue(sb);
  } catch (e) {
    results.weeklyDigest = { error: e instanceof Error ? e.message : "weekly digest failed" };
  }

  try {
    results.weeklyCheckin = await sendWeeklyCheckinIfDue(sb);
  } catch (e) {
    results.weeklyCheckin = { error: e instanceof Error ? e.message : "weekly check-in failed" };
  }

  try {
    results.leadConversionTrend = await checkLeadConversionTrend(sb);
  } catch (e) {
    results.leadConversionTrend = { error: e instanceof Error ? e.message : "lead conversion trend check failed" };
  }

  try {
    results.callQueueNudge = await sendLowQueueNudge(sb);
  } catch (e) {
    results.callQueueNudge = { error: e instanceof Error ? e.message : "call queue nudge failed" };
  }

  try {
    results.messengerResubscribe = await resubscribeAllMessengerChannels();
  } catch (e) {
    results.messengerResubscribe = { error: e instanceof Error ? e.message : "messenger resubscribe failed" };
  }

  try {
    const deadChannels = await checkMessengerChannelHealth();
    results.messengerHealth = { deadChannels };
    if (deadChannels.length > 0) {
      await notifySlack(
        `🔴 Lead-qual Messenger connection dead for ${deadChannels.length} client(s) — leads are not getting replies right now:\n` +
        deadChannels.map((d) => `• *${d.clientName}* (page ${d.pageId}): ${d.reason}`).join("\n") +
        `\nReconnect from /dashboard/onboarding (Client Accounts tab).`
      );
    }
  } catch (e) {
    results.messengerHealth = { error: e instanceof Error ? e.message : "messenger health check failed" };
  }

  try {
    const discovered = await discoverNewFacebookPages();
    results.facebookDiscovery = { count: discovered.length };
    if (discovered.length > 0) {
      await notifySlack(
        `📣 ${discovered.length} new Facebook Page(s) found on the Business Manager:\n` +
        discovered.map((d) => `• *${d.pageName}*${d.suggestedClientName ? ` — looks like ${d.suggestedClientName}` : " — no matching client found"}`).join("\n") +
        `\nConfirm in /dashboard/onboarding (Client Accounts tab).`
      );
    }
  } catch (e) {
    results.facebookDiscovery = { error: e instanceof Error ? e.message : "facebook page discovery failed" };
  }

  try {
    // Catches conversations a human quietly took over that humanRepliedOnFacebook
    // (the per-message hard rule in the webhook) never got a chance to see,
    // because that check only fires when the lead messages back in. Without
    // this, a human-handled conversation just sits unpaused indefinitely.
    const takeovers = await reconcileHumanTakeovers();
    results.humanTakeovers = { count: takeovers.length };
    if (takeovers.length > 0) {
      await notifySlack(
        `🙋 Found ${takeovers.length} lead-qual conversation(s) a human already replied to that weren't marked paused — locked to needs_human now:\n` +
        takeovers.map((t) => `• *${t.clientName}* (${t.conversationId}): "${t.message.slice(0, 100)}"`).join("\n")
      );
    }
  } catch (e) {
    results.humanTakeovers = { error: e instanceof Error ? e.message : "human takeover reconciliation failed" };
  }

  try {
    results.onboardingPhotoUploads = await checkOnboardingPhotoUploads();
  } catch (e) {
    results.onboardingPhotoUploads = { error: e instanceof Error ? e.message : "onboarding photo upload check failed" };
  }

  try {
    results.campaignCompletions = await checkCampaignCompletions(sb);
  } catch (e) {
    results.campaignCompletions = { error: e instanceof Error ? e.message : "campaign completion check failed" };
  }

  try {
    results.systemsHealthDigest = await sendWeeklySystemsHealthIfDue(sb);
  } catch (e) {
    results.systemsHealthDigest = { error: e instanceof Error ? e.message : "systems health digest failed" };
  }

  try {
    results.midMonthCheckinPrep = await sendMidMonthCheckinPrepIfDue(sb);
  } catch (e) {
    const message = e instanceof Error ? e.message : "mid-month check-in prep failed";
    results.midMonthCheckinPrep = { error: message };
    await notifySlack(`🔴 Mid-month check-in prep failed: ${message}`);
  }

  try {
    results.endOfMonthResultsPrep = await sendEndOfMonthResultsPrepIfDue(sb);
  } catch (e) {
    const message = e instanceof Error ? e.message : "end-of-month results prep failed";
    results.endOfMonthResultsPrep = { error: message };
    await notifySlack(`🔴 End-of-month results prep failed: ${message}`);
  }

  try {
    results.paymentReminder = await sendPaymentRemindersIfDue(sb);
  } catch (e) {
    const message = e instanceof Error ? e.message : "payment reminder failed";
    results.paymentReminder = { error: message };
    await notifySlack(`🔴 Payment reminder failed: ${message} — check /dashboard/automations, you may be due a payment nudge that never sent.`);
  }

  try {
    results.invoiceAutomation = await generateInvoicesIfDue(sb);
  } catch (e) {
    const message = e instanceof Error ? e.message : "invoice automation failed";
    results.invoiceAutomation = { error: message };
    await notifySlack(`🔴 Invoice automation failed: ${message} — check /dashboard/payments.`);
  }

  const failedTasks = Object.entries(results).filter(([, v]) => v && typeof v === "object" && "error" in v);
  const summary = failedTasks.length > 0
    ? `${Object.keys(results).length - failedTasks.length}/${Object.keys(results).length} tasks ok. Failed: ${failedTasks.map(([k]) => k).join(", ")}.`
    : `All ${Object.keys(results).length} maintenance tasks ran clean (replies, sheet sync, calendar sync, health snapshot, nurture emails, stale-reply escalation, proposal/cold-call/no-show follow-ups, weekly digest, weekly check-in, lead conversion trend check, call-queue nudge, Messenger resubscribe/health, human-takeover reconciliation, onboarding photo uploads, campaign completion check, mid-month/end-of-month catch-up prep).`;
  await reportAutomationStatus(sb, "daily-maintenance", failedTasks.length > 0 ? "error" : "ok", summary);

  return NextResponse.json(results);
}
