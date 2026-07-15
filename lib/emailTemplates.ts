// Fixed template strings for the cold-outreach sequence, added 2026-07-15 to
// replace full AI authorship after a fabricated case study ("Cooper
// Electrical") got baked into the old generation prompt and sent to real
// leads (see lib/ai.ts for what the AI is still allowed to do — extract
// confirmed services and pick slot values, nothing else).
//
// Copy below is verbatim from Lucky, word for word — do not reword it here.
// The only things that vary per lead are the named slots (job type, matched
// job types, first name, business name) and the two proof lines, both of
// which are locked constants in lib/proofPoints.ts.
import { buildPerlLine, SSP_LINE, GUARANTEE_LINE } from "./proofPoints";

export type SequenceStep = "initial" | "followup1" | "followup2" | "followup3" | "followup4" | "checkin";

export type InitialVariant = "no_name" | "with_name" | "solar";

export interface RenderedEmail {
  subject: string;
  bodyHtml: string;
}

export interface InitialSlots {
  variant: InitialVariant;
  jobType: string;
  matchedJobTypes: string[];
  firstName: string | null;
}

// There is no given template for "solar-dominant website, but no confirmed
// contact name" — the three templates Lucky gave only cover no-name/Perl,
// with-name/Perl, and with-name/solar. Rather than invent wording for that
// gap, this falls back to the no-name Perl template (matchedJobTypes will
// naturally include "solar" if confirmed). Flagged for Lucky — see summary.
export function renderInitialEmail(slots: InitialSlots): RenderedEmail {
  if (slots.variant === "solar" && slots.firstName) {
    return {
      subject: "solar installs sitting on the table",
      bodyHtml: `<p>Hey ${slots.firstName}, most solar sparkies I talk to have the same problem, plenty of tyre kickers filling the inbox while the real installs book whoever called back first. I fix both ends, ads that pull proper solar enquiries and me calling every one before it touches your calendar. ${SSP_LINE} Worth a conversation?</p>`,
    };
  }

  const subject = `${slots.jobType} sitting on the table`;
  const perlLine = buildPerlLine(slots.matchedJobTypes);

  if (slots.variant === "with_name" && slots.firstName) {
    return {
      subject,
      bodyHtml: `<p>Hey ${slots.firstName}, most sparkies I talk to aren't short of enquiries, they're short of good ones. Tyre kickers fill the inbox while the real jobs book whoever called back first. I fix both ends, ads that pull proper enquiries and me calling every one before it touches your calendar. ${perlLine} Worth a conversation?</p>`,
    };
  }

  return {
    subject,
    bodyHtml: `<p>Most sparkies I talk to aren't short of work, they're short of the right work. The enquiries that come in are tyre kickers, and the good jobs go to whoever answered first. I fix that, I get electricians booked jobs and call every enquiry myself before it goes near your calendar. ${perlLine} Worth a conversation?</p>`,
  };
}

export function renderFollowup1Email(initialSubject: string): RenderedEmail {
  return {
    subject: `re: ${initialSubject}`,
    bodyHtml: `<p>Hey, figured you were probably on a job when my last one landed. Short version, I get sparkies booked jobs, not leads. I call every enquiry myself before it goes near your calendar, so you're not quoting tyre kickers or chasing jobs that were never real. Reply "how" and I'll send over how it works.</p>`,
  };
}

// "follow-up" below contains a hyphen, which is Lucky's own literal wording
// (not reworded) — this is a genuine conflict with the new "no dash of any
// kind" quality-gate rule (STEP 5). Flagged in the summary; the fixed
// template text is exempted from that check, which only applies to
// AI-filled slot content (job type, matched job types, names).
export function renderFollowup2Email(): RenderedEmail {
  return {
    subject: "the two day problem",
    bodyHtml: `<p>Hey, different one from me. Most sparkies I talk to don't have an enquiry problem, they have a follow-up problem. Someone fills out a form, hears nothing for two days, books whoever called back first. That's the bit I fix, and I back it, ${GUARANTEE_LINE}. Worth a conversation?</p>`,
  };
}

export interface Followup3Slots {
  businessName: string;
  caseStudiesLink: string;
}

// proof line is always the SSP line, per Lucky's explicit instruction to
// default here rather than track which line the initial used.
export function renderFollowup3Email(slots: Followup3Slots): RenderedEmail {
  return {
    subject: "worth a look",
    bodyHtml: `<p>Hey, last useful thing from me. ${SSP_LINE} If you want to see how that'd go for ${slots.businessName}, have a look here or just reply: <a href="${slots.caseStudiesLink}">${slots.caseStudiesLink}</a></p>`,
  };
}

export function renderFollowup4Email(): RenderedEmail {
  return {
    subject: "last one from me",
    bodyHtml: `<p>Hey, I'll stop clogging your inbox. If the calendar ever needs topping up, you know where I am.</p>`,
  };
}

export function renderCheckinEmail(): RenderedEmail {
  return {
    subject: "still around",
    bodyHtml: `<p>Hey, calendar filling up for the season or still got gaps?</p>`,
  };
}
