import { PERL_FALLBACK_LINE, SSP_LINE } from "./proofPoints";

export type EmailStep = "initial" | "followup1" | "followup2" | "followup3" | "followup4";

// The HTML stored in email_sends.body_html is the exact email that went out,
// tracking pixel and /api/click-wrapped links included. Viewing it anywhere
// in the dashboard (Campaign Tracking, lead detail, Automations) renders it
// live via dangerouslySetInnerHTML, which re-fires the pixel — and, if the
// preview's CTA link gets clicked, a click — attributing Lucky's own preview
// views to the recipient. Strip the pixel and unwrap tracking links before
// ever rendering stored email bodies for internal viewing.
export function stripTrackingForDisplay(html: string): string {
  return html
    .replace(/<img src="[^"]*\/api\/open\?[^"]*"[^>]*\/>/g, "")
    .replace(/href="[^"]*\/api\/click\?[^"]*[?&]url=([^"&]+)[^"]*"/g, (_match, encodedUrl: string) => `href="${decodeURIComponent(encodedUrl)}"`);
}

interface TemplateData {
  company: string;
  contact_name: string;
  trade: string;
  location: string;
  cta_link: string;
  pixel: string;
  personalization?: string;
}

// Fallback used only when no AI-generated personalization hook exists yet
// (e.g. older leads imported before this was added, or the AI call failed).
function genericPersonalizationFallback(d: Pick<TemplateData, "company" | "trade" | "location">) {
  return `I came across ${d.company} and wanted to see if something similar could work for a ${d.trade} business in ${d.location}.`;
}

