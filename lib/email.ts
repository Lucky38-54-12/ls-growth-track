import nodemailer from "nodemailer";
import { Resend } from "resend";
import { Lead } from "./types";
import { MailAccount } from "./gmail";
import { htmlToText } from "./templates";
import { createSupabaseClient } from "./supabase";

const FROM = `Lucky <${process.env.GMAIL_USER}>`;
const ZOHO_FROM = `Lucky <${process.env.ZOHO_EMAIL_USER}>`;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.lsgrowth.agency";
export const BOOKING_URL = process.env.BOOKING_URL || "https://lsgrowth.agency/book";
const LOGO_URL = `${APP_URL}/logo.png`;

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
// Switched the local-part from outreach@ to lucky@ on 2026-09-21 after a real
// send from outreach@ landed in Promotions — "outreach" reads as a mailing
// list/broadcast address to Gmail's classifier even with a personal display
// name attached. Still Resend on the verified domain, not personal Gmail
// SMTP, so this doesn't reintroduce the account-suspension risk above.
const BULK_FROM = "Lucky <lucky@lsgrowth.agency>";
// Meeting reminders (day-before, day-of) get their own identity, separate
// from both outreach@ (bulk sequences) and lucky@ (one-to-one cold-call
// follow-ups) — these are transactional/logistics mail to someone who
// already booked, a different content pattern than cold outreach, and
// mixing it into either of those sender histories would drag its
// reputation down with whatever the other one is doing.
const BOOKINGS_FROM = "Lucky <bookings@lsgrowth.agency>";
// Constructed lazily, not at module scope — this file gets imported (and
// therefore evaluated) by every route that touches it during Next's build-time
// "collecting page data" pass, including ones that never send bulk email. A
// missing RESEND_API_KEY in that environment used to throw at import time and
// fail the whole build rather than just the one send call that needed it.
let resend: Resend | null = null;
function getResend(): Resend {
  if (!resend) resend = new Resend(process.env.RESEND_API_KEY);
  return resend;
}

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

