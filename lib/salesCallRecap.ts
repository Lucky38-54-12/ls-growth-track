import { FirefliesTranscript } from "./fireflies";
import { sendFreeformEmail } from "./email";

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

function overviewToHtml(overview: string): string {
  return overview
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p style="margin:0 0 10px">${line.replace(/^[-*]\s*/, "")}</p>`)
    .join("");
}

export function buildRecapEmail(transcript: FirefliesTranscript): { subject: string; html: string } {
  const subject = `Recap: ${transcript.title || "our call"}`;
  const overviewHtml = transcript.summary?.overview
    ? overviewToHtml(transcript.summary.overview)
    : `<p style="margin:0 0 10px">Thanks for the call today — recording and transcript are on file if you want to revisit anything.</p>`;
  const actionItemsHtml = transcript.summary?.action_items
    ? `<p style="margin:16px 0 6px;font-weight:bold">Next steps</p>${overviewToHtml(transcript.summary.action_items)}`
    : "";

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.6;max-width:560px;">
  <p style="margin:0 0 12px">Hey,</p>
  <p style="margin:0 0 12px">Here's a quick recap of our call:</p>
  ${overviewHtml}
  ${actionItemsHtml}
  <p style="margin:16px 0 0">Cheers,<br>Lucky<br>LS Growth</p>
</div>`;

  return { subject, html };
}

// Sends an already-approved recap (subject/html as reviewed on the dashboard,
// which may have been hand-edited from what buildRecapEmail first produced).
export async function sendPreparedRecap(subject: string, html: string, recipients: string[]): Promise<void> {
  for (const to of recipients) {
    await sendFreeformEmail(to, subject, html);
  }
}
