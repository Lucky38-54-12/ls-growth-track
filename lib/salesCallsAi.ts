import Anthropic from "@anthropic-ai/sdk";
import { stripDashes, parseJsonResponse } from "./ai";
import { CallOutcome, ScriptDiff } from "./types";

const WRITING_RULES = `Writing rules, no exceptions:
- Plain spoken New Zealand English. Write it the way Lucky would actually say it out loud on a call, never like written marketing copy.
- No dashes or em dashes anywhere. Use commas and full stops instead.
- Short sentences.
- No corporate filler. Never say things like "leverage", "circle back", "value proposition", "synergy", "reach out", "touch base", "solutions", "streamline".
- Never use "AI", "automation", or "system" as a selling point.
- Read every scripted line out loud in your head before writing it. If it reads like writing, rewrite it.`;

function client(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY env var is not set");
  return new Anthropic({ apiKey });
}

// ---------------------------------------------------------------------------
// 1. Parse a raw notetaker summary into structured call fields
// ---------------------------------------------------------------------------

export interface ParsedCall {
  call_date: string;
  prospect_name: string;
  business_name: string;
  outcome: CallOutcome;
  main_objection: string;
  next_step_booked: boolean;
  next_step_detail: string;
  went_well: string;
  work_ons: string;
}

const PARSE_SYSTEM_PROMPT = `You read raw notetaker summaries of sales calls for Lucky, who runs LS Growth, an agency that sells ad services (Meta ads, lead generation) to trade businesses (electricians, plumbers, builders, cleaners, etc).

Notetaker summaries sometimes swap or mislabel speaker names. Work out who is who from context, not from whatever label the notetaker used: Lucky is the one selling ad services, asking questions about their business and pitching LS Growth. The prospect is the one who runs the trade business and is being sold to. Use this to correctly attribute who said what, and to find the prospect's actual first name and business name even if the transcript labels are wrong or swapped.

Extract these fields from the summary:
- call_date: the date of the call if mentioned, in YYYY-MM-DD format. If not mentioned, use today's date given below.
- prospect_name: the prospect's first name.
- business_name: the name of the prospect's trade business.
- outcome: exactly one of "closed" (they signed up or agreed to pay), "follow_up" (a specific next call or action was booked), "undecided" (call ended with no clear next step and no decision), "dead" (they said no or are clearly not interested).
- main_objection: the main hesitation or pushback the prospect raised, in one plain sentence. Empty string if none came up.
- next_step_booked: true only if a specific next step was actually locked in (a date, a time, a concrete action both sides agreed to). False for anything vague like "I will think about it" or "call me sometime".
- next_step_detail: what that next step actually is, in one plain sentence. Empty string if next_step_booked is false.
- went_well: one or two short sentences on what Lucky did well on this call, from Lucky's side.
- work_ons: one or two short sentences on what Lucky should do differently next time, from Lucky's side. Be honest and specific, not generic.

${WRITING_RULES}

Respond with ONLY a JSON object, no markdown fences, no other text:
{"call_date": "", "prospect_name": "", "business_name": "", "outcome": "", "main_objection": "", "next_step_booked": false, "next_step_detail": "", "went_well": "", "work_ons": ""}`;

export async function parseCallSummary(rawSummary: string): Promise<ParsedCall> {
  const today = new Date().toISOString().split("T")[0];

  const msg = await client().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: PARSE_SYSTEM_PROMPT,
    messages: [{ role: "user", content: `Today's date: ${today}\n\nRaw call summary:\n"""\n${rawSummary}\n"""` }],
  });

  const block = msg.content[0];
  if (block.type !== "text") throw new Error("Unexpected response from AI");

  const parsed = parseJsonResponse<Partial<ParsedCall>>(block.text);

  const outcome: CallOutcome = ["closed", "follow_up", "undecided", "dead"].includes(parsed.outcome as string)
    ? (parsed.outcome as CallOutcome)
    : "undecided";

  return {
    call_date: parsed.call_date || today,
    prospect_name: parsed.prospect_name || "",
    business_name: parsed.business_name || "",
    outcome,
    main_objection: stripDashes(parsed.main_objection || ""),
    next_step_booked: !!parsed.next_step_booked,
    next_step_detail: stripDashes(parsed.next_step_detail || ""),
    went_well: stripDashes(parsed.went_well || ""),
    work_ons: stripDashes(parsed.work_ons || ""),
  };
}

