import { createSupabaseClient, fetchAllRows } from "@/lib/supabase";
import { fetchMailboxSince, fetchMessageDetail } from "@/lib/gmail";
import { statusTimestampUpdates } from "@/lib/leads";
import { createChatDraft } from "@/lib/chatDrafts";
import { generateCampaignReplyDraft } from "@/lib/campaignReplyDraft";
import { Lead } from "@/lib/types";

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
  // First genuine reply body captured per lead, used below to draft a
  // response — fetched once per matched message here rather than twice
  // (once for the unsubscribe check, once more for drafting).
  const replyTextByLeadId = new Map<string, string>();

  for (const msg of messages) {
    const email = msg.fromEmail;
    if (!email || email === ownAddress) continue;
    const match = leadByEmail.get(email);
    if (!match || ALREADY_TRACKED.has(match.status)) continue;

    const isGenuineReply = msg.subject.trim().toLowerCase().startsWith("re:") && !SKIP_DOMAINS.some((d) => email.includes(d));

    try {
      const detail = await fetchMessageDetail(msg.uid, "INBOX", "zoho");
      const text = `${detail.subject}\n${detail.bodyText}`;

      // An explicit unsubscribe always wins, even over a message the
      // "genuine reply" heuristic above would otherwise count.
      if (UNSUBSCRIBE_PATTERNS.some((p) => p.test(text))) {
        unsubscribeLeadIds.add(match.lead_id);
        repliedLeadIds.delete(match.lead_id); // not_interested below supersedes replied
        continue;
      }

      if (isGenuineReply) {
        repliedLeadIds.add(match.lead_id);
        if (!replyTextByLeadId.has(match.lead_id)) replyTextByLeadId.set(match.lead_id, detail.bodyText.replace(/\s+/g, " ").trim().slice(0, 1500));
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

  // Draft a reply for each genuine reply, instead of auto-sending — Lucky
  // reviews/edits every one from /dashboard/approvals (same queue as the
  // other Brain drafts). Never runs for a lead that got reclassified as an
  // unsubscribe above.
  if (repliedLeadIds.size) {
    const { data: repliedLeads } = await sb
      .from("leads")
      .select("*")
      .in("lead_id", Array.from(repliedLeadIds));

    for (const lead of (repliedLeads || []) as Lead[]) {
      const theirMessage = replyTextByLeadId.get(lead.lead_id);
      if (!theirMessage) continue;
      try {
        const generated = await generateCampaignReplyDraft(lead, theirMessage);
        if (!generated) continue;
        // Same convention as every other "email" draft (see
        // app/api/brain/chat/route.ts): title IS the subject line that
        // actually gets sent on approval (app/api/brain/drafts/[id]/route.ts
        // passes draft.title straight to sendGmailFollowup as the subject),
        // not a UI label — company context lives in the lead link instead.
        await createChatDraft(sb, {
          kind: "email",
          title: generated.subject,
          content: generated.bodyHtml,
          lead_id: lead.id,
          payload: { theirMessage },
        });
      } catch {
        // best-effort — a drafting failure shouldn't block the reply/unsubscribe updates above
      }
    }
  }

  return { repliedUpdated, unsubscribed, scanned: messages.length };
}
