import { createSupabaseClient, fetchAllRows } from "./supabase";
import { SalesCall, PatternTracker, ScriptProposal } from "./types";
import { parseCallSummary, runStandingScriptReview, StandingReviewCallRef } from "./salesCallsAi";
import { applyStandingReview, approveScriptProposal, patternsForPrompt } from "./salesCallsPatterns";
import { runSalesCallsBackup } from "./salesCallsBackupSync";
import { generateAgreementDoc } from "./agreementMaker";
import { createSharedUploadFolder } from "./googleDocs";
import { buildKickoffEmail } from "./onboardingKickoffEmail";
import { Lead } from "./types";

export interface LogSalesCallResult {
  call: SalesCall;
  proposal: ScriptProposal | null;
  backupUrl: string | null;
}

// The actual logic behind the /dashboard/sales-calls "Log a Call" form
// (see app/api/sales-calls/route.ts, which now just wraps this) — pulled
// out so the Brain chat can do exactly the same thing when Lucky pastes a
// call straight into it: parse it, save the real row, and run the same
// standing script review, instead of duplicating this in two places.
export async function logSalesCall(
  sb: ReturnType<typeof createSupabaseClient>,
  rawSummary: string,
  yourTake: string,
  firefliesMeetingId?: string,
  clientEmail?: string,
  lead?: Lead | null
): Promise<LogSalesCallResult> {
  const parsed = await parseCallSummary(rawSummary);

  // A matched lead record (see lib/salesCallLeadMatch.ts) is contact info
  // Lucky already has on file — prefer it over whatever Fireflies' attendee
  // list captured (often nothing) or the AI's transcript-parsed guess.
  const effectiveEmail = lead?.email || clientEmail;
  const effectiveBusinessName = lead?.company || parsed.business_name;

  const call = {
    call_date: parsed.call_date,
    prospect_name: parsed.prospect_name,
    business_name: effectiveBusinessName,
    outcome: parsed.outcome,
    main_objection: parsed.main_objection,
    next_step_booked: parsed.next_step_booked,
    next_step_detail: parsed.next_step_detail,
    went_well: parsed.went_well,
    // yourTake is Lucky's own manual take when he pastes a call in himself —
    // automated sources (e.g. the Fireflies webhook) have no human typing
    // anything, so fall back to the AI's own extracted work_ons instead of
    // silently discarding it.
    work_ons: yourTake || parsed.work_ons,
    raw_summary: rawSummary,
    fireflies_meeting_id: firefliesMeetingId || null,
    deal_agreed: parsed.deal_agreed,
    deal_terms: parsed.deal_terms,
    lead_id: lead?.lead_id || null,
  };

  const { data, error } = await sb.from("sales_calls").insert(call).select().single();
  if (error) throw new Error(error.message);

  // The prospect agreeing to terms on the call is the trigger — draft the
  // agreement doc right away so it's ready for Lucky to check over, rather
  // than waiting on him to notice and trigger it by hand. Best-effort: a
  // logged, closed deal must never be lost because doc generation failed.
  if (parsed.deal_agreed && parsed.deal_terms) {
    let agreementUrl: string | null = null;
    try {
      agreementUrl = await generateAgreementDoc({
        company: effectiveBusinessName || undefined,
        email: effectiveEmail,
        dealNotes: parsed.deal_terms,
      });
      await sb.from("sales_calls").update({ agreement_status: "generated", agreement_doc_url: agreementUrl }).eq("id", data.id);
      data.agreement_status = "generated";
      data.agreement_doc_url = agreementUrl;
    } catch (err) {
      console.error("logSalesCall failed to generate agreement doc", data.id, err);
      await sb.from("sales_calls").update({ agreement_status: "failed" }).eq("id", data.id);
      data.agreement_status = "failed";
    }

    // A closed deal is exactly the moment onboarding starts, so give it an
    // onboarding_clients row straight away instead of waiting for Lucky to
    // create one by hand — that's the single record the new onboarding
    // overview page and per-client checklist are built around.
    try {
      const { data: onboardingClient, error: onboardingError } = await sb
        .from("onboarding_clients")
        .insert({
          name: lead?.contact_name || parsed.prospect_name || "Unknown",
          company: effectiveBusinessName || "Unknown business",
          email: effectiveEmail || null,
          phone: lead?.phone || null,
          notes: parsed.deal_terms,
          decision_status: "ready",
          sales_call_id: data.id,
        })
        .select()
        .single();
      if (onboardingError) throw new Error(onboardingError.message);

      // Kickoff email needs somewhere to send it and something to send —
      // both the agreement and the client's address have to exist before
      // there's anything worth drafting.
      if (agreementUrl && effectiveEmail) {
        try {
          const [photosFolderUrl, lqClientId] = await Promise.all([
            createSharedUploadFolder(`${effectiveBusinessName || "Client"} — onboarding photos`),
            findOrCreateLqClient(sb, effectiveBusinessName, effectiveEmail, lead?.phone || null),
          ]);
          const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://app.lsgrowth.agency";
          const connectUrl = `${appUrl}/connect/${lqClientId}`;
          const { subject, html } = buildKickoffEmail({
            clientName: lead?.contact_name || parsed.prospect_name || "there",
            company: effectiveBusinessName || "your business",
            connectUrl,
            photosFolderUrl,
            whatsappNumber: process.env.WHATSAPP_NUMBER || "",
          });
          await sb.from("onboarding_clients").update({
            portal_photos_folder_url: photosFolderUrl,
            lq_client_id: lqClientId,
            kickoff_email_status: "pending",
            kickoff_email_subject: subject,
            kickoff_email_html: html,
          }).eq("id", onboardingClient.id);
        } catch (err) {
          console.error("logSalesCall failed to draft kickoff email", onboardingClient.id, err);
        }
      }
    } catch (err) {
      console.error("logSalesCall failed to create onboarding client", data.id, err);
    }
  }

  // Standing review, runs after every call, permanently: reads every logged
  // call (not just this one) plus the open/closed pattern list, ranks
  // recurring misses by frequency and cost, and only proposes a change for
  // the highest priority one that isn't a one-off. Advisory only, a failure
  // here should never block the call save that already succeeded above.
  let proposal: ScriptProposal | null = null;
  try {
    const { data: currentVersion } = await sb.from("sales_script_versions").select("*").eq("is_current", true).maybeSingle();
    if (currentVersion) {
      const [allCalls, { data: existingPatterns }] = await Promise.all([
        fetchAllRows<SalesCall>((from, to) => sb.from("sales_calls").select("*").order("call_date", { ascending: true }).range(from, to)),
        sb.from("sales_pattern_tracker").select("*"),
      ]);
      const callRefs: StandingReviewCallRef[] = allCalls.map((c) => ({
        id: c.id,
        call_date: c.call_date,
        outcome: c.outcome,
        main_objection: c.main_objection,
        next_step_booked: c.next_step_booked,
        next_step_detail: c.next_step_detail,
        went_well: c.went_well,
        work_ons: c.work_ons,
      }));
      const review = await runStandingScriptReview(currentVersion.content, callRefs, patternsForPrompt((existingPatterns || []) as PatternTracker[]));
      const { proposalId } = await applyStandingReview(sb, review, data.id);
      if (proposalId) {
        // Auto-apply: script proposals used to sit pending for a manual
        // approve click, but Lucky asked for the whole call → script loop to
        // run with zero manual steps, so every proposal a call generates
        // goes straight to a new live script version.
        const applied = await approveScriptProposal(sb, proposalId);
        if (applied) {
          proposal = applied.proposal as unknown as ScriptProposal;
        } else {
          const { data: inserted } = await sb.from("sales_script_proposals").select("*").eq("id", proposalId).maybeSingle();
          proposal = inserted;
        }
      }
    }
  } catch {
    // Script review is advisory — a logged call must never be lost because
    // the review step failed.
  }

  let backupUrl: string | null = null;
  if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    try {
      const result = await runSalesCallsBackup();
      backupUrl = result.url;
    } catch {
      // Backup is best-effort — a logged call must never be lost because the
      // Drive push failed. The manual "Backup to Drive" button covers retry.
    }
  }

  return { call: data as SalesCall, proposal, backupUrl };
}

// The kickoff email now sends clients to /connect/[lqClientId] (Calendar +
// Facebook Page + Ads Manager access, no separate onboarding portal — see
// git history for that removal) instead of a one-off portal token, so a
// closed deal needs a real lq_clients row to link to. Matches by email
// first in case Lucky already added this business by hand from the Client
// Accounts tab, so closing the loop through a sales call doesn't create a
// duplicate entry for the same client.
async function findOrCreateLqClient(
  sb: ReturnType<typeof createSupabaseClient>,
  businessName: string,
  email: string,
  phone: string | null
): Promise<string> {
  const { data: existing } = await sb.from("lq_clients").select("id").eq("email", email).maybeSingle();
  if (existing) return existing.id;

  const { data: inserted, error } = await sb
    .from("lq_clients")
    .insert({ name: businessName, email, phone, timezone: "Pacific/Auckland" })
    .select("id")
    .single();
  if (error || !inserted) throw new Error(error?.message || "Could not create lq_clients row");
  return inserted.id;
}
