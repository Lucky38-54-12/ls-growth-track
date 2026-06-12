export type EmailStep = "initial" | "followup1" | "followup2";

interface TemplateData {
  company: string;
  contact_name: string;
  trade: string;
  location: string;
  cta_link: string;
  pixel: string;
}

function fill(tpl: string, d: TemplateData) {
  return tpl
    .replace(/\{\{company\}\}/g, d.company)
    .replace(/\{\{contact_name\}\}/g, d.contact_name)
    .replace(/\{\{trade\}\}/g, d.trade)
    .replace(/\{\{location\}\}/g, d.location)
    .replace(/\{\{cta_link\}\}/g, d.cta_link)
    .replace(/\{\{pixel\}\}/g, d.pixel);
}

export function htmlToText(html: string) {
  return html
    .replace(/<!--.*?-->/gs, "")
    .replace(/<a [^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gs, "$2 ($1)")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const TEMPLATES: Record<EmailStep, { subject: string; html: string }> = {
  initial: {
    subject: `How Queenstown Cleaning landed 25+ new jobs in their first month`,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.5;max-width:560px;">
  <p>Hey {{contact_name}},</p>
  <p>Quick one. We recently helped Queenstown Cleaning land over 25 new window cleaning and house cleaning jobs in their first month after setting up their lead system. Another client is now booking 3x more jobs from the same number of enquiries, simply by responding to new leads within 60 seconds instead of hours.</p>
  <p>I came across {{company}} and wanted to see if something similar could work for a {{trade}} business in {{location}}.</p>
  <p>We run the whole lead gen process for {{trade}} businesses across NZ and Australia (ads, fast follow up, booking) so you get a steady stream of qualified jobs without chasing quotes or relying on word of mouth.</p>
  <p>Worth a <a href="{{cta_link}}">quick 15 min chat</a> to see if it'd be a fit for {{company}}?</p>
  <p>Cheers,<br>Lucky<br>LS Growth</p>
</div>
{{pixel}}`,
  },
  followup1: {
    subject: `Re: How Queenstown Cleaning landed 25+ new jobs in their first month`,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.5;max-width:560px;">
  <p>Hey {{contact_name}},</p>
  <p>Following up on my note from last week, totally get it if things are flat out at the moment (that's actually exactly the kind of "good problem" we help {{trade}} businesses create more of).</p>
  <p>Most local service businesses respond to less than 30% of new enquiries within the first hour, and the rest just go cold and book someone else. Our system contacts every new lead within 60 seconds, then handles the follow up so nothing slips through.</p>
  <p>If a steady flow of new jobs each month would help {{company}}, happy to jump on a <a href="{{cta_link}}">quick 15 min call</a> this week, no pressure either way.</p>
  <p>Cheers,<br>Lucky<br>LS Growth</p>
</div>
{{pixel}}`,
  },
  followup2: {
    subject: `Last note from me, {{company}}`,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.5;max-width:560px;">
  <p>Hey {{contact_name}},</p>
  <p>I'll keep this one short, I know inboxes get slammed.</p>
  <p>I've reached out a couple of times about helping {{company}} bring in more consistent jobs through a managed lead system (we do this for {{trade}} businesses across NZ and Australia, recent results include 25+ new window and house cleaning jobs for Queenstown Cleaning in their first month).</p>
  <p>If now's not the right time, no worries at all, I'll leave it here. But if you ever want to see what a steady pipeline of pre qualified jobs would look like for {{company}}, <a href="{{cta_link}}">just grab a time here</a> and I'll send through some examples from similar businesses.</p>
  <p>All the best,<br>Lucky<br>LS Growth</p>
</div>
{{pixel}}`,
  },
};

export function renderTemplate(
  step: EmailStep,
  data: TemplateData
): { subject: string; html: string; text: string } {
  const tmpl = TEMPLATES[step];
  const subject = fill(tmpl.subject, data);
  const html = fill(tmpl.html, data);
  const text = htmlToText(fill(tmpl.html, { ...data, pixel: "" }));
  return { subject, html, text };
}