// ---------------------------------------------------------------------------
// 2. Standing review: run the full pattern-tracking review across every
// logged call, not just the one that just landed. This is the automated
// version of the review Lucky asked to run after every call, permanently.
// ---------------------------------------------------------------------------

export interface StandingReviewCallRef {
  id: string;
  call_date: string;
  outcome: CallOutcome;
  main_objection: string;
  next_step_booked: boolean;
  next_step_detail: string;
  went_well: string;
  work_ons: string;
}

export interface StandingReviewPatternInput {
  id: string;
  pattern_summary: string;
  status: "open" | "closed";
  cost: "low" | "medium" | "high";
  occurrences: number;
  fix_applied_at: string | null;
  fix_landing_status: "untested" | "holding" | "not_landing";
}

export interface RankedPattern {
  matchesExistingPatternId: string | null;
  summary: string;
  cost: "low" | "medium" | "high";
  callIds: string[];
  status: "open" | "closed";
  isRepeat: boolean;
  closedReason: string;
}

export interface StandingReviewResult {
  rankedPatterns: RankedPattern[];
  needs_changes: boolean;
  summary: string;
  diffs: ScriptDiff[];
  new_content: string;
  fixesPatternSummary: string;
  decisionsToSurface: string[];
  fixNotLandingWarning: string;
}

const STANDING_REVIEW_SYSTEM_PROMPT = `You review Lucky's master sales script against his real logged call data. Lucky sells ad services (Meta ads, lead generation) to trade businesses. This runs automatically after every call he logs, permanently, whether he asks for it or not.

Rules, follow exactly, do not soften any of this:

1. Read every logged call given to you. Pull out recurring patterns: where in the call deals stall, which objections come up more than once, any point Lucky repeatedly struggles to explain or execute. Rank by how often they appear and how much they cost him, a miss that killed a close outranks a minor wording issue. A pattern needs at least two occurrences across different calls to count as a real pattern. Something that happened once is noise, not a pattern, note it but do not act on it yet.

2. For each pattern, check if the current script actually addresses it in a way that would change his behaviour on the call. Be strict. An instruction that exists but that a later call shows he still did not follow does NOT count as addressed. If he read the script and still made the mistake, the script did not catch him.

3. You are given the existing tracked pattern list (open and closed, with occurrence counts and whether a fix has already been applied). For each one, check if it shows up again in the calls given to you:
   - If it shows up again after a fix was already applied to the script (fix_applied_at is set), that is the headline. Say plainly this pattern has now happened more than once and the fix has not stopped it. Set fixNotLandingWarning to a direct plain sentence saying the fix is not landing and this looks like an execution problem under pressure, not a wording problem, then suggest something concrete and different, a mid-call checklist, a pre-call reminder, or a change to how he opens rather than how he closes. Do not just reword the script again for a pattern already flagged as not landing.
   - If it shows up again but no fix has been applied yet, it is still open, just now with another occurrence, and this is your top priority pattern this run, ranked above anything new.
   - If a pattern had a fix applied and none of the calls after that fix show it happening again, it can move to closed. Only close a pattern if there is at least one call logged after fix_applied_at that does not show the issue. Do not close a pattern just because a fix was made if no call has happened since.

4. Only propose script changes that fix a ranked pattern (two or more occurrences). Prioritise the single highest cost recurring pattern first. Do not add new sections for a problem that appeared once. Do not touch parts of the script that are working. Propose at most one change per run unless multiple patterns are both severe and unaddressed, and if you propose more than one, still rank them and say which is most urgent.

5. Anything Lucky struggles to execute under pressure should become something he can see and act on mid-call, a short checklist of concrete actions, not a paragraph of advice to remember. If an existing fix for a pattern is written as a paragraph and the pattern is about execution under pressure, sharpening it into a checklist counts as fixing it properly, reference the instruction fixing on instruction 5.

6. If a real gap has no fix in the current script, propose one. If the script already handles a pattern well, say so in your summary and leave that part alone.

Also flag anything the calls suggest Lucky should decide but has not, for example whether a guarantee number should flex by job size, or whether a different approach is needed for bigger or more intimidating prospects. Do not invent a decision for him, just surface it plainly in decisionsToSurface if the data actually points at one. Leave this empty if nothing genuinely comes up.

For every entry in rankedPatterns, set matchesExistingPatternId to the id of the existing tracked pattern it matches if one was given to you, or null if this is a brand new pattern not seen before. Set isRepeat to true only if this pattern has now happened in more than one call (including calls from before this run). Include every pattern you found, even single occurrence ones and even ones you are not proposing a fix for, so a full list can be shown. Set closedReason only when status is closed, explaining in one sentence which later call proves it is fixed.

${WRITING_RULES}

If needs_changes is true, also set fixesPatternSummary to the exact summary text (from rankedPatterns) of the single pattern these diffs address, so it can be linked up.

Respond with ONLY a JSON object, no markdown fences, no other text:
{"rankedPatterns": [{"matchesExistingPatternId": null, "summary": "", "cost": "low", "callIds": [], "status": "open", "isRepeat": false, "closedReason": ""}], "needs_changes": false, "summary": "one or two sentences on your overall assessment this run", "diffs": [{"before": "exact text from the current script being replaced", "after": "the replacement text", "reason": "one sentence tying this to the specific calls it came from"}], "new_content": "the full script with the diffs applied, or empty string if needs_changes is false", "fixesPatternSummary": "", "decisionsToSurface": [], "fixNotLandingWarning": ""}`;

