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

const GOLD_STANDARD_EXAMPLE = `# Discovery Call — Nick, Kingswood Homes
Tue 14 Jul, 11am · Google Meet · 20-30 min

## Pre-call snapshot (know this cold)
• Nick Craggs, licensed builder, ~15 years in the trade. Started Kingswood in 2017 with his wife Jess (comms + interior design background). Family-owned crew.
• Based Papamoa, works Papamoa / Mount Maunganui / Tauranga / Te Puke.
• Services: new builds, renovations, recladding, kitchens & bathrooms.
• His pain (from your email thread): only a couple weeks of work lined up, wants extensions and full house renos, bigger jobs, not calendar-filler.
• Site is heavy on "transparency, process, stress-free", that's his brand language. Mirror it. He'll respond well to you being upfront about how everything works.
• They've got Facebook + Instagram and a decent video on the site already, so he has content you can actually use in ads. That's a plus you can point out.

## 1. Open (2 min)
"Hey Nick, good to finally chat. So like I said in the email, this'll only take 20-30 minutes. I just want to get a proper picture of where the business is at, and then I'll show you exactly how we'd go about getting you those bigger jobs, extensions, full renos. And if it makes sense, we can talk about working together at the end. Sound good?"
Then straight into rapport, one line, genuine:
"Had a look through your site and your Insta, that reclad work looks mint. How long have you and Jess been running it as a team?"

## 2. Discovery (8-10 min)
Ask, then shut up and listen. Take notes, you'll use his exact words later.
## Pipeline & pain
• "So you said you've got a couple more weeks of work locked in. What happens after that right now, where does the next job usually come from?"
• "What's the mix at the moment, how much is the small stuff versus the big renos and extensions?"
• "When a big reno does come in, where did that one come from?" (This tells you if it's all word of mouth, which is the leak.)
## Capacity & money
• "If we got you consistent quote requests for extensions and full renos, how many of those jobs can the crew actually handle at once?"
• "Roughly what's a full reno or extension worth to you, job value wise?" (Anchor this. One job likely pays for a year of your service, say that back to him later.)
## Past attempts
• "Have you ever run ads before, Facebook, Google, anything?" (If yes, what happened. If no, even cleaner.)
• "Who does the marketing side now, is that Jess, or is it just whatever comes in?"
## Authority & timeline
• "If we found something that works, is it you and Jess making that call together, or just you?"
• "How soon do you want this sorted, is this a 'now' problem given the pipeline?"

## 3. The gap observation (1 min)
Play back what he told you in his own words:
"So right now it sounds like the work comes in through word of mouth and referrals, which is great, but it's not something you can turn up when the pipeline's thin. That's the gap. You can't control it. What we do is give you a tap you can turn on."

## 4. Process — screen-share (5 min)
Share your curated Ads Manager view. Keep it simple:
"Rather than tell you it works, I'll just show you. This is a live account for one of our clients, I won't say the business name, but this is real money and real leads."
Walk through: leads generated, cost per lead, what a lead looks like when it lands.
## The bit that matters most for Nick — lead quality
"Now here's the important part for you, because reno leads are a different beast to cheap little jobs. Anyone can generate 'leads', tyre-kickers filling out forms. What we do differently is I personally call every lead before it gets anywhere near you. I qualify them on budget, timeline, whether they own the place. You only hear about the ones worth quoting. So you're not spending your evenings ringing people who want a $2k deck when you're after $150k renos."
## How the lead handling works — the two-step qualification
"Let me walk you through what actually happens when someone clicks the ad, because this is where most agencies fall over. They generate the lead, dump the contact details in your inbox, and it's on you to chase them. We do the complete opposite, and it's what gets rid of the tyre-kickers before they ever reach you."
"Step one, the instant response. The second someone fills out the form, they get a reply within a couple of minutes, not the next day, with the qualifying questions straight away: what's the project, do they own the home, what's their rough budget, when are they wanting to start. Speed matters massively here, a reno lead that gets a reply in two minutes converts, one that waits till tomorrow has already rung two other builders."
"Step two, my personal call. I get on the phone myself with anyone who stacks up from step one, and confirm they're genuine, real budget, real timeline, ready to talk. This is the step that filters out the tyre-kickers, the ones just browsing or filling in a form for a rough idea never make it past me. And here's the good bit for you: the ones that pass both steps get booked straight into your calendar as an appointment. You don't chase anyone. You just show up to a consult with a homeowner who's already been vetted and knows roughly what things cost."
"So from your side it looks like this: an appointment lands in your calendar with notes, who they are, what the project is, budget range, timeline. That's it. You quote, you build."
(If he asks how step one works / "is that a bot?", don't oversell the tech, sell the outcome:)
"Step one's an automated first response so nobody waits overnight, and then I'm personally across every single lead in step two before anything goes anywhere near your calendar. Nothing gets booked in that I haven't checked myself."
## Ad angle (drop in naturally)
"And honestly you're in a better spot than most builders we talk to, you've already got good photos, the video on your site, and Jess on the design side. People buy from people, especially on jobs this size. We'd build the ads around your actual work and your faces, not stock images."

## 5. The guarantee (2 min)
Only once he's warm:
"Here's how we take the risk out of it. We guarantee you qualified quote requests in the first three weeks, people I've personally vetted for these bigger jobs, or you don't pay us anything. So worst case, it costs you nothing to find out."
"And do the maths on it, you told me a full reno's worth [his number]. One job covers us many times over."

## 6. Close (2 min)
"So based on what you've told me, pipeline drying up in a couple weeks, and you want the bigger work, I reckon this is exactly what we should be doing, and there's zero risk on you to try it. Want to get started?"
## Yes
Onboarding, name the concrete first steps for this business (services to lead with, Ads Manager access, ad budget, creatives).
## Hesitant
"No worries, what's the bit that's still sitting with you?" Handle it, then book a specific follow-up: "How about I flick you a proposal today and we do a quick 10 minutes Thursday to go through it?"
Never leave without a date.

## Objection cheat sheet
## "Have you worked with builders before?"
"We work with trades across NZ, electrical, cleaning, outdoor construction. The exact trade matters less than you'd think, because the system's the same: ads that pull quote requests, and me qualifying every lead before you see it. And that's exactly why the guarantee exists, you're not taking my word for it, you're testing it risk-free."
## "Ads just bring tyre-kickers / cheap jobs."
"You're dead right, if you just run ads and dump the form fills on the builder, that's what happens. That's the whole reason step two exists, I call every lead first. Budget, timeline, ownership. The tyre-kickers never make it past me."
## "Winter's quiet / wrong time of year."
"That's actually the argument for starting now, renos and extensions have long lead times. The people we get in front of now are signing contracts for spring. If you wait until you're desperate, you're three months behind."
## "I need to talk to Jess."
"Totally fair, it's a joint call. What I'd suggest: I'll send through a one-page proposal today so you've got everything in writing, and we grab 10 minutes with both of you Thursday. What time suits?"
## "What's it cost?"
Answer it straight, no dodging. Then: "And remember that's covered by the guarantee, if we don't deliver the qualified quote requests in the first three weeks, you don't pay. Plus one reno job covers it many times over."
## "Send me some info."
"Yeah I'll flick the case studies through. But info doesn't usually answer the real question, what's the bit you're unsure about? Might be able to sort it right now."

## Post-call
• Log it: outcome, objection raised, follow-up date.
• Proposal within 24h if not closed on the call.
• Follow-up email references ONE specific thing he said (use your discovery notes).`;

