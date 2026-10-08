// Fixed template strings for the cold-outreach sequence, added 2026-07-15 to
// replace full AI authorship after a fabricated case study ("Cooper
// Electrical") got baked into the old generation prompt and sent to real
// leads (see lib/ai.ts for what the AI is still allowed to do — extract
// confirmed services and pick slot values, nothing else).
//
// Rewritten 2026-07-17 for the sparkies campaign relaunch (new copy, $80k
// Perl figure, 3-week trial guarantee). Copy below is verbatim from Lucky,
// word for word — do not reword it here. The only things that vary per lead
// are the named slots (job type, city, matched job types, first name,
// business name) and the two proof lines, both locked constants in
// lib/proofPoints.ts.
//
// "solar-dominant" and "confirmed name" are now independent slots (previously
// combined into one three-way "variant" enum, which had no template for
// "solar-dominant, no confirmed name" and silently downgraded that
// combination to the plain no-name template). The new copy only swaps the
// proof line for solar-dominant leads — greeting logic is identical either
// way — so there's no gap left to paper over.
import { buildPerlLine, PERL_FALLBACK_LINE, PERL_FOLLOWUP_LINE, SSP_LINE, QUEENSTOWN_LINE, QUEENSTOWN_FOLLOWUP_LINE, GUARANTEE_LINE_INITIAL, GUARANTEE_LINE_FOLLOWUP1 } from "./proofPoints";
import { BOOKING_URL } from "./email";

export type SequenceStep = "initial" | "followup1" | "followup2" | "followup3" | "followup4" | "checkin";

export interface RenderedEmail {
  subject: string;
  bodyHtml: string;
}

export interface InitialSlots {
  firstName: string | null;
  jobType: string;
  city: string;
  matchedJobTypes: string[];
  isSolarDominant: boolean;
}

export function renderInitialEmail(slots: InitialSlots): RenderedEmail {
  const greeting = slots.firstName ? `Hey ${slots.firstName},` : "Hey,";
  const proofLine = slots.isSolarDominant ? SSP_LINE : buildPerlLine(slots.matchedJobTypes);
  return {
    subject: `${slots.jobType} in ${slots.city}`,
    bodyHtml: `<p>${greeting} look, I know you get a hundred of these promising the world, so I'll keep it short. I'm Lucky, I run a marketing agency out of Nelson and I get sparkies booked jobs, not leads. Every enquiry gets pre-qualified and I call them myself before they get near you, so you're only quoting people who are actually keen. ${proofLine} And ${GUARANTEE_LINE_INITIAL}. If work's been a bit quiet or up and down, this might be worth a conversation, just reply to this email & I will get back to you.</p>`,
  };
}

export function renderFollowup1Email(initialSubject: string): RenderedEmail {
  return {
    subject: `re: ${initialSubject}`,
    bodyHtml: `<p>Hey, you might've missed my last email or just not been bothered, which is fair enough. Short version, if work's been quiet or inconsistent, I help sparkies get booked jobs, ${PERL_FOLLOWUP_LINE}. And to make it a no brainer, ${GUARANTEE_LINE_FOLLOWUP1}. If it's worth a conversation, just reply and I'll send the details.</p>`,
  };
}

export function renderFollowup2Email(): RenderedEmail {
  return {
    subject: "put a face to the emails",
    bodyHtml: `<p>Hey, me again, I know, probably getting sick of seeing my name pop up haha. I'll make this the easy one. Instead of emails back and forth, grab a time here and I'll show you exactly how I get sparkies booked jobs, takes 15 mins tops and you'll get to see who's actually behind these emails: <a href="${BOOKING_URL}">${BOOKING_URL}</a></p>`,
  };
}

export interface Followup3Slots {
  businessName: string;
  caseStudiesLink: string;
  // Whether the initial email this lead actually got used the solar (SSP)
  // proof line — followup3 always uses the OTHER client's line, per Lucky's
  // instruction, so this has to reflect the real initial send, not be
  // re-derived from current lead data (a lead's solar-dominance read could
  // change between the initial and followup3 sends).
  initialUsedSolar: boolean;
}

export function renderFollowup3Email(slots: Followup3Slots): RenderedEmail {
  const proofLine = slots.initialUsedSolar ? PERL_FALLBACK_LINE : SSP_LINE;
  return {
    subject: "worth a look",
    bodyHtml: `<p>Hey, this is the last useful one I'll send. Since my first email you might've been wondering if the results are actually real, fair enough. ${proofLine} There's a few more on here if you want a proper look: <a href="${slots.caseStudiesLink}">${slots.caseStudiesLink}</a>. And if work's still up and down, just reply and I'll show you what it'd look like for ${slots.businessName}.</p>`,
  };
}

