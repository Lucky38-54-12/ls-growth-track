import { createSupabaseClient, fetchAllRows } from "@/lib/supabase";
import { fetchMailboxSince, fetchMessageDetail } from "@/lib/gmail";
import { notifySlack } from "@/lib/slackNotify";

const TZ = "Pacific/Auckland";

// Mail systems/notifications that are never worth surfacing here — same
// spirit as campaignReplies.ts's SKIP_DOMAINS, trimmed to what actually
// shows up in Lucky's personal Gmail.
const SKIP_DOMAINS = [
  "noreply", "no-reply", "donotreply", "notifications", "mailer-daemon",
  "google.com", "googlemail.com", "calendar-notification", "docs.google.com",
];

// A client saying they can't make a meeting — matched against subject +
// body. Deliberately narrow (real cancellation phrasing) rather than any
// mention of "meeting", to avoid false-flagging normal scheduling chat.
const CANCELLATION_PATTERNS = [
  /can'?t make (it|the meeting|today|our meeting)/i,
  /cannot make (it|the meeting|today|our meeting)/i,
  /can'?t attend/i,
  /won'?t be able to make/i,
  /not (going to|gonna) be able to make/i,
  /have to (cancel|reschedule)/i,
  /need to (cancel|reschedule)/i,
  /something('s| has| came)? come up/i,
  /something came up/i,
  /reschedule (our|the) meeting/i,
];

interface LeadLite {
  lead_id: string;
  email: string;
  company: string;
  contact_name: string;
  notes: string;
}

// Polls Lucky's personal Gmail inbox for anything worth surfacing without
// him having to open a mailbox client: an email from a known lead/client
// ("important"), or one that reads like a same-day meeting cancellation
// ("meeting_cancelled" — which also updates the lead itself so it surfaces
// on the Today page's Follow-ups Due panel, not just a Slack ping). Replaces
// the standalone /dashboard/inbox page — this is the one place inbox
// activity gets surfaced now.
export async function checkPersonalInbox(): Promise<{ scanned: number; alertsCreated: number }> {
  const sb = createSupabaseClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [messages, leads, { data: existing }] = await Promise.all([
    fetchMailboxSince("INBOX", since, "gmail").catch(() => []),
    fetchAllRows<LeadLite>((from, to) => sb.from("leads").select("lead_id, email, company, contact_name, notes").range(from, to)),
    sb.from("inbox_alerts").select("message_id").gte("created_at", since.toISOString()),
  ]);

  const leadByEmail = new Map(leads.filter((l) => l.email).map((l) => [l.email.toLowerCase(), l]));
  const alreadyAlerted = new Set((existing || []).map((r) => r.message_id as string));
  const ownAddress = (process.env.GMAIL_USER || "").toLowerCase();

  let alertsCreated = 0;

  for (const msg of messages) {
    const email = msg.fromEmail;
    if (!email || email === ownAddress) continue;
    if (alreadyAlerted.has(msg.messageId)) continue;

    const lead = leadByEmail.get(email);
    const subjectLooksLikeCancellation = CANCELLATION_PATTERNS.some((p) => p.test(msg.subject));

    // Cheap skip: not a known lead, subject gives no cancellation signal,
    // and it's from a system/notification sender — never worth a body fetch.
    if (!lead && !subjectLooksLikeCancellation && SKIP_DOMAINS.some((d) => email.includes(d))) continue;
    if (!lead && !subjectLooksLikeCancellation) continue;

    let snippet = "";
    let isCancellation = subjectLooksLikeCancellation;
    try {
      const detail = await fetchMessageDetail(msg.uid, "INBOX", "gmail");
      snippet = detail.snippet;
      isCancellation = isCancellation || CANCELLATION_PATTERNS.some((p) => p.test(detail.bodyText));
    } catch {
      // best-effort — fall back to subject-only signal if the body fetch fails
    }

    // Subject hinted at a cancellation but the sender isn't a known lead and
    // the body didn't confirm it — not worth flagging.
    if (!lead && !isCancellation) continue;

    const kind = isCancellation ? "meeting_cancelled" : "important";

    const { error: insertError } = await sb.from("inbox_alerts").insert({
      message_id: msg.messageId,
      from_email: email,
      from_name: msg.from,
      subject: msg.subject,
      snippet,
      kind,
      lead_id: lead?.lead_id || null,
    });
    if (insertError) continue; // likely a unique-constraint hit from a concurrent run — safe to skip
    alertsCreated++;

    if (kind === "meeting_cancelled" && lead) {
      const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      const note = `⚠️ ${todayStr} — client emailed saying they can't make today's meeting: "${snippet || msg.subject}"`;
      await sb.from("leads").update({
        notes: lead.notes ? `${lead.notes}\n\n${note}` : note,
        follow_up_at: todayStr,
      }).eq("lead_id", lead.lead_id);

      await notifySlack(
        `⚠️ *Meeting cancellation* — ${lead.contact_name || lead.company} emailed saying they can't make today's meeting. Lead flagged for follow-up on the Today page.`
      );
    } else if (kind === "important") {
      const who = lead ? `${lead.contact_name || lead.company}` : (msg.from || email);
      await notifySlack(`📧 *Client email* — ${who}: "${msg.subject}"`);
    }
  }

  return { scanned: messages.length, alertsCreated };
}