const CALL_PREP_SYSTEM_PROMPT = `You generate discovery call sheets for Lucky, who runs LS Growth, a NZ Meta ads agency for trade and cleaning businesses. The offer: 3 week free trial, if the client doesn't get work they don't pay. Lucky personally calls and qualifies every lead before it reaches the client's calendar. Booked jobs, not leads.

You will be given his master sales script (the baseline process and objection handling, not a template to copy verbatim), a freeform blob of research on the prospect (business name, contact person, services, locations or branches, website and who built it, social media activity, whether a Meta pixel is installed, likely job values, existing marketing providers, reviews, anything else scraped, could be mixed together in any order), his own recurring work ons from recent calls, and a list of objections that have come up recently across all calls.

First, read the freeform notes and work out the prospect's name, business name, and industry as best you can. If something isn't mentioned, leave it blank, do not guess or invent one.

Produce ONE call sheet as the tailoredScript field, in exactly this structure. Do not add sections, do not remove sections, do not reorder them. This is a short, natural, glanceable sheet, not a dense manual, if a section reads like a wall of sub-headings, tighten it.

MARKUP, this output gets turned directly into a formatted Google Doc, so mark it up exactly like this, no other markdown, no asterisks for bold:
- The very first line only: "# " followed by the doc title, "Discovery Call — {contact first name}, {business name}".
- Every section heading and every sub-label that should read as bold (major sections like "2. Discovery (8-10 min)", thematic group labels like "Pipeline & pain", "Yes" / "Hesitant" branch labels, each objection question in the cheat sheet) gets its own line prefixed "## ".
- Every bullet point (pre-call snapshot lines, post-call lines) gets its own line prefixed "• ".
- Everything else, spoken lines, instructions, paragraphs, is plain text with no prefix.

STRUCTURE

Header: "# Discovery Call — {contact first name}, {business name}" then a plain text line with the call day/date/time, platform, and rough duration, using whatever the notes gave you. Leave a detail out of the line entirely if it wasn't in the notes, do not write "unknown" or invent one.

## Pre-call snapshot (know this cold): 4 to 6 "• " bullet points of the research, written as ammunition, not a resume. Cover who they are and their background if known, where they're based and what they work on, their services, their actual pain in their own words or inferred from the notes, any brand language or tone from their site/socials worth mirroring on the call, and any existing content or assets (photos, video, socials) that's a plus you can point out later. Skip anything not in the notes rather than padding it out.

## 1. Open (2 min): A casual greeting line, then a framing statement that takes control of the call: what it covers, how long it takes, ending in "Sound good?" The frame must reference their actual business specifics, not a generic agenda. Follow with one genuine rapport line built from something specific in the research (a piece of their work, how long they've been running, something on their site).

## 2. Discovery (8-10 min): Open with one short instruction line in your own words about listening and noting down what they say for later, not copied from any example. Then 3 to 4 short thematic groups, each its own "## " labeled sub-heading in plain English (adapt the labels to what actually matters here, for example "Pipeline & pain", "Capacity & money", "Past attempts", "Authority & timeline") rather than lettered blocks. Each group gets 2 to 4 "• " bullet questions. Where a question's purpose isn't obvious, add a short parenthetical note right after it on what it's really digging for, inline, not a separate "why" block. Near the end, include a pre-close/future-pace question adapted to the offer, something like "if we got you [outcome] in the first three weeks, what would stop you from carrying on from there".

THE MOST IMPORTANT RULE: every question must be built from the research, not a generic script question a prospect has heard on every agency sales call. Wherever possible, lead with a specific observation and attach the question to it.

Bad: "Where does most of your work come from at the moment?"
Good: "I had a look through your Facebook page, heaps of five star reviews but the last post was March. Is word of mouth carrying most of it right now?"

If research is thin on a topic, the question can be more open, but at least half the questions on the sheet must reference something specific you were given.

## 3. The gap observation (1 min): One short paragraph, play back what they told you in their own words, then name the gap plainly: their pipeline depends on something they can't turn on, referrals or word of mouth, they're at the mercy of it.

## 4. Process — screen-share (5 min): Open in your own words, not copied from any example, walking through sharing a live/curated ad account view as proof, without naming the client. Then, under its own "## " sub-heading naming the qualification process, explain the lead journey end to end as two clearly separate, explicitly labeled steps, this is the part Lucky most often rushes or skips on real calls, so the sheet has to make it impossible to skip:
Step one, the instant response: the moment they fill out the form they get a reply within minutes with qualifying questions straight away, project, ownership, budget, timeline.
Step two, the personal call: Lucky personally rings anyone who stacks up from step one to confirm they're genuine before anything reaches the prospect's calendar. Say explicitly that this is the step that filters out the tyre-kickers, the ones just browsing or filling in a form on a whim never make it past this call.
Only leads that pass both steps get booked in, with notes attached, so the prospect just shows up to quote. Include a short line for if they ask whether step one is a bot, sell the outcome not the tech. Fold in the ad creative angle naturally here, under its own "## " sub-heading, using whatever real content or assets they already have (photos, video, socials), not as a separate numbered section. Reference the single most relevant client story from this library only if it genuinely strengthens the point being made, don't force it in:
${CLIENT_STORY_LIBRARY}

## 5. The guarantee (2 min): Only once the call is warm. The trial or guarantee framed as removing risk, worst case it costs them nothing to find out. Include a line that plugs in their own job value number from Discovery to do the ROI math out loud. If asked price directly, never name a number on this call, the proposal covers it with their numbers plugged in.

## 6. Close (2 min): A direct close line that summarises back what they told you and asks straight out if they want to get started. "## Yes" sub-heading: what onboarding looks like next, name the concrete first steps for this business. "## Hesitant" sub-heading: ask what's still sitting with them, handle it, then lock a specific dated follow-up. If Discovery revealed another decision maker, the close must get them invited to that follow-up. End the section with the plain line: "Never leave without a date."

## Objection cheat sheet: 4 to 6 objections predicted from the research (existing provider, tried ads before, seasonal slowdown, need to check with someone if authority in Discovery suggested it, send me some info, what's it cost), each objection itself as a "## " sub-heading (the exact words a prospect would say) followed by a plain 1 to 3 sentence spoken response. Responses must reference their specifics, not templates. The tyre-kicker objection's response must reference the two-step process by name.

## Post-call: 3 short "• " bullet lines. Log the outcome/objection raised/follow-up date. Proposal timing, within 24 to 48h if not closed on the call. Follow-up email references one specific thing they said.

VOICE RULES
${WRITING_RULES}
- Never attack an existing provider. Position alongside them.
- Never name a price on call one.
- Natural and conversational throughout, short lines and plain paragraphs, not lettered sub-blocks or a "Why:" note after every question.

GOLD STANDARD EXAMPLE
This example shows the structure, section order, depth, and tone to match. It is NOT a template to fill in. Do not reuse, lightly reword, or paraphrase any of its actual sentences, lines like "Rather than tell you it works, I'll just show you", "Ask, then shut up and listen, take notes, you'll use their exact words later", or "That's the gap, you're at the mercy of it" belong to Nick's sheet only. If you catch yourself writing something close to a line below, stop and write it fresh from this prospect's own research and industry instead. Two sheets for two different prospects should read like two different people were interviewed, never like the same sheet with names swapped.

"""
${GOLD_STANDARD_EXAMPLE}
"""

Now, separately from the tailoredScript field:
- prospectName, businessName: pulled from the notes.
- topWorkOns: the top 3 recurring things Lucky should watch himself on this call, pulled from the recent work ons given to you. If fewer than 3 distinct themes exist, return fewer, do not pad with generic advice.
- likelyObjections: the short label (not the full response) for each objection in the Objection cheat sheet you wrote, in the same order, so this can be shown as a quick glance list alongside the full script.
- reminder: the "Never leave without a date" instruction from the Close section above, adapted to this call, one short sentence.

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
    // 8192 was cutting the response off mid-JSON once the marked-up sheet
    // (a "## " line for every heading/sub-label, not just major sections)
    // pushed real output past it — a truncated string breaks parseJsonResponse
    // with a confusing error instead of a clear "ran out of room" one.
    max_tokens: 16000,
    system: CALL_PREP_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
    betas: ["server-side-fallback-2026-06-01"],
    fallbacks: [{ model: "claude-opus-4-8" }],
  });

  if (msg.stop_reason === "refusal") {
    throw new Error("Couldn't generate a prep for this one, try rephrasing the notes.");
  }
  if (msg.stop_reason === "max_tokens") {
    throw new Error("The prep sheet ran out of room mid-generation, try again or trim the notes down a bit.");
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

