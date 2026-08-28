import { FirefliesTranscript } from "./fireflies";
import { sendFreeformEmail } from "./email";
import { generateCallRecapEmail } from "./ai";

// Fireflies lists every attendee (Lucky included) with no flag for which one
// is the actual prospect — the prospect is just whoever isn't Lucky. Filters
// out his own addresses/domain rather than trying to positively identify the
// client, since that list is fixed and known while client addresses aren't.
const INTERNAL_DOMAINS = ["lsgrowth.agency"];
function isInternalEmail(email: string): boolean {
  const lower = email.toLowerCase();
  const ownAddresses = [process.env.GMAIL_USER, process.env.ZOHO_EMAIL_USER]
    .filter(Boolean)
    .map((a) => a!.toLowerCase());
  if (ownAddresses.includes(lower)) return true;
  return INTERNAL_DOMAINS.some((domain) => lower.endsWith(`@${domain}`));
}

export function pickRecapRecipients(transcript: FirefliesTranscript): string[] {
  const candidates = transcript.attendees
    .map((a) => a.email)
    .filter((e): e is string => !!e);
  if (transcript.organizerEmail) candidates.push(transcript.organizerEmail);

  const seen = new Set<string>();
  const external: string[] = [];
  for (const email of candidates) {
    const lower = email.toLowerCase();
    if (isInternalEmail(lower) || seen.has(lower)) continue;
    seen.add(lower);
    external.push(email);
  }
  return external;
}

// Rewrites Fireflies' own bullet-point call summary into a proper recap
// email in Lucky's voice (prose, not a notes dump) — see lib/ai.ts
// generateCallRecapEmail for the exact structure. prospectName/dealTerms
// come from parseCallSummary's own read of the transcript (lib/salesCallsAi.ts),
// the same data already saved on the sales_calls row, so the email and the
// dashboard record never disagree about what was actually said.
export async function buildRecapEmail(
  transcript: FirefliesTranscript,
  prospectName: string,
  businessName: string,
  dealTerms: string | null
): Promise<{ subject: string; html: string }> {
  const { subject, bodyHtml } = await generateCallRecapEmail({
    prospectName,
    businessName,
    overview: transcript.summary?.overview || "",
    actionItems: transcript.summary?.action_items || "",
    dealTerms,
  });
  return { subject, html: bodyHtml };
}

// Sends an already-approved recap (subject/html as reviewed on the dashboard,
// which may have been hand-edited from what buildRecapEmail first produced).
export async function sendPreparedRecap(subject: string, html: string, recipients: string[]): Promise<void> {
  for (const to of recipients) {
    await sendFreeformEmail(to, subject, html);
  }
}
