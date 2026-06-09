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

function htmlToText(html: string) {
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
    subject: `Quick question about {{company}}'s job pipeline`,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.5;max-width:560px;">
  <p>Hey {{contact_name}},</p>
  <p>I came across {{company}} and had a quick question — how are you currently finding most of your new jobs? Word of mouth, Google, a mix?</p>
  <p>I run LS Growth, and we help {{trade}} businesses across NZ and Australia keep a steady stream of qualified jobs coming in each month — without you having to chase quotes or rely on slow word-of-mouth.</p>
  <p>We're not an agency that sells you "more website traffic." We build and run the lead gen system end to end (ads, follow-up, booking) and you just turn up to quote the job.</p>
  <p>Worth a <a href="{{cta_link}}">quick 15-min chat</a> to see if it'd be a fit for {{company}}?</p>
  <p>Cheers,<br>Lucky<br>LS Growth</p>
</div>
{{pixel}}`,
  },
  followup1: {
    subject: `Re: Quick question about {{company}}'s job pipeline`,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.5;max-width:560px;">
  <p>Hey {{contact_name}},</p>
  <p>Following up on my note from last week — totally get it if things are flat out at the moment (that's actually exactly the kind of "good problem" we help {{trade}} businesses create more of).</p>
  <p>Quick context on what we do: we run a done-for-you lead system for trade businesses in NZ/Australia — you get pre-qualified jobs landing in your inbox or calendar, and we handle the ads and follow-up so you're not stuck doing admin on top of the tools.</p>
  <p>If a steady flow of new jobs each month would help {{company}}, happy to jump on a <a href="{{cta_link}}">quick 15-min call</a> this week — no pressure either way.</p>
  <p>Cheers,<br>Lucky<br>LS Growth</p>
</div>
{{pixel}}`,
  },
  followup2: {
    subject: `Last note from me - {{company}}`,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.5;max-width:560px;">
  <p>Hey {{contact_name}},</p>
  <p>I'll keep this one short — I know inboxes get slammed.</p>
  <p>I've reached out a couple of times about helping {{company}} bring in more consistent jobs through a managed lead system (we do this for {{trade}} businesses across NZ and Australia).</p>
  <p>If now's not the right time, no worries at all — I'll leave it here. But if you ever want to see what a steady pipeline of pre-qualified jobs would look like for {{company}}, <a href="{{cta_link}}">just grab a time here</a> and I'll send through some examples from similar businesses.</p>
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