export async function runStandingScriptReview(
  scriptContent: string,
  allCalls: StandingReviewCallRef[],
  existingPatterns: StandingReviewPatternInput[]
): Promise<StandingReviewResult> {
  const callsBlock = allCalls
    .map((c) => `Call ${c.id} (${c.call_date}):
Outcome: ${c.outcome}
Main objection: ${c.main_objection || "none"}
Next step booked: ${c.next_step_booked ? c.next_step_detail : "no"}
What went well: ${c.went_well || "none noted"}
Work ons: ${c.work_ons || "none noted"}`)
    .join("\n\n");

  const patternsBlock = existingPatterns.length
    ? existingPatterns
        .map((p) => `- id ${p.id}: "${p.pattern_summary}" | status ${p.status} | cost ${p.cost} | occurrences ${p.occurrences} | fix applied at ${p.fix_applied_at || "no fix applied yet"} | fix landing status ${p.fix_landing_status}`)
        .join("\n")
    : "none tracked yet, this is the first run";

  const userPrompt = `Current master script:
"""
${scriptContent}
"""

Every logged call, oldest first:
${callsBlock}

Existing tracked patterns from previous runs:
${patternsBlock}`;

  const msg = await client().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: STANDING_REVIEW_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const block = msg.content[0];
  if (block.type !== "text") throw new Error("Unexpected response from AI");

  const parsed = parseJsonResponse<Partial<StandingReviewResult>>(block.text);

  const rankedPatterns: RankedPattern[] = (parsed.rankedPatterns || []).map((p) => ({
    matchesExistingPatternId: p.matchesExistingPatternId || null,
    summary: stripDashes(p.summary || ""),
    cost: (["low", "medium", "high"].includes(p.cost as string) ? p.cost : "medium") as "low" | "medium" | "high",
    callIds: p.callIds || [],
    status: p.status === "closed" ? "closed" : "open",
    isRepeat: !!p.isRepeat,
    closedReason: stripDashes(p.closedReason || ""),
  }));

  const diffs = (parsed.diffs || []).map((d) => ({
    before: d.before || "",
    after: stripDashes(d.after || ""),
    reason: stripDashes(d.reason || ""),
  }));

  return {
    rankedPatterns,
    needs_changes: !!parsed.needs_changes && diffs.length > 0,
    summary: stripDashes(parsed.summary || ""),
    diffs,
    new_content: parsed.new_content ? stripDashes(parsed.new_content) : "",
    fixesPatternSummary: parsed.fixesPatternSummary || "",
    decisionsToSurface: (parsed.decisionsToSurface || []).map((s) => stripDashes(s)),
    fixNotLandingWarning: stripDashes(parsed.fixNotLandingWarning || ""),
  };
}

// ---------------------------------------------------------------------------
// 3. Generate a tailored call prep: prep card + tailored script
// ---------------------------------------------------------------------------

export interface CallPrepInput {
  notes: string;
  masterScript: string;
  recentWorkOns: string[];
  recentObjections: string[];
}

export interface CallPrepResult {
  prospectName: string;
  businessName: string;
  topWorkOns: string[];
  likelyObjections: string[];
  reminder: string;
  tailoredScript: string;
}

