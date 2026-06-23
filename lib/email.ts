import nodemailer from "nodemailer";
import { Lead } from "./types";
import { EmailStep } from "./leads";
import { renderTemplate, htmlToText } from "./templates";
import { createSupabaseClient } from "./supabase";

const FROM = `Lucky <${process.env.GMAIL_USER}>`;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.lsgrowth.agency";
const BOOKING_URL = process.env.BOOKING_URL || "https://lsgrowth.agency/book";

function getTransport() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
}

function buildLinks(leadId: string) {
  const pixel = `<img src="${APP_URL}/api/open?id=${encodeURIComponent(leadId)}" width="1" height="1" alt="" style="display:block;border:0" />`;
  const ctaLink = `${APP_URL}/api/click?id=${encodeURIComponent(leadId)}&url=${encodeURIComponent(BOOKING_URL)}`;
  return { pixel, ctaLink };
}

// AI-generated email bodies (cold-call follow-ups, etc.) link straight to real
// URLs instead of the {{CTA_LINK}} placeholder, so those clicks never hit
// /api/click and never get logged. Rewrite every link to go through the
// tracker, preserving the real destination as a query param.
function wrapLinksForTracking(html: string, leadId: string): string {
  return html.replace(/href="(https?:\/\/[^"]+)"/g, (match, url: string) => {
    if (url.includes("/api/click")) return match;
    return `href="${APP_URL}/api/click?id=${encodeURIComponent(leadId)}&url=${encodeURIComponent(url)}"`;
  });
}

async function logSend(leadId: string, step: string, subject: string, bodyHtml: string) {
  try {
    const sb = createSupabaseClient();
    await sb.from("email_sends").insert({ lead_id: leadId, step, subject, body_html: bodyHtml });
  } catch {}
}

export async function sendOutreachEmail(lead: Lead, step: EmailStep) {
  const transport = getTransport();
  const { pixel, ctaLink } = buildLinks(lead.lead_id);
  const { subject, html, text } = renderTemplate(step, {
    company: lead.company,
    contact_name: lead.contact_name || "there",
    trade: lead.trade,
    location: lead.location,
    cta_link: ctaLink,
    pixel,
    personalization: lead.personalization_hook || undefined,
  });
  await transport.sendMail({ from: FROM, to: lead.email, subject, html, text });
  await logSend(lead.lead_id, step, subject, html);
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
) {
  const transport = getTransport();
  const isHtml = /<[a-z][\s\S]*>/i.test(body);
  const html = isHtml
    ? body
    : `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.65;white-space:pre-wrap">${body}</div>`;
  const text = isHtml ? body.replace(/<[^>]+>/g, "") : body;
  await transport.sendMail({
    from: FROM,
    to,
    subject,
    html,
    text,
    ...(inReplyTo && { inReplyTo, references: references || inReplyTo }),
  });
}

export async function sendPersonalizedEmail(lead: Lead, subject: string, bodyHtml: string) {
  const transport = getTransport();
  const { pixel, ctaLink } = buildLinks(lead.lead_id);
  const filledBody = wrapLinksForTracking(bodyHtml.replace(/\{\{CTA_LINK\}\}/g, ctaLink), lead.lead_id);
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.5;max-width:560px;">
${filledBody}
  <p>Cheers,<br>Lucky<br>LS Growth</p>
</div>
${pixel}`;
  const text = htmlToText(filledBody);
  await transport.sendMail({ from: FROM, to: lead.email, subject, html, text });
  await logSend(lead.lead_id, "custom", subject, html);
}