async function sendBulkMail(opts: { to: string; subject: string; html: string; text: string; bcc?: string; from?: string }) {
  const { error } = await getResend().emails.send({
    from: opts.from || BULK_FROM,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
    reply_to: process.env.ZOHO_EMAIL_USER,
    ...(opts.bcc ? { bcc: opts.bcc } : {}),
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

export async function sendGmailFollowup(lead: Lead, subject: string, bodyHtml: string, step: string = "custom", icsInvite?: string) {
  // Never had open/click tracking wired in at all (unlike sendPersonalizedEmail
  // below) — every cold-call email showed 0% opens/clicks on Email Tracking
  // regardless of what actually happened, since there was no pixel and no
  // link rewriting to record anything against.
  // No tracking pixel or logo <img> — same Promotions-tab reasoning as
  // sendResendFollowup above; still wraps links through /api/click for
  // click tracking since that isn't the signal that trips the classifier.
  const { ctaLink } = buildLinks(lead.lead_id, step);
  const filledBody = wrapLinksForTracking(bodyHtml.replace(/\{\{CTA_LINK\}\}/g, ctaLink), lead.lead_id, step);
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.5;max-width:560px;">
${filledBody}
  <p>Cheers,<br>Lucky<br>Founder, LS Growth<br>021 028 20190 | lsgrowth.agency</p>
  <p>If you want to check out some case studies, here's a link to our website: <a href="https://lsgrowth.agency">https://lsgrowth.agency</a></p>
</div>`;
  const text = htmlToText(filledBody);
  const transport = getTransport();
  await transport.sendMail({
    from: FROM,
    to: lead.email,
    subject,
    html,
    text,
    // nodemailer's icalEvent builds the text/calendar;method=REQUEST part
    // Gmail/Outlook render as a real invite (Yes/No/Maybe, add-to-calendar)
    // instead of a plain email — see lib/ics.ts.
    ...(icsInvite && { icalEvent: { method: "REQUEST", content: icsInvite } }),
  });
  await logSend(lead.lead_id, step, subject, html);
}

// Automated, cold, first-contact sequences (cold-call nudges, no-show
// follow-ups, proposal follow-ups, the video-intro/meeting-confirmation
// email) used to go through sendGmailFollowup below — but that's a scripted
// send, via SMTP app-password, to strangers, on a cron, with a tracking
// pixel and every link rewritten through a redirect domain. That exact
// pattern is what got the original bulk campaign system moved off Gmail to
// Resend in the first place (see BULK_FROM comment above); it just never
// got applied to these other automated flows, and they started landing in
// spam for the same underlying reason — Gmail's abuse detection reading a
// personal account as running a mail blast. Same body/signature/tracking as
// sendGmailFollowup, just sent through the authenticated outreach domain
// instead of Lucky's personal inbox. Reserve sendGmailFollowup for sends
// that are genuinely manual or to a lead who's already engaged (meeting
// reminders, inbox replies, Brain drafts Lucky approves one at a time).
export async function sendResendFollowup(lead: Lead, subject: string, bodyHtml: string, step: string = "custom") {
  const { ctaLink } = buildLinks(lead.lead_id, step);
  const filledBody = wrapLinksForTracking(bodyHtml.replace(/\{\{CTA_LINK\}\}/g, ctaLink), lead.lead_id, step);
  // No tracking pixel or logo <img> here (unlike the bulk campaign sender in
  // sendBulkMail's other callers) — an embedded open-tracking pixel plus a
  // logo image are exactly the signals Gmail's classifier reads as "this is
  // a marketing email" and routes to Promotions regardless of from-name.
  // Testing plain, image-free HTML for these one-to-one cold-call/follow-up
  // sends specifically; open tracking is lost here as a result.
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.5;max-width:560px;">
${filledBody}
  <p>Cheers,<br>Lucky<br>Founder, LS Growth<br>021 028 20190 | lsgrowth.agency</p>
  <p>If you want to check out some case studies, here's a link to our website: <a href="https://lsgrowth.agency">https://lsgrowth.agency</a></p>
</div>`;
  const text = htmlToText(filledBody);
  // Bcc Lucky's own Gmail so these per-lead cold-call/follow-up sends still
  // show up in his inbox the way they did before moving off Gmail SMTP —
  // he was checking his Sent folder for leads he'd just called and finding
  // nothing there once these switched to Resend.
  await sendBulkMail({ to: lead.email, subject, html, text, bcc: process.env.GMAIL_USER });
  await logSend(lead.lead_id, step, subject, html);
}

// Meeting reminders (day-before, day-of) — bookings@lsgrowth.agency via
// Resend, kept separate from sendResendFollowup's lucky@ address (see
// BOOKINGS_FROM comment). No pixel/logo for the same Promotions-tab reason
// as the other Resend senders; still click-tracked.
export async function sendBookingsFollowup(lead: Lead, subject: string, bodyHtml: string, step: string = "booking") {
  const { ctaLink } = buildLinks(lead.lead_id, step);
  const filledBody = wrapLinksForTracking(bodyHtml.replace(/\{\{CTA_LINK\}\}/g, ctaLink), lead.lead_id, step);
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.5;max-width:560px;">
${filledBody}
  <p>Cheers,<br>Lucky<br>Founder, LS Growth<br>021 028 20190 | lsgrowth.agency</p>
</div>`;
  const text = htmlToText(filledBody);
  await sendBulkMail({ to: lead.email, subject, html, text, bcc: process.env.GMAIL_USER, from: BOOKINGS_FROM });
  await logSend(lead.lead_id, step, subject, html);
}

// Same as sendBookingsFollowup, minus lead-tracking pixel/CTA rewriting/
// logSend — for meeting attendees who booked directly on the calendar and
// were never turned into a lead record, so there's no lead_id to tag the
// send against.
export async function sendPlainBookings(to: string, subject: string, bodyHtml: string) {
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.5;max-width:560px;">
${bodyHtml}
  <p>Cheers,<br>Lucky<br>Founder, LS Growth<br>021 028 20190 | lsgrowth.agency</p>
</div>`;
  const text = htmlToText(bodyHtml);
  await sendBulkMail({ to, subject, html, text, from: BOOKINGS_FROM });
}

// Same personal-Gmail send as sendGmailFollowup, minus the lead-tracking
// pixel/CTA rewriting/logSend — for meeting attendees who booked directly on
// the calendar and were never turned into a lead record (e.g. a title that
// doesn't match the "meet/call with X" pattern), so there's no lead_id to
// tag the send against.
export async function sendPlainGmail(to: string, subject: string, bodyHtml: string, icsInvite?: string) {
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.5;max-width:560px;">
${bodyHtml}
  <p>Cheers,<br>Lucky<br>LS Growth</p>
  <p><a href="https://lsgrowth.agency"><img src="${LOGO_URL}" alt="LS Growth" style="max-width:160px;height:auto;border:0;" /></a></p>
</div>`;
  const text = htmlToText(bodyHtml);
  const transport = getTransport();
  await transport.sendMail({
    from: FROM,
    to,
    subject,
    html,
    text,
    ...(icsInvite && { icalEvent: { method: "REQUEST", content: icsInvite } }),
  });
}

// Turns the AI-written bodyHtml + deterministic CTA block into the exact
// HTML that actually goes out — {{CTA_LINK}} filled in, links rewritten
// through the click tracker, signature and pixel appended. Exported so
// callers that need to evaluate the real final content (e.g. sendPipeline's
// common-sense check) see the same thing the recipient will, not a draft
// with an unresolved {{CTA_LINK}} placeholder still sitting in it — that
// placeholder is normal at the AI/quality-check stage but reads as a broken
// email to anything checking it after this point.
export function buildFinalEmailHtml(lead: Lead, bodyHtml: string, step: string): { html: string; text: string } {
  const { pixel, ctaLink } = buildLinks(lead.lead_id, step);
  const filledBody = wrapLinksForTracking(bodyHtml.replace(/\{\{CTA_LINK\}\}/g, ctaLink), lead.lead_id, step);
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.5;max-width:560px;">
${filledBody}
  <p>Cheers,<br>Lucky<br>LS Growth</p>
  <p><a href="https://lsgrowth.agency"><img src="${LOGO_URL}" alt="LS Growth" style="max-width:160px;height:auto;border:0;" /></a></p>
  ${pixel}
</div>`;
  return { html, text: htmlToText(filledBody) };
}

export async function sendPersonalizedEmail(lead: Lead, subject: string, bodyHtml: string, step: string = "custom") {
  const { html, text } = buildFinalEmailHtml(lead, bodyHtml, step);
  await sendBulkMail({ to: lead.email, subject, html, text });
  await logSend(lead.lead_id, step, subject, html);
}