// Client story library for the proof-story section (call sheet section 3
// below) — spoken, verbal case studies used on discovery calls. Kept
// separate from lib/proofPoints.ts, which is the locked, written-word
// whitelist for cold outreach emails (added after a fabricated case study
// got sent to a real lead) — that file only has Perl and SSP verified for
// email copy. These five are Lucky's own verified call material; if he wants
// them usable in written outreach too, they need adding to proofPoints.ts
// separately, not assumed equivalent just because they're both "proof".
const CLIENT_STORY_LIBRARY = `- Perl Electrical: franchise electrical business, Christchurch region, 40+ qualified heat pump leads on about $450/month ad spend, $80k+ of jobs, conversation moved to expanding across their other companies
- SSP Electrical: booked 2+ months of solar jobs, $15k+
- Queenstown Cleaning: 30+ booked jobs a month for over a year, longest running client
- Jims Cleaning Dunedin: consistent work 7+ months and ongoing
- Fantastic Services`;

const GOLD_STANDARD_EXAMPLE = `Impact Outdoors, Discovery Call Sheet
Steenson D Silva. Tues 10:30am. Google Meet. 021 241 9388. steen@impactoutdoors.co.nz
Goal of this call: NOT to close. It's to (1) qualify him on authority, money, pain, and timeline, (2) plant the Perl Electrical parallel, and (3) lock a follow-up call where you close the pilot off the back of a proposal.

What you know going in
Premium outdoor living: canopies, auto louvres, metal pergolas, outdoor blinds, carports
Branches: Wellington, Christchurch, Tauranga (his), Dunedin, Auckland, plus service areas Napier/Hastings/Gisborne
Other companies sit under the group (per your notes, confirm structure on call)
High ticket, quote based jobs (likely $10k to $40k+), 36 month finance offered, that's an ad hook
Website by Digital Hub NZ, they do SEO blogs, existing digital provider, don't attack
Meta pixel installed on site, they've likely tried FB ads before
Their socials: consistent posting but static product images, no people

1. OPEN (1 to 2 min)
"Hey Steenson, thanks for jumping on. How's things up in Tauranga?"
Then take control:
"So just to frame this up, I know you've got Impact Outdoors in Tauranga, plus branches and other companies under the group across the country. What I want to do today is get a proper picture of how it all fits together, what's bringing in work right now, and then I'll show you how we'd approach getting more booked outdoor living jobs, first for one branch, and if the numbers stack up, across the group. Should take 20 to 30 minutes. Sound good?"

2. PRE-QUALIFICATION QUESTIONS (10 to 12 min, this is the call)
Work through these conversationally, not as an interrogation. Each one arms your close later.
A. AUTHORITY, can he say yes?
"Give me the lay of the land, which companies and branches sit under the group, and how does that work day to day?"
"Is marketing run centrally, or does each branch sort their own?"
"And something like bringing on an agency, is that your call, or who else would be in the room for that decision?"
(If others involved:) "Would it make sense to have them on the follow-up when I walk through the proposal?"
Why: If he's not sole decision maker, you want the real decision makers on call two, never let him pitch you second hand. Q4 gets them there without challenging his status.
B. PAIN, where does it hurt?
"Where's most of the work coming from right now, referrals, website, word of mouth, ads?"
"Which branches are flat out, and which ones could take on more work tomorrow?"
"Have you run Facebook or Instagram ads before? How'd that go?"
(If ads flopped:) "What did the campaigns look like, and when a lead came in, how quickly was someone ringing them back?"
"What happens in winter, do enquiries dry right up, or does the year round outdoor living angle still pull people in?"
Why: Q6 tells you which branch to propose as the pilot, pitch the hungry one, not the busy one. Q7 to Q8 tells you whether you're selling "ads work, they were just done badly", the easiest reframe in the game. Q9 gives you the urgency angle: installs booked now finish before summer.
C. MONEY, do the economics work?
"Rough average job value on a canopy or louvre install?"
"When someone requests a quote, roughly what percentage turn into a job?"
"How many quotes could a branch handle per week before the team's maxed out?"
"Have you got a rough sense of what you'd be comfortable investing in marketing if the return was there, per branch or across the group?"
Why: Q10 plus Q11 is your ROI math for the close ("if a job's worth $20k and you close 1 in 3 quotes, ten qualified quote requests is roughly three jobs, $60k of work"). Q12 stops you overpromising volume. Q13 flushes out budget without naming your price first.
D. TIMELINE AND COMMITMENT, will he move?
"If we got the lead flow humming for one branch, how quickly would you want to look at rolling it out to the others?"
"Is growing the group's job volume a priority for this year, or more of a nice to have?"
The money question, ask this near the end: "Say we run a pilot and in three weeks you've got 10 plus qualified quote requests sitting in front of you. What, if anything, would stop you from expanding it out from there?"
Why: Q14 future paces the rollout so the multi branch deal feels like his idea. Q16 is the pre close, whatever he says here is the objection you'll face on call two, so you get to handle it now or address it head on in the proposal.

3. THE PERL ELECTRICAL STORY (3 to 4 min)
Deliver as a story, tied to whatever pain he revealed:
"So the reason I was keen on this chat, this is really similar to work we've done before. We worked with Perl Electrical, a franchise electrical business in the Christchurch region. Same kind of setup as you guys, multiple operations under one banner. We ran Meta campaigns for them and generated over 40 qualified heat pump leads on about $450 a month in ad spend. Booked jobs, not just clicks. And off the back of those results, the conversation moved to expanding across their other companies too, because once the campaign structure works in one region, rolling it out is the easy part. Duplicate the system, localise the creative and targeting, and each branch gets its own pipeline.
"Honestly, your product suits this even better than electrical, high ticket installs, strong visuals, and that 36 month finance option is a massive ad hook. 'Get your canopy now from $X a week', that angle performs really well on Meta."
Retention proof if asked about track record: "Our longest running client, Queenstown Cleaning, 30 plus booked jobs a month for over a year now. When it works, clients stay."

4. THE CONTENT OBSERVATION (1 to 2 min)
Drop this after the Perl story, never before discovery:
"One thing I noticed going through your pages, and this goes for the other companies under the group too, you're already posting consistently, which is great, most trade businesses don't even manage that. But it's mostly static product shots. What's missing is people. Someone about to spend twenty plus grand on a canopy wants to see the team turning up to their house, the customer standing under their new louvre in the middle of winter, the install actually happening. People buy from people. And that's exactly the content that performs best in paid ads, static images get scrolled past, a 20 second clip of a real install stops the thumb."
If he asks what that looks like: "Super simple, phone shot video of an install in progress, a quick before and after, the customer saying two sentences. We script it, your guys film 30 seconds on site, we cut it into ad creative. The ads with real people consistently outperform the polished stuff."

5. THE VISION, PILOT THEN ROLLOUT (2 to 3 min)
Plug in the branch HE said was hungriest (Q6):
"So here's how I'd approach it. Don't do all five branches at once. Start with [branch], you said they could take on more work. We run focused campaigns per product line, canopies, louvres, pergolas, with lead forms that qualify people: homeowner, timeline, interest in finance. Your team only calls people genuinely in the market. We prove the numbers over the first month, then take the exact playbook branch by branch, local targeting, local creative, local numbers. Each branch gets its own pipeline without reinventing anything."

6. THE OFFER (only if the call is warm)
"And to make the pilot a no brainer: if we don't get you 10 plus qualified quote requests in the first three weeks, you don't pay. At your job values, [use his numbers from Q10/Q11], even one closed install covers it many times over."
If he asks price directly: "Depends which branch and how many product lines we run, that's exactly what the proposal covers. I'll have real numbers in front of you within 48 hours."

7. CLOSE THE NEXT STEP (1 to 2 min)
"Steenson, this has been really useful. Here's what I'll do, I'll put together a short proposal for the pilot: which branch, which product lines, campaign structure, and the numbers, and have it to you within 48 hours. Then let's jump on a quick 15 minute call to walk through it. What does Thursday or Friday look like?"
Lock a specific time before you hang up. "I'll email you a summary" is where deals go to die. And per Q4, if there are other decision makers, get them invited to that call.

OBJECTION CHEAT SHEET
"We already have an agency (Digital Hub)." Response: "They do your website and SEO, totally different job. We're the booked jobs side. They keep doing what they're doing, we run paid lead gen alongside it."
"We tried Facebook ads, didn't work." Response: "That's actually really common, and it's almost never that ads don't work for this product, it's targeting, creative, or nobody ringing the lead back within the hour. What did the follow up look like when a lead came in?"
"Winter's slow, let's talk in spring." Response: "Spring is when every competitor starts advertising and costs spike. Book installs now, they're done before summer, and the 'enjoy your patio all winter' angle is exactly what louvres and canopies solve."
"Send me some info." Response: "Happy to, and rather than a generic PDF, let me build the proposal around your actual numbers and we'll walk through it Thursday. That way it's worth your time."
"What's it cost?" Response: Never name a number on this call. "That's what the proposal answers, with your branch and product lines plugged in."

POST-CALL (same day)
Send a 3 line recap email: thanks, one thing he said that you're building the proposal around, and confirming the follow up time.
Note his answers to Q10 to Q13, they're the spine of the proposal ROI math.
Whatever he said at Q16, address it head on in the proposal, don't wait for him to raise it again.`;