function fill(tpl: string, d: TemplateData) {
  return tpl
    .replace(/\{\{company\}\}/g, d.company)
    .replace(/\{\{contact_name\}\}/g, d.contact_name)
    .replace(/\{\{trade\}\}/g, d.trade)
    .replace(/\{\{location\}\}/g, d.location)
    .replace(/\{\{cta_link\}\}/g, d.cta_link)
    .replace(/\{\{pixel\}\}/g, d.pixel)
    .replace(/\{\{personalization\}\}/g, d.personalization || genericPersonalizationFallback(d));
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

type StepTemplate = { subject: string; html: string };
type TemplateSet = Record<EmailStep, StepTemplate>;

// lib/proofPoints.ts is the single source of truth for every verified case
// study in the codebase (same file the main campaign system in
// lib/emailTemplates.ts uses). It only covers electrical, so only
// ELECTRICAL_TEMPLATES below cites a real proof point — every other trade's
// fallback here is deliberately proof-free rather than inventing one, same
// purge as "Cooper Electrical"/"Queenstown Cleaning" in the main system
// (INDUSTRY_TEMPLATES is still reachable via coldEmailDraft's "Insert cold
// email template" button on the Cold Call page).
const CLEANING_TEMPLATES: TemplateSet = {
  // Day 0
  initial: {
    subject: `A faster way for {{company}} to turn enquiries into booked jobs`,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.5;max-width:560px;">
  <p>Hey {{contact_name}},</p>
  <p>Quick one. Most {{trade}} businesses lose enquiries just because nobody gets back to them within the first hour, and by then they've already called someone else.</p>
  <p>{{personalization}}</p>
  <p>We run the whole lead gen process for {{trade}} businesses across NZ and Australia (ads, fast follow up, booking) so you get a steady stream of qualified jobs without chasing quotes or relying on word of mouth.</p>
  <p>Worth a <a href="{{cta_link}}">quick 15 min chat</a> to see if it'd be a fit for {{company}}?</p>
  <p>Cheers,<br>Lucky<br>LS Growth</p>
  {{pixel}}
</div>`,
  },

  // Day 3 — short follow-up
  followup1: {
    subject: `Re: A faster way for {{company}} to turn enquiries into booked jobs`,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.5;max-width:560px;">
  <p>Hey {{contact_name}},</p>
  <p>Just bumping this up in case it got buried. The core idea is simple — most {{trade}} businesses lose enquiries just because nobody gets back within the hour. Our system responds in under 60 seconds and handles all the follow up automatically, so you're converting leads you'd otherwise lose.</p>
  <p>Happy to jump on a <a href="{{cta_link}}">quick 15 min call</a> and show you exactly how it works for {{company}}.</p>
  <p>Cheers,<br>Lucky<br>LS Growth</p>
  {{pixel}}
</div>`,
  },

  // Day 7
  followup2: {
    subject: `Worth a look — {{company}}`,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.5;max-width:560px;">
  <p>Hey {{contact_name}},</p>
  <p>The reason speed matters is simple. New leads get a personalised text back within 60 seconds, before they've had a chance to call someone else. Most {{trade}} businesses respond hours later (or not at all) so the job's already gone by then.</p>
  <p>If {{company}} wants a consistent flow of jobs without chasing quotes, worth a <a href="{{cta_link}}">quick 15 min look</a>.</p>
  <p>Cheers,<br>Lucky<br>LS Growth</p>
  {{pixel}}
</div>`,
  },

  // Day 14 — last chance
  followup3: {
    subject: `Before I move on — {{company}}`,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.5;max-width:560px;">
  <p>Hey {{contact_name}},</p>
  <p>One last thing before I wrap this up. We take on a small number of {{trade}} businesses at a time so we can actually get results (not just sell a package and disappear), and we've got a spot available in {{location}} right now.</p>
  <p>If {{company}} is even a little curious about a predictable source of new jobs each month, this week is probably the right time. <a href="{{cta_link}}">Book 15 minutes here</a> and I'll show you exactly what the first 30 days would look like.</p>
  <p>Cheers,<br>Lucky<br>LS Growth</p>
  {{pixel}}
</div>`,
  },

  // Day 21 — breakup email
  followup4: {
    subject: `Last one from me, {{company}}`,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.5;max-width:560px;">
  <p>Hey {{contact_name}},</p>
  <p>I'll keep this one short, I know inboxes get slammed.</p>
  <p>I've reached out a few times about helping {{company}} get more consistent {{trade}} jobs through a done-for-you lead system. I'll leave it here after this one.</p>
  <p>If the timing ever changes, <a href="{{cta_link}}">grab a time here</a> and I'll send through some real numbers from other {{trade}} businesses we've worked with in {{location}}.</p>
  <p>All the best,<br>Lucky<br>LS Growth</p>
  {{pixel}}
</div>`,
  },
};

const PLUMBING_TEMPLATES: TemplateSet = {
  initial: {
    subject: `A faster way for {{company}} to turn enquiries into booked jobs`,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.5;max-width:560px;">
  <p>Hey {{contact_name}},</p>
  <p>Quick one. Most plumbing jobs get called out to 3-4 different companies before someone picks up the phone. If you're not responding within 30 minutes, the job's already gone.</p>
  <p>We run a lead gen + fast response system for plumbers across NZ: every new enquiry gets contacted within 30 minutes, then we handle all the follow-up automatically.</p>
  <p>{{personalization}}</p>
  <p>Worth a <a href="{{cta_link}}">quick 15 min chat</a> to see if it'd work for {{company}}?</p>
  <p>Cheers,<br>Lucky<br>LS Growth</p>
  {{pixel}}
</div>`,
  },
  followup1: {
    subject: `Re: A faster way for {{company}} to turn enquiries into booked jobs`,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.5;max-width:560px;">
  <p>Hey {{contact_name}},</p>
  <p>Just bumping this in case it got buried. The reality: if you're not the first call back on a plumbing job, you lose it. Our system handles that — every enquiry gets a callback within 30 minutes, guaranteed.</p>
  <p>Happy to jump on a <a href="{{cta_link}}">quick 15 min call</a> and walk you through how it works for {{company}}.</p>
  <p>Cheers,<br>Lucky<br>LS Growth</p>
  {{pixel}}
</div>`,
  },
  followup2: {
    subject: `Worth a look — {{company}}`,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.5;max-width:560px;">
  <p>Hey {{contact_name}},</p>
  <p>Speed wins in plumbing. Be the first call back and you get the job, most people lose jobs simply because they respond hours later, or not at all.</p>
  <p>If {{company}} wants to stop leaving jobs on the table, <a href="{{cta_link}}">grab 15 minutes</a> and I'll walk you through it.</p>
  <p>Cheers,<br>Lucky<br>LS Growth</p>
  {{pixel}}
</div>`,
  },
  followup3: {
    subject: `Before I move on — {{company}}`,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.5;max-width:560px;">
  <p>Hey {{contact_name}},</p>
  <p>One last thing. We take on a few plumbing businesses at a time and we've got availability in {{location}} right now.</p>
  <p>If {{company}} is tired of leaving booked jobs on the table because responses are too slow, this week is the right time to talk. <a href="{{cta_link}}">Book 15 minutes here</a> and I'll show you exactly what the first 30 days would look like.</p>
  <p>Cheers,<br>Lucky<br>LS Growth</p>
  {{pixel}}
</div>`,
  },
  followup4: {
    subject: `Last one from me, {{company}}`,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.5;max-width:560px;">
  <p>Hey {{contact_name}},</p>
  <p>I'll keep this one short, I know inboxes get slammed.</p>
  <p>I've reached out a few times about helping {{company}} book more plumbing jobs through fast response automation. I'll leave it here after this one.</p>
  <p>If the timing ever changes, <a href="{{cta_link}}">grab a time here</a> and I'll send through some real numbers from other plumbing businesses we've worked with in {{location}}.</p>
  <p>All the best,<br>Lucky<br>LS Growth</p>
  {{pixel}}
</div>`,
  },
};

const ELECTRICAL_TEMPLATES: TemplateSet = {
  initial: {
    subject: `A faster way for {{company}} to turn enquiries into booked jobs`,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.5;max-width:560px;">
  <p>Hey {{contact_name}},</p>
  <p>Quick one. Electrical jobs get called out fast, but most get booked by whoever responds first. If you're not on the phone within 20 minutes, you've lost it.</p>
  <p>We run lead gen + instant response for sparks across NZ: new jobs get a callback within 20 minutes, every time, and we handle all follow-up automatically. ${PERL_FALLBACK_LINE}</p>
  <p>{{personalization}}</p>
  <p>Worth a <a href="{{cta_link}}">quick 15 min chat</a> to see if it'd work for {{company}}?</p>
  <p>Cheers,<br>Lucky<br>LS Growth</p>
  {{pixel}}
</div>`,
  },
  followup1: {
    subject: `Re: A faster way for {{company}} to turn enquiries into booked jobs`,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.5;max-width:560px;">
  <p>Hey {{contact_name}},</p>
  <p>Just bumping this in case it got buried. In electrical work, speed wins the job, first callback gets it. Our system handles that automatically, every new enquiry gets a response within 20 minutes.</p>
  <p>Happy to jump on a <a href="{{cta_link}}">quick 15 min call</a> and show you how it works for {{company}}.</p>
  <p>Cheers,<br>Lucky<br>LS Growth</p>
  {{pixel}}
</div>`,
  },
  followup2: {
    subject: `Worth a look — {{company}}`,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.5;max-width:560px;">
  <p>Hey {{contact_name}},</p>
  <p>${SSP_LINE}</p>
  <p>If {{company}} wants to stop leaving jobs on the table, <a href="{{cta_link}}">grab 15 minutes</a> and I'll walk you through it.</p>
  <p>Cheers,<br>Lucky<br>LS Growth</p>
  {{pixel}}
</div>`,
  },
  followup3: {
    subject: `Before I move on — {{company}}`,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.5;max-width:560px;">
  <p>Hey {{contact_name}},</p>
  <p>One last thing. We take on a small number of electrical businesses at a time and we've got a spot available in {{location}} right now.</p>
  <p>If {{company}} is ready to stop losing jobs to faster competitors, <a href="{{cta_link}}">book 15 minutes here</a> and I'll show you exactly what your first 60 days would look like.</p>
  <p>Cheers,<br>Lucky<br>LS Growth</p>
  {{pixel}}
</div>`,
  },
  followup4: {
    subject: `Last one from me, {{company}}`,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.5;max-width:560px;">
  <p>Hey {{contact_name}},</p>
  <p>I'll keep this one short.</p>
  <p>I've reached out a few times about helping {{company}} book more electrical jobs through faster response times and automation. I'll leave it here after this one.</p>
  <p>If the timing ever changes, <a href="{{cta_link}}">grab a time here</a> and I'll send through real numbers from other sparks we've worked with in {{location}}.</p>
  <p>All the best,<br>Lucky<br>LS Growth</p>
  {{pixel}}
</div>`,
  },
};

const DEFAULT_TEMPLATES: TemplateSet = {
  // Day 0
  initial: {
    subject: `A faster way for {{company}} to turn enquiries into booked jobs`,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.5;max-width:560px;">
  <p>Hey {{contact_name}},</p>
  <p>Quick one. Most {{trade}} businesses lose 70%+ of new enquiries simply because nobody gets back to them within the first hour, and by then they've already called someone else.</p>
  <p>We run a lead gen + fast-follow-up system for trade businesses across NZ and Australia: new leads get a response in under 60 seconds, then the follow up sequence runs automatically.</p>
  <p>{{personalization}}</p>
  <p>Worth a <a href="{{cta_link}}">quick 15 min chat</a> to see if it'd be a fit for {{company}}?</p>
  <p>Cheers,<br>Lucky<br>LS Growth</p>
  {{pixel}}
</div>`,
  },

  // Day 3
  followup1: {
    subject: `Re: A faster way for {{company}} to turn enquiries into booked jobs`,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.5;max-width:560px;">
  <p>Hey {{contact_name}},</p>
  <p>Just bumping this in case it got buried. The short version: most {{trade}} businesses lose leads just because nobody follows up fast enough. Our system handles that part automatically — new enquiries get a response within 60 seconds, every time.</p>
  <p>Happy to jump on a <a href="{{cta_link}}">quick 15 min call</a> this week and show you how it'd work for {{company}}.</p>
  <p>Cheers,<br>Lucky<br>LS Growth</p>
  {{pixel}}
</div>`,
  },

  // Day 7
  followup2: {
    subject: `Worth a look — {{company}}`,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.5;max-width:560px;">
  <p>Hey {{contact_name}},</p>
  <p>The system contacts every new enquiry within 60 seconds, then follows up automatically until they book or say no. Nothing slips through.</p>
  <p>If {{company}} wants something similar, <a href="{{cta_link}}">grab a quick 15 min call</a> and I'll walk you through it.</p>
  <p>Cheers,<br>Lucky<br>LS Growth</p>
  {{pixel}}
</div>`,
  },

  // Day 14 — last chance
  followup3: {
    subject: `Before I move on — {{company}}`,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.5;max-width:560px;">
  <p>Hey {{contact_name}},</p>
  <p>One more from me. We only take on a small number of {{trade}} businesses at a time and we have a spot available in {{location}} right now.</p>
  <p>If {{company}} wants a consistent pipeline of pre-qualified jobs without chasing every lead manually, <a href="{{cta_link}}">book 15 minutes here</a> and I'll show you what the first 30 days would look like.</p>
  <p>Cheers,<br>Lucky<br>LS Growth</p>
  {{pixel}}
</div>`,
  },

  // Day 21 — breakup
  followup4: {
    subject: `Last note from me, {{company}}`,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.5;max-width:560px;">
  <p>Hey {{contact_name}},</p>
  <p>I'll keep this one short, I know inboxes get slammed.</p>
  <p>I've reached out a few times about helping {{company}} bring in more consistent jobs through a managed lead system. I'll leave it here after this one.</p>
  <p>If the timing ever changes, <a href="{{cta_link}}">just grab a time here</a> and I'll send through some examples from similar {{trade}} businesses.</p>
  <p>All the best,<br>Lucky<br>LS Growth</p>
  {{pixel}}
</div>`,
  },
};

export const INDUSTRY_TEMPLATES: Record<string, TemplateSet> = {
  cleaning: CLEANING_TEMPLATES,
  plumbing: PLUMBING_TEMPLATES,
  electrical: ELECTRICAL_TEMPLATES,
  default: DEFAULT_TEMPLATES,
};

export const INDUSTRY_LABELS: Record<string, string> = {
  cleaning: "Cleaning",
  plumbing: "Plumbing",
  electrical: "Electrical",
  default: "Default (generic)",
};

export function industryKey(trade: string): string {
  const t = (trade || "").toLowerCase();
  if (t.includes("clean")) return "cleaning";
  if (t.includes("plumb")) return "plumbing";
  if (t.includes("elec") || t.includes("spark")) return "electrical";
  return "default";
}

export function renderTemplate(
  step: EmailStep,
  data: TemplateData
): { subject: string; html: string; text: string } {
  const tmpl = INDUSTRY_TEMPLATES[industryKey(data.trade)][step];
  const subject = fill(tmpl.subject, data);
  const html = fill(tmpl.html, data);
  const text = htmlToText(fill(tmpl.html, { ...data, pixel: "" }));
  return { subject, html, text };
}

export function coldEmailDraft(data: {
  company: string;
  contact_name: string;
  trade: string;
  location: string;
}): { subject: string; bodyHtml: string } {
  const tmpl = INDUSTRY_TEMPLATES[industryKey(data.trade)].initial;
  const filled = tmpl.html
    .replace(/\{\{company\}\}/g, data.company)
    .replace(/\{\{contact_name\}\}/g, data.contact_name)
    .replace(/\{\{trade\}\}/g, data.trade)
    .replace(/\{\{location\}\}/g, data.location)
    .replace(/\{\{cta_link\}\}/g, "https://lsgrowth.agency/book")
    .replace(/\{\{personalization\}\}/g, genericPersonalizationFallback(data));

  const bodyHtml = filled
    .replace(/^<div[^>]*>\n?/, "")
    .replace(/<\/div>\s*\{\{pixel\}\}\s*$/, "")
    .trim();

  const subject = tmpl.subject.replace(/\{\{company\}\}/g, data.company);
  return { subject, bodyHtml };
}
