import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClientAsync, fetchAllRows } from "@/lib/supabase";
import { getCompletedJobsPendingReview, markReviewRequested, notifyBookedLeads, syncMetaLeadsSheet } from "@/lib/metaLeadsSheetSync";
import { sendReviewRequestEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.lsgrowth.agency";

interface LeadSheetSync {
  id: string;
  client_name: string;
  spreadsheet_id: string;
  target_tab: string;
  client_email: string | null;
}

// Loops every client in lead_sheet_syncs — new Meta leads should get called
// same-day, so this runs on a short cadence via cron-job.org (see CLAUDE.md
// — GitHub Actions leaves multi-hour dead spots on sub-hourly schedules,
// same reason calendar-sync and the lead-qual reminders live there instead).
export async function GET(req: NextRequest) {
  // Own dedicated secret rather than the shared CRON_SECRET every other
  // cron route depends on — rotating/setting this one can't break those.
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (secret !== process.env.LEAD_SHEETS_CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = await createSupabaseClientAsync();
  const syncs = await fetchAllRows<LeadSheetSync>((from, to) =>
    sb.from("lead_sheet_syncs").select("id, client_name, spreadsheet_id, target_tab, client_email").range(from, to)
  );

  const results: Record<string, unknown>[] = [];
  for (const s of syncs) {
    try {
      const result = await syncMetaLeadsSheet(s.spreadsheet_id, s.target_tab);
      await sb
        .from("lead_sheet_syncs")
        .update({ last_synced_at: new Date().toISOString(), last_sync_added: result.added, last_sync_error: null })
        .eq("id", s.id);

      // Best-effort — a booking notification email failing should never
      // block the sync itself from being recorded as successful.
      let notified = 0;
      if (s.client_email) {
        try {
          notified = (await notifyBookedLeads(s.spreadsheet_id, s.target_tab, s.client_email, s.client_name)).notified;
        } catch (e) {
          console.error("notifyBookedLeads failed for", s.client_name, e);
        }
      }

      // Auto-trigger: any row with Job Completed? ticked and Review
      // Requested? still blank gets a review-funnel ask sent, if this
      // client's spreadsheet is linked to a review_funnel_clients entry.
      // Best-effort per-row — one failed send shouldn't block the rest or
      // mark the sync itself as failed.
      let reviewsSent = 0;
      try {
        const { data: rfClient } = await sb
          .from("review_funnel_clients")
          .select("id, slug, business_name, owner_email")
          .eq("spreadsheet_id", s.spreadsheet_id)
          .maybeSingle();

        if (rfClient) {
          const pending = await getCompletedJobsPendingReview(s.spreadsheet_id, s.target_tab);
          const doneRows: number[] = [];
          for (const job of pending) {
            try {
              const { data: send } = await sb
                .from("review_funnel_sends")
                .insert({
                  review_funnel_client_id: rfClient.id,
                  customer_name: job.name,
                  customer_email: job.email,
                  job_description: job.details || null,
                })
                .select("id")
                .single();
              if (!send) continue;

              const reviewLink = `${APP_URL}/review/${rfClient.slug}?s=${send.id}`;
              await sendReviewRequestEmail({
                to: job.email,
                businessName: rfClient.business_name,
                ownerEmail: rfClient.owner_email,
                customerName: job.name,
                jobDescription: job.details || null,
                reviewLink,
              });
              doneRows.push(job.rowIndex);
              reviewsSent++;
            } catch (e) {
              console.error("review-funnel auto-send failed for row", job.rowIndex, s.client_name, e);
            }
          }
          if (doneRows.length > 0) await markReviewRequested(s.spreadsheet_id, s.target_tab, doneRows);
        }
      } catch (e) {
        console.error("review-funnel auto-send check failed for", s.client_name, e);
      }

      results.push({ client: s.client_name, ...result, notified, reviewsSent });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Sync failed";
      console.error("sync-lead-sheets failed for", s.client_name, e);
      await sb.from("lead_sheet_syncs").update({ last_synced_at: new Date().toISOString(), last_sync_error: message }).eq("id", s.id);
      results.push({ client: s.client_name, error: message });
    }
  }

  return NextResponse.json({ ok: true, results });
}
