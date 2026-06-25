import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

import { createSupabaseClient, fetchAllRows } from "@/lib/supabase";
import { fetchMailboxSince } from "@/lib/gmail";
import { generateLeadId } from "@/lib/leads";
import { Lead } from "@/lib/types";

// Inboxes are full of newsletters, app notifications, and account alerts —
// none of those are leads. A real lead reply is part of an actual back-and-forth,
// so we only count messages that read as a reply ("Re:" in the subject) and
// aren't from a known SaaS/notification sender.
const SKIP_DOMAINS = [
  "noreply", "no-reply", "donotreply", "notifications", "mailer-daemon",
  "instagram.com", "facebookmail.com", "business-updates.facebook.com", "metamail.com",
  "google.com", "googlemail.com", "monday.com", "cloudhq.net", "read.ai", "tldv.io",
  "cal.com", "signwell.com", "gohighlevel.com", "freshdesk.com", "zapier.com",
  "godaddy.com", "instantly.ai", "make.com", "pdffiller.com", "doordash.com",
];

export async function POST() {
  const sb = createSupabaseClient();
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  const [messages, existing] = await Promise.all([
    fetchMailboxSince("INBOX", since),
    fetchAllRows<{ lead_id: string; email: string; status: string }>((from, to) =>
      sb.from("leads").select("lead_id, email, status").range(from, to)
    ),
  ]);

  const existingByEmail = new Map(existing.map((l) => [l.email.toLowerCase(), l]));
  const existingIds = new Set(existing.map((l) => l.lead_id));
  const ownAddress = (process.env.GMAIL_USER || "").toLowerCase();

  // Genuine reply, but already in the pipeline — flip its status to
  // "replied" instead of being silently skipped, so Replied/Booked stats on
  // the Campaigns page actually move without someone manually dragging the
  // card. Never downgrade a lead already marked "booked" or "replied".
  const ALREADY_TRACKED = new Set(["replied", "booked"]);
  const seenNew = new Map<string, { name: string; date: string }>();
  const repliedLeadIds = new Set<string>();
  for (const msg of messages) {
    const email = msg.fromEmail;
    if (!email || email === ownAddress) continue;
    if (!msg.subject.trim().toLowerCase().startsWith("re:")) continue;
    if (SKIP_DOMAINS.some((d) => email.includes(d))) continue;

    const match = existingByEmail.get(email);
    if (match) {
      if (!ALREADY_TRACKED.has(match.status)) repliedLeadIds.add(match.lead_id);
      continue;
    }
    if (!seenNew.has(email)) seenNew.set(email, { name: msg.from, date: msg.date.split("T")[0] });
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

  const today = new Date().toISOString().split("T")[0];
  const newLeads: object[] = [];
  for (const [email, { name, date }] of seenNew) {
    const company = name && name !== email ? name : email.split("@")[0];
    const leadId = generateLeadId(company, existingIds);
    existingIds.add(leadId);
    newLeads.push({
      lead_id: leadId,
      company,
      contact_name: name || "there",
      email,
      trade: "",
      location: "",
      status: "contacted",
      date_added: today,
      date_contacted: date,
      last_followup: null,
      followup_count: 0,
      notes: "",
      source: "email_outreach",
      website: null,
      facebook: null,
      personalization_hook: null,
    });
  }

  if (!newLeads.length) {
    return NextResponse.json({ imported: 0, repliedUpdated, scanned: messages.length });
  }

  const { error } = await sb.from("leads").insert(newLeads);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ imported: newLeads.length, repliedUpdated, scanned: messages.length });
}
