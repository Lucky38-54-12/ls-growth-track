import { createSupabaseClient, fetchAllRows } from "@/lib/supabase";
import { fetchMailboxSince, fetchMessageDetail } from "@/lib/gmail";
import { statusTimestampUpdates } from "@/lib/leads";

// Belt-and-suspenders on top of the "genuine reply" heuristic below: an
// AMC Electrical lead replied a literal one-word "unsubscribe" and the
// re:-prefix + skip-domain matching still missed it for reasons that don't
// show up anywhere in the logs (right mailbox, right subject, right lead
// lookup — just didn't match). Honoring an explicit opt-out can't depend on
// that heuristic being airtight, so this checks the body text of every
// message from a known lead address for opt-out language, independent of
// subject formatting or the domain skip-list.
const UNSUBSCRIBE_PATTERNS = [
  /unsubscribe/i, /remove me/i, /take me off/i, /stop email/i, /stop contacting/i,
  /don'?t (email|contact) (me|us)/i, /do not (email|contact) (me|us)/i, /opt.?out/i,
];

// Same "genuine reply" heuristic as /api/leads/from-inbox (Gmail cold-call
// replies) — a real back-and-forth has "Re:" in the subject and isn't a
// SaaS/notification sender. Campaign replies land in the Zoho outreach
// mailbox instead of Gmail, since every campaign email sets Reply-To to
// ZOHO_EMAIL_USER (see lib/email.ts sendBulkMail) precisely so replies don't
// mix into Lucky's personal inbox.
const SKIP_DOMAINS = [
  "noreply", "no-reply", "donotreply", "notifications", "mailer-daemon",
  "instagram.com", "facebookmail.com", "business-updates.facebook.com", "metamail.com",
  "google.com", "googlemail.com", "monday.com", "cloudhq.net", "read.ai", "tldv.io",
  "cal.com", "signwell.com", "gohighlevel.com", "freshdesk.com", "zapier.com",
  "godaddy.com", "instantly.ai", "make.com", "pdffiller.com", "doordash.com",
];

const ALREADY_TRACKED = new Set(["replied", "booked"]);

export async function checkForReplies(): Promise<{ repliedUpdated: number; unsubscribed: number; scanned: number }> {
  const sb = createSupabaseClient();
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  const [messages, campaignLeads] = await Promise.all([
    fetchMailboxSince("INBOX", since, "zoho"),
    fetchAllRows<{ lead_id: string; email: string; status: string }>((from, to) =>
      sb.from("leads").select("lead_id, email, status").not("campaign_id", "is", null).range(from, to)
    ),
  ]);

  const leadByEmail = new Map(campaignLeads.map((l) => [l.email.toLowerCase(), l]));
  const ownAddress = (process.env.ZOHO_EMAIL_USER || "").toLowerCase();

  const repliedLeadIds = new Set<string>();
  const unsubscribeLeadIds = new Set<string>();

  for (const msg of messages) {
    const email = msg.fromEmail;
    if (!email || email === ownAddress) continue;

    const match = leadByEmail.get(email);

    if (!msg.subject.trim().toLowerCase().startsWith("re:")) continue;
    if (SKIP_DOMAINS.some((d) => email.includes(d))) continue;
    if (match && !ALREADY_TRACKED.has(match.status)) repliedLeadIds.add(match.lead_id);
  }

  // Independent of the loop above: any message from a known lead address
  // gets its body checked for opt-out language, regardless of subject
  // prefix or skip-domain status — an explicit unsubscribe must win even if
  // the "genuine reply" heuristic would have ignored this message.
  for (const msg of messages) {
    const email = msg.fromEmail;
    if (!email || email === ownAddress) continue;
    const match = leadByEmail.get(email);
    if (!match || ALREADY_TRACKED.has(match.status)) continue;

    try {
      const detail = await fetchMessageDetail(msg.uid, "INBOX", "zoho");
      const text = `${detail.subject}\n${detail.bodyText}`;
      if (UNSUBSCRIBE_PATTERNS.some((p) => p.test(text))) {
        unsubscribeLeadIds.add(match.lead_id);
        repliedLeadIds.delete(match.lead_id); // not_interested below supersedes replied
      }
    } catch {
      // best-effort — a fetch failure here shouldn't block the rest of the run
    }
  }

  let repliedUpdated = 0;
  if (repliedLeadIds.size) {
    const { error, count } = await sb
      .from("leads")
      .update({ status: "replied", ...statusTimestampUpdates("replied") }, { count: "exact" })
      .in("lead_id", Array.from(repliedLeadIds));
    if (error) throw new Error(error.message);
    repliedUpdated = count || repliedLeadIds.size;
  }

  let unsubscribed = 0;
  if (unsubscribeLeadIds.size) {
    const { error, count } = await sb
      .from("leads")
      .update(
        { status: "not_interested", unsubscribed_at: new Date().toISOString(), ...statusTimestampUpdates("replied") },
        { count: "exact" }
      )
      .in("lead_id", Array.from(unsubscribeLeadIds));
    if (error) throw new Error(error.message);
    unsubscribed = count || unsubscribeLeadIds.size;
  }

  return { repliedUpdated, unsubscribed, scanned: messages.length };
}
