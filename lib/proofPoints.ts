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

// {matched job types} is a comma-joined subset of PERL_WHITELIST (max 3) —
// callers build the final sentence by joining PERL_LINE_PREFIX/SUFFIX around
// that list. Kept as prefix/suffix rather than one template string with a
// {matched job types} placeholder so there's no risk of a caller
// string-replacing the placeholder with something outside the whitelist.
export const PERL_LINE_PREFIX = "We got Perl Electrical fully booked for 2 months solid with ";
export const PERL_LINE_SUFFIX = ".";

// Used when the confirmed job types don't intersect PERL_WHITELIST at all.
export const PERL_FALLBACK_LINE = "We got Perl Electrical fully booked for 2 months solid, everything from heat pumps to switchboard upgrades.";

// The solar-specific case study, used for the solar-heavy initial variant
// and as the fixed followup3 proof line (see lib/emailTemplates.ts — followup3
// always uses this one rather than tracking which line the initial used).
export const SSP_LINE = "We booked SSP Electrical over 2 months of solar jobs, $15k plus.";

// The only performance guarantee Lucky is willing to put in writing.
export const GUARANTEE_LINE = "if I don't get you at least 15 enquiries that turn into quotes, you don't pay a cent";

// Every business/client name allowed to appear anywhere in a sent email.
// checkEmailQuality rejects any other named business as an invented case
// study (see lib/ai.ts).
export const ALLOWED_CASE_STUDY_NAMES = ["Perl Electrical", "SSP Electrical"] as const;

// checkEmailQuality rejects any dollar figure, percentage, or numeric result
// claim that isn't a substring of one of these three sentences.
export const ALLOWED_PROOF_SENTENCES = [
  `${PERL_LINE_PREFIX}heat pumps, solar, switchboard upgrades${PERL_LINE_SUFFIX}`,
  PERL_FALLBACK_LINE,
  SSP_LINE,
  GUARANTEE_LINE,
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
