import nodemailer from "nodemailer";
import { Resend } from "resend";
import { Lead } from "./types";
import { MailAccount } from "./gmail";
import { htmlToText } from "./templates";
import { createSupabaseClient } from "./supabase";

const FROM = `Lucky <${process.env.GMAIL_USER}>`;
const ZOHO_FROM = `Lucky <${process.env.ZOHO_EMAIL_USER}>`;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.lsgrowth.agency";
const BOOKING_URL = process.env.BOOKING_URL || "https://lsgrowth.agency/book";

// Bulk/automated outreach (cold initial emails, follow-up sequences, campaign
// emails) goes through Resend on the verified lsgrowth.agency domain instead
// of Lucky's personal Gmail account — that volume of cold mail is exactly
// what gets a Gmail account flagged or suspended. Replies land in the
// dedicated Zoho outreach mailbox via Reply-To, kept separate from Lucky's
// personal Gmail. Manual, low-volume sends (meeting reminders, inbox
// replies/compose) stay on whichever account the Inbox page is viewing.
// "Lucky from LS Growth" reads as a company broadcast, not a person - one of
// the signals Gmail's classifier weighs when deciding Primary vs Promotions.
// A plain personal name costs nothing (the from address and domain, which
// are what actually carry SPF/DKIM auth, are unchanged) and is a safer bet.
const BULK_FROM = "Lucky <outreach@lsgrowth.agency>";
const resend = new Resend(process.env.RESEND_API_KEY);

function getTransport() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
}

function getZohoTransport() {
  return nodemailer.createTransport({
    host: "smtp.zoho.com.au",
    port: 465,
    secure: true,
    auth: {
      user: process.env.ZOHO_EMAIL_USER,
      pass: process.env.ZOHO_EMAIL_APP_PASSWORD,
    },
  });
}

async function sendBulkMail(opts: { to: string; subject: string; html: string; text: string }) {
  const { error } = await resend.emails.send({
    from: BULK_FROM,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
    reply_to: process.env.ZOHO_EMAIL_USER,
  });
  if (error) throw new Error(error.message);
}

// step is threaded into both tracking URLs so an open/click can be joined
// back to the exact email_sends row (lead_id, step) it came from, not just
// the lead as a whole — see generateEmailLearnings in lib/emailLearning.ts.
function buildLinks(leadId: string, step: string) {
  const stepParam = `&step=${encodeURIComponent(step)}`;
  const pixel = `<img src="${APP_URL}/api/open?id=${encodeURIComponent(leadId)}${stepParam}" width="1" height="1" alt="" style="display:block;border:0" />`;
  const ctaLink = `${APP_URL}/api/click?id=${encodeURIComponent(leadId)}${stepParam}&url=${encodeURIComponent(BOOKING_URL)}`;
  return { pixel, ctaLink };
}

// AI-generated email bodies (cold-call follow-ups, etc.) link straight to real
// URLs instead of the {{CTA_LINK}} placeholder, so those clicks never hit
// /api/click and never get logged. Rewrite every link to go through the
// tracker, preserving the real destination as a query param.
function wrapLinksForTracking(html: string, leadId: string, step: string): string {
  return html.replace(/href="(https?:\/\/[^"]+)"/g, (match, url: string) => {
    if (url.includes("/api/click")) return match;
    return `href="${APP_URL}/api/click?id=${encodeURIComponent(leadId)}&step=${encodeURIComponent(step)}&url=${encodeURIComponent(url)}"`;
  });
}

async function logSend(leadId: string, step: string, subject: string, bodyHtml: string) {
  try {
    const sb = createSupabaseClient();
    await sb.from("email_sends").insert({ lead_id: leadId, step, subject, body_html: bodyHtml });
  } catch {}
}

export async function sendReminderEmail(to: string, subject: string, body: string) {
  const transport = getTransport();
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.6;max-width:560px;">${body.split("\n").map(l => l.trim() ? `<p style="margin:0 0 12px">${l}</p>` : "").join("")}</div>`;
  await transport.sendMail({ from: FROM, to, subject, html, text: body });
}

export async function sendFreeformEmail(
  to: string,
  subject: string,
  body: string,
  inReplyTo?: string,
  references?: string,
  account: MailAccount = "gmail",
) {
  const transport = account === "zoho" ? getZohoTransport() : getTransport();
  const from = account === "zoho" ? ZOHO_FROM : FROM;
  const isHtml = /<[a-z][\s\S]*>/i.test(body);
  const html = isHtml
    ? body
    : `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.65;white-space:pre-wrap">${body}</div>`;
  const text = isHtml ? body.replace(/<[^>]+>/g, "") : body;
  await transport.sendMail({
    from,
    to,
    subject,
    html,
    text,
    ...(inReplyTo && { inReplyTo, references: references || inReplyTo }),
  });
}

export async function sendGmailFollowup(lead: Lead, subject: string, bodyHtml: string, step: string = "custom") {
  // Never had open/click tracking wired in at all (unlike sendPersonalizedEmail
  // below) — every cold-call email showed 0% opens/clicks on Email Tracking
  // regardless of what actually happened, since there was no pixel and no
  // link rewriting to record anything against.
  const { pixel, ctaLink } = buildLinks(lead.lead_id, step);
  const filledBody = wrapLinksForTracking(bodyHtml.replace(/\{\{CTA_LINK\}\}/g, ctaLink), lead.lead_id, step);
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.5;max-width:560px;">
${filledBody}
  <p>Cheers,<br>Lucky<br>LS Growth</p>
  ${pixel}
</div>`;
  const text = htmlToText(filledBody);
  const transport = getTransport();
  await transport.sendMail({ from: FROM, to: lead.email, subject, html, text });
  await logSend(lead.lead_id, step, subject, html);
}

export async function sendPersonalizedEmail(lead: Lead, subject: string, bodyHtml: string, step: string = "custom") {
  const { pixel, ctaLink } = buildLinks(lead.lead_id, step);
  const filledBody = wrapLinksForTracking(bodyHtml.replace(/\{\{CTA_LINK\}\}/g, ctaLink), lead.lead_id, step);
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.5;max-width:560px;">
${filledBody}
  <p>Cheers,<br>Lucky<br>LS Growth</p>
  ${pixel}
</div>`;
  const text = htmlToText(filledBody);
  await sendBulkMail({ to: lead.email, subject, html, text });
  await logSend(lead.lead_id, step, subject, html);
}