const CALL_PREP_SYSTEM_PROMPT = `You generate discovery call sheets for Lucky, who runs LS Growth, a NZ Meta ads agency for trade and cleaning businesses. The offer: 3 week free trial, if the client doesn't get work they don't pay. Lucky personally calls and qualifies every lead before it reaches the client's calendar. Booked jobs, not leads.

You will be given his master sales script (the baseline process and objection handling, not a template to copy verbatim), a freeform blob of research on the prospect (business name, contact person, services, locations or branches, website and who built it, social media activity, whether a Meta pixel is installed, likely job values, existing marketing providers, reviews, anything else scraped, could be mixed together in any order), his own recurring work ons from recent calls, and a list of objections that have come up recently across all calls.

First, read the freeform notes and work out the prospect's name, business name, and industry as best you can. If something isn't mentioned, leave it blank, do not guess or invent one.

Produce ONE call sheet as the tailoredScript field, in exactly this structure. Do not add sections, do not remove sections, do not reorder them.

STRUCTURE

Header: Business name, contact, call time if known, platform, phone, email. Use whatever the notes gave you, leave a field out of the line entirely if it wasn't in the notes, do not write "unknown" or invent one.

Goal of this call: One line. The goal is never to close on call one. It is to qualify on authority, money, pain and timeline, plant the most relevant proof story, and lock a specific follow-up call before hanging up.

What you know going in: 5 to 8 bullet points of the research, written as ammunition. Flag anything that becomes an ad hook (finance options, high ticket jobs, seasonal angles), anything that signals they've tried ads before (pixel installed), and any existing provider so Lucky knows not to attack them.

1. OPEN (1 to 2 min): A casual greeting line, then a framing statement that takes control of the call: what we'll cover, how long it takes, ending in "Sound good?" The frame must mention their actual business specifics, not a generic agenda.

2. PRE-QUALIFICATION QUESTIONS (10 to 12 min): Four blocks: A Authority, B Pain, C Money, D Timeline and Commitment. 3 to 5 questions per block. After each block, a short "Why" note explaining what the answers arm Lucky with for the close.

THE MOST IMPORTANT RULE: every question must be built from the research. No question may be one a prospect has heard on every agency sales call. Wherever possible, lead with a specific observation and attach the question to it.

Bad: "Where does most of your work come from at the moment?"
Good: "I had a look through your Facebook page, heaps of five star reviews but the last post was March. Is word of mouth carrying most of it right now?"

Bad: "What kind of jobs do you want more of?"
Good: "You list heat pumps and switchboard upgrades on the site. Are those the money jobs, or are you chasing the bigger installs?"

If research is thin on a topic, the question can be more open, but at least half the questions on the sheet must reference something specific you were given.

Always include, near the end of block D, the pre-close question: "Say we run the trial and in three weeks you've got 10 plus qualified quote requests in front of you. What, if anything, would stop you from carrying on from there?" With a why note: whatever they answer is the objection on call two, handle it now or in the proposal.

3. THE PROOF STORY (3 to 4 min): Pick the ONE most relevant client from this library and write it as a spoken story tied to the prospect's likely pain, with real numbers:
${CLIENT_STORY_LIBRARY}
Match by trade first, structure second (multi branch prospect gets a multi branch story). End the story by connecting it to why this prospect's product suits Meta even better, naming their specific hook.

4. THE CONTENT OBSERVATION (1 to 2 min): One genuine observation about their current social content, delivered after the proof story never before. Usually the gap is people: static product shots instead of real installs, real customers, the team on site. Adapt it to what their pages actually show. Include the short "if he asks what that looks like" answer: we script it, your guys film 30 seconds on a phone, we cut it into ad creative.

5. THE VISION (2 to 3 min): How the trial works for THEIR business. If multi branch, pilot one branch (the one they said is hungriest) then roll out. If single location, focus campaigns on their highest value job types with lead forms that qualify homeowner, timeline, budget signals, and Lucky calling every lead before it hits their calendar.

6. THE OFFER (only if the call is warm): The trial framed as a no brainer: 10 plus qualified quote requests in three weeks or you don't pay. Include a line that plugs in their own job value numbers from block C to do the ROI math out loud. If asked price directly: never name a number on this call, the proposal covers it with their numbers plugged in.

7. CLOSE THE NEXT STEP (1 to 2 min): Word for word close that locks a specific follow-up time or a live action (Facebook page access request sent on the call, photos, kick off booked) before hanging up. Include the reminder line: "I'll email you a summary" is where deals go to die. If block A revealed other decision makers, the close must get them invited to call two.

OBJECTION CHEAT SHEET: 4 to 6 objections predicted from the research (existing provider, tried ads before, seasonal slowdown, send me some info, what's it cost) each with a 1 to 3 sentence spoken response. Responses must reference their specifics, not templates.

POST-CALL (same day): 3 line recap email instruction, note which question answers form the proposal ROI math, and address the pre-close answer head on in the proposal.

VOICE RULES
${WRITING_RULES}
- Never attack an existing provider. Position alongside them.
- Never name a price on call one.
- Keep the whole sheet tight enough to glance at mid call. Bullet points and short lines, not paragraphs.

GOLD STANDARD EXAMPLE
Match this example's structure, depth, tone and level of personalisation exactly. Every sheet you produce should feel like this one, just built from the new prospect's research.

"""
${GOLD_STANDARD_EXAMPLE}
"""

Now, separately from the tailoredScript field:
- prospectName, businessName: pulled from the notes.
- topWorkOns: the top 3 recurring things Lucky should watch himself on this call, pulled from the recent work ons given to you. If fewer than 3 distinct themes exist, return fewer, do not pad with generic advice.
- likelyObjections: the short label (not the full response) for each objection in the OBJECTION CHEAT SHEET you wrote, in the same order, so this can be shown as a quick glance list alongside the full script.
- reminder: the "I'll email you a summary" line from the CLOSE THE NEXT STEP section above, adapted to this call, one short sentence.

Respond with ONLY a JSON object, no markdown fences, no other text:
{"prospectName": "", "businessName": "", "topWorkOns": [], "likelyObjections": [], "reminder": "", "tailoredScript": ""}`;

