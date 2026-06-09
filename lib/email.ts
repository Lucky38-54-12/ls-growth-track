import { Resend } from "resend";
import { Lead } from "./types";
import { EmailStep } from "./leads";
import { renderTemplate } from "./templates";

const FROM = "Lucky <lucky@lsgrowth.agency>";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://lsgrowth.co.nz";
const BOOKING_URL = process.env.BOOKING_URL || "https://lsgrowth.co.nz/book-a-call";

function buildLinks(leadId: string) {
  const pixel = `<img src="${APP_URL}/api/open?id=${encodeURIComponent(leadId)}" width="1" height="1" alt="" style="display:block;border:0" />`;
  const ctaLink = `${APP_URL}/api/click?id=${encodeURIComponent(leadId)}&url=${encodeURIComponent(BOOKING_URL)}`;
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
