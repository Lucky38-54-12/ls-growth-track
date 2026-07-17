// The only proof strings and named case studies allowed anywhere in the
// email outreach system. Added 2026-07-15 after "Cooper Electrical" (a
// fabricated $80k case study) got baked into the old AI generation prompt
// and sent to real Wellington leads — every number and name below must be
// something Lucky has actually verified, and nothing else is allowed to
// stand in for a real proof point. If a proof point is added or changed,
// this is the only file that should need editing — lib/emailTemplates.ts
// and lib/ai.ts both import from here rather than hardcoding copies.

// Used to fill {matched job types} in the Perl initial/followup3 lines.
export const PERL_WHITELIST = ["heat pumps", "solar", "switchboard upgrades"] as const;
export type PerlJobType = (typeof PERL_WHITELIST)[number];

// $80k figure verified by Lucky 2026-07-16 (confirmed as a real, checkable
// number for Perl Electrical, not a guess) — replaces the earlier
// "fully booked for 2 months solid" wording as the locked Perl proof line.
//
// {matched job types} is a comma-joined subset of PERL_WHITELIST (max 3) —
// callers build the final sentence by joining PERL_LINE_PREFIX/SUFFIX around
// that list. Kept as prefix/suffix rather than one template string with a
// {matched job types} placeholder so there's no risk of a caller
// string-replacing the placeholder with something outside the whitelist.
export const PERL_LINE_PREFIX = "I did this for Perl Electrical, a national franchise, and got them ";
export const PERL_LINE_SUFFIX = " jobs worth over $80k.";

// Used when the confirmed job types don't intersect PERL_WHITELIST at all.
export const PERL_FALLBACK_LINE = "I did this for Perl Electrical, a national franchise, and got them heat pumps, solar, and switchboard upgrades jobs worth over $80k.";

// Used in follow-up 1, which restates the same $80k Perl result without a
// job-type slot.
export const PERL_FOLLOWUP_LINE = "same setup that got Perl Electrical over $80k of booked work";

// The solar-specific case study, used for the solar-heavy initial variant
// and as the fixed followup3 proof line (see lib/emailTemplates.ts — followup3
// always uses this one rather than tracking which line the initial used).
export const SSP_LINE = "We booked SSP Electrical over 2 months of solar jobs, $15k plus.";

// The only performance guarantee Lucky is willing to put in writing. Retired
// in favour of the 3-week free trial wording below, kept only so any old
// sent email referencing it is still recognised by the quality gate.
export const GUARANTEE_LINE = "if I don't get you at least 15 enquiries that turn into quotes, you don't pay a cent";

// The 3-week free trial guarantee (verified by Lucky 2026-07-16), used by
// the sparkies campaign. Two phrasings: the initial email's and follow-up
// 1's own restatement of it — both literal, locked copy.
export const GUARANTEE_LINE_INITIAL = "we run a 3 week free trial, if I can't get you work, you don't pay a cent";
export const GUARANTEE_LINE_FOLLOWUP1 = "the first 3 weeks are a free trial, if I can't get you any work you don't pay a cent and walk away";

// Every business/client name allowed to appear anywhere in a sent email.
// checkEmailQuality rejects any other named business as an invented case
// study (see lib/ai.ts).
export const ALLOWED_CASE_STUDY_NAMES = ["Perl Electrical", "SSP Electrical"] as const;

// checkEmailQuality rejects any dollar figure, percentage, or numeric result
// claim that isn't a substring of one of these sentences.
export const ALLOWED_PROOF_SENTENCES = [
  `${PERL_LINE_PREFIX}heat pumps, solar, switchboard upgrades${PERL_LINE_SUFFIX}`,
  PERL_FALLBACK_LINE,
  PERL_FOLLOWUP_LINE,
  SSP_LINE,
  GUARANTEE_LINE,
  GUARANTEE_LINE_INITIAL,
  GUARANTEE_LINE_FOLLOWUP1,
] as const;

export function buildPerlLine(matchedJobTypes: string[]): string {
  if (matchedJobTypes.length === 0) return PERL_FALLBACK_LINE;
  return `${PERL_LINE_PREFIX}${joinJobTypes(matchedJobTypes)}${PERL_LINE_SUFFIX}`;
}

function joinJobTypes(jobTypes: string[]): string {
  if (jobTypes.length === 1) return jobTypes[0];
  if (jobTypes.length === 2) return `${jobTypes[0]} and ${jobTypes[1]}`;
  return `${jobTypes.slice(0, -1).join(", ")}, and ${jobTypes[jobTypes.length - 1]}`;
}