export function renderFollowup4Email(): RenderedEmail {
  return {
    subject: "last one from me",
    bodyHtml: `<p>Hey, I'll leave you to it, promise this is the last one. If the calendar ever gets quiet or the phone goes a bit dead, you know where I am, you can always grab a time here: <a href="${BOOKING_URL}">${BOOKING_URL}</a>. Good luck with it either way.</p>`,
  };
}

// Cleaning-companies variant, added 2026-10-06 for the Auckland cleaning
// test batch. Same shape and voice as the sparkies sequence above, just
// "cleaning companies" instead of "sparkies" and the Queenstown Cleaning
// proof line instead of Perl/SSP — there's only one proof line here (no
// job-type-driven variant), since the real result (30 booked jobs in a
// month) isn't tied to a specific job type the way Perl's is.
export interface CleaningInitialSlots {
  firstName: string | null;
  jobType: string;
  city: string;
  // True when lead.notes shows a prior cold call (see lib/sendPipeline.ts) —
  // swaps the opening line to acknowledge that instead of opening like this
  // is the first-ever contact. Deliberately a fixed alternate line, not the
  // actual call notes themselves: those are Lucky's own shorthand (slang,
  // sometimes blunt about the call going badly) and were never written to
  // be read by the lead, so nothing from them is pulled into the email.
  calledBefore?: boolean;
}

export function renderCleaningInitialEmail(slots: CleaningInitialSlots): RenderedEmail {
  const greeting = slots.firstName ? `Hey ${slots.firstName},` : "Hey,";
  const opener = slots.calledBefore
    ? "tried giving you a call a while back but didn't manage to grab much time, so figured I'd try email instead."
    : "look, I know you get a hundred of these promising the world, so I'll keep it short.";
  return {
    // "booked {job type} in {city}" instead of the bare job type alone —
    // ties the subject to the actual value prop (booked jobs, not just a
    // service label) so it reads as a real pitch rather than a vague
    // service listing, while staying lowercase/short per the voice rules.
    subject: `booked ${slots.jobType} in ${slots.city}`,
    bodyHtml: `<p>${greeting} ${opener} I'm Lucky, I run a marketing agency out of Nelson and I get cleaning companies booked jobs, not leads. You might be thinking, yeah right, another lead gen guy whose leads go nowhere. That's why every enquiry goes through a 2 step qualification first. So by the time it reaches you, it's an actual fit and ready to move forward. ${QUEENSTOWN_LINE} And ${GUARANTEE_LINE_INITIAL}. If work's been a bit quiet or up and down, this might be worth a conversation, just reply to this email & I will get back to you.</p>`,
  };
}

export function renderCleaningFollowup1Email(initialSubject: string): RenderedEmail {
  return {
    subject: `re: ${initialSubject}`,
    bodyHtml: `<p>Hey, you might've missed my last email or just not been bothered, which is fair enough. Short version, if work's been quiet or inconsistent, I help cleaning companies get booked jobs, ${QUEENSTOWN_FOLLOWUP_LINE}. And to make it a no brainer, ${GUARANTEE_LINE_FOLLOWUP1}. If it's worth a conversation, just reply and I'll send the details.</p>`,
  };
}

export function renderCleaningFollowup2Email(): RenderedEmail {
  return {
    subject: "worth 15 minutes?",
    bodyHtml: `<p>Hey, me again, I know, probably getting sick of seeing my name pop up haha. I'll make this the easy one. Instead of emails back and forth, grab a time here and I'll show you exactly how I get cleaning companies booked jobs, takes 15 mins tops and you'll get to see who's actually behind these emails: <a href="${BOOKING_URL}">${BOOKING_URL}</a></p>`,
  };
}

export interface CleaningFollowup3Slots {
  businessName: string;
  caseStudiesLink: string;
}

export function renderCleaningFollowup3Email(slots: CleaningFollowup3Slots): RenderedEmail {
  return {
    subject: "proof this actually works",
    bodyHtml: `<p>Hey, this is the last useful one I'll send. Since my first email you might've been wondering if the results are actually real, fair enough. ${QUEENSTOWN_LINE} There's a few more on here if you want a proper look: <a href="${slots.caseStudiesLink}">${slots.caseStudiesLink}</a>. And if work's still up and down, just reply and I'll show you what it'd look like for ${slots.businessName}.</p>`,
  };
}

export function renderCheckinEmail(): RenderedEmail {
  return {
    subject: "checking in",
    bodyHtml: `<p>Hey, been about a month since I last flicked you an email. How's the work situation looking, still ticking along or starting to get some gaps? Either way, the trial's still on the table if you ever want to test it.</p>`,
  };
}
