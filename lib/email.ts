import { Resend } from "resend";
import { Lead } from "./types";
import { EmailStep } from "./leads";
import { renderTemplate, htmlToText } from "./templates";

const FROM = "Lucky <lucky@lsgrowth.agency>";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.lsgrowth.agency";
const BOOKING_URL = process.env.BOOKING_URL || "https://lsgrowth.agency/book";

function buildLinks(leadId: string) {
  const pixel = `<img src="${APP_URL}/api/open?id=${encodeURIComponent(leadId)}" width="1" height="1" alt="" style="display:block;border:0" />`;
  // Link straight to the booking page rather than through /api/click, which
  // currently returns the tracking pixel response instead of redirecting.
  const ctaLink = BOOKING_URL;
  return { pixel, ctaLink };
}

export async function sendOutreachEmail(lead: Lead, step: EmailStep) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { pixel, ctaLink } = buildLinks(lead.lead_id);
  const { subject, html, text } = renderTemplate(step, {
    company: lead.company,
    contact_name: lead.contact_name || "there",
    trade: lead.trade,
    location: lead.location,
    cta_link: ctaLink,
    pixel,
  });
  const { error } = await resend.emails.send({ from: FROM, to: lead.email, subject, html, text });
  if (error) throw new Error(error.message);
}

export async function sendPersonalizedEmail(lead: Lead, subject: string, bodyHtml: string) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { pixel, ctaLink } = buildLinks(lead.lead_id);
  const filledBody = bodyHtml.replace(/\{\{CTA_LINK\}\}/g, ctaLink);
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.5;max-width:560px;">
${filledBody}
  <p>Cheers,<br>Lucky<br>LS Growth</p>
</div>
${pixel}`;
  const text = htmlToText(filledBody);
  const { error } = await resend.emails.send({ from: FROM, to: lead.email, subject, html, text });
  if (error) throw new Error(error.message);
}