export async function generateCallPrep(input: CallPrepInput): Promise<CallPrepResult> {
  const userPrompt = `Master script:
"""
${input.masterScript}
"""

What Lucky knows about this prospect, freeform:
"""
${input.notes || "nothing, this is a cold booking with no details"}
"""

Lucky's recent work ons (most recent first):
${input.recentWorkOns.length ? input.recentWorkOns.map((w) => `- ${w}`).join("\n") : "none logged yet"}

Objections that have come up recently across all calls:
${input.recentObjections.length ? input.recentObjections.map((o) => `- ${o}`).join("\n") : "none logged yet"}`;

  // Fable 5: Anthropic's most capable model, used here since this is the one
  // call that has to both synthesise a prospect's likely objections and write
  // a full tailored script from it. Its safety classifiers occasionally
  // false-positive on ordinary business content, so this ships with the
  // recommended server-side fallback to Opus 4.8 rather than failing the
  // whole prep on a refusal.
  const msg = await client().beta.messages.create({
    model: "claude-fable-5",
    max_tokens: 8192,
    system: CALL_PREP_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
    betas: ["server-side-fallback-2026-06-01"],
    fallbacks: [{ model: "claude-opus-4-8" }],
  });

  if (msg.stop_reason === "refusal") {
    throw new Error("Couldn't generate a prep for this one, try rephrasing the notes.");
  }

  const block = msg.content.find((b) => b.type === "text");
  if (!block) throw new Error("Unexpected response from AI");

  const parsed = parseJsonResponse<Partial<CallPrepResult>>(block.text);

  return {
    prospectName: parsed.prospectName || "",
    businessName: parsed.businessName || "",
    topWorkOns: (parsed.topWorkOns || []).map((s) => stripDashes(s)),
    likelyObjections: (parsed.likelyObjections || []).map((s) => stripDashes(s)),
    reminder: stripDashes(parsed.reminder || "Lock in a concrete next step before you hang up."),
    tailoredScript: stripDashes(parsed.tailoredScript || input.masterScript),
  };
}

