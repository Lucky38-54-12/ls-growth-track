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

async function logSend(leadId: string, step: string, subject: string) {
  try {
    const sb = createSupabaseClient();
    await sb.from("email_sends").insert({ lead_id: leadId, step, subject });
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
  });
  await transport.sendMail({ from: FROM, to: lead.email, subject, html, text });
  await logSend(lead.lead_id, step, subject);
}

export async function sendPersonalizedEmail(lead: Lead, subject: string, bodyHtml: string) {
  const transport = getTransport();
  const { pixel, ctaLink } = buildLinks(lead.lead_id);
  const filledBody = bodyHtml.replace(/\{\{CTA_LINK\}\}/g, ctaLink);
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.5;max-width:560px;">
${filledBody}
  <p>Cheers,<br>Lucky<br>LS Growth</p>
</div>
${pixel}`;
  const text = htmlToText(filledBody);
  await transport.sendMail({ from: FROM, to: lead.email, subject, html, text });
  await logSend(lead.lead_id, "custom", subject);
}
