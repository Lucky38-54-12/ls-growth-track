import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { createSupabaseClient, fetchAllRows } from "@/lib/supabase";
import { fetchMailboxSince } from "@/lib/gmail";

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

// Manual-trigger, mirrors /api/leads/from-inbox rather than running on every
// Today page load — an IMAP scan on every dashboard visit would be slow and
// hammers the Zoho account for no reason. Flipping a lead to "replied" also
// stops its campaign sequence immediately (see nextStepFor in lib/leads.ts),
// which is the actual point: a human should look at it before more AI emails
// go out to someone who already responded.
export async function POST() {
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
  for (const msg of messages) {
    const email = msg.fromEmail;
    if (!email || email === ownAddress) continue;
    if (!msg.subject.trim().toLowerCase().startsWith("re:")) continue;
    if (SKIP_DOMAINS.some((d) => email.includes(d))) continue;

    const match = leadByEmail.get(email);
    if (match && !ALREADY_TRACKED.has(match.status)) repliedLeadIds.add(match.lead_id);
  }

  let repliedUpdated = 0;
  if (repliedLeadIds.size) {
    const { error, count } = await sb
      .from("leads")
      .update({ status: "replied" }, { count: "exact" })
      .in("lead_id", Array.from(repliedLeadIds));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    repliedUpdated = count || repliedLeadIds.size;
  }

  return NextResponse.json({ repliedUpdated, scanned: messages.length });
}
