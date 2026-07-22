import Anthropic from "@anthropic-ai/sdk";
import { createSupabaseClient, fetchAllRows } from "./supabase";
import { EmailSend, EmailEvent } from "./types";

type SupabaseClient = ReturnType<typeof createSupabaseClient>;

// Below this many qualifying sends, any "pattern" found is just noise —
// leave whatever guidance already exists in place rather than overwrite it
// with a conclusion drawn from a handful of emails.
const MIN_SENDS = 5;

// This runs daily and previously fed in every step-tagged send ever, so the
// dataset (and the token cost of analyzing it) grew a little more every
// single day forever. Recent performance is what should drive the playbook
// anyway — capped to the most recent sends so the daily cost stays roughly
// flat instead of climbing with total send volume.
const MAX_SENDS_IN_DATASET = 150;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface SendPerformance {
  step: string;
  subject: string;
  bodyHtml: string;
  sentAt: string;
  opens: number;
  clicks: number;
  replied: boolean;
  booked: boolean;
}

// Regenerates the "what's working" playbook from real open/click/reply data
// and stores it for lib/ai.ts to inject into future generation prompts (see
// learningsBlock in lib/ai.ts) — called daily from
// app/api/cron/daily-maintenance/route.ts so guidance keeps adapting as more
// sends and engagement come in.
export async function generateEmailLearnings(sb: SupabaseClient): Promise<{ skipped: true; reason: string } | { skipped: false; basedOnSends: number }> {
  const [sends, events, leads] = await Promise.all([
    fetchAllRows<EmailSend>((from, to) => sb.from("email_sends").select("*").range(from, to)),
    fetchAllRows<EmailEvent>((from, to) => sb.from("email_events").select("*").range(from, to)),
    fetchAllRows<{ lead_id: string; status: string; email: string; company: string }>((from, to) => sb.from("leads").select("lead_id, status, email, company").range(from, to)),
  ]);

  const leadStatusById = new Map(leads.map((l) => [l.lead_id, l.status]));

  // Self-tests (sent to Lucky's own inbox to sanity-check copy before real
  // sends) get labeled "(TEST EMAIL, ignore)" in the company name by
  // convention — his own opens on those would otherwise masquerade as real
  // prospect engagement and skew the guidance toward whatever he happened to
  // click while testing, not what actually lands with a cold prospect.
  const ownAddress = (process.env.GMAIL_USER || "").toLowerCase();
  const testLeadIds = new Set(
    leads.filter((l) => l.company?.toLowerCase().includes("test email") || (ownAddress && l.email?.toLowerCase() === ownAddress)).map((l) => l.lead_id)
  );

  // Only sends whose step was actually recorded on their tracking links
  // (see lib/email.ts buildLinks) can be joined back to specific engagement —
  // older sends predate the step-tagged tracking URLs and are excluded here.
  const allQualifying = sends.filter((s) => s.step && !testLeadIds.has(s.lead_id));

  if (allQualifying.length < MIN_SENDS) {
    return { skipped: true, reason: `only ${allQualifying.length} step-tagged sends so far, need at least ${MIN_SENDS}` };
  }

  const qualifying = [...allQualifying]
    .sort((a, b) => b.sent_at.localeCompare(a.sent_at))
    .slice(0, MAX_SENDS_IN_DATASET)
    .reverse();

  const performance: SendPerformance[] = qualifying.map((send) => {
    const sendEvents = events.filter((e) => e.lead_id === send.lead_id && e.step === send.step);
    const status = leadStatusById.get(send.lead_id);
    return {
      step: send.step,
      subject: send.subject,
      bodyHtml: send.body_html,
      sentAt: send.sent_at,
      opens: sendEvents.filter((e) => e.event_type === "open").length,
      clicks: sendEvents.filter((e) => e.event_type === "click").length,
      replied: status === "replied" || status === "booked",
      booked: status === "booked",
    };
  });

  const dataset = performance
    .map(
      (p, i) =>
        `${i + 1}. [${p.step}] Subject: "${p.subject}" — ${p.opens} opens, ${p.clicks} clicks, replied: ${p.replied}, booked: ${p.booked}, sent: ${p.sentAt.split("T")[0]}\nBody:\n${p.bodyHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()}`
    )
    .join("\n\n");

  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: `You analyze real cold-outreach email performance for Lucky at LS Growth (trade-business lead gen agency) and write a short, practical playbook for what to do differently in future emails.

METRIC RULES — read carefully, this changed 2026-07-15:
- Reply rate (replied or booked) is the ONLY outcome that should drive any recommendation. An open or a click is not a result — a lead who opens and never replies has not been persuaded of anything, so a pattern that only correlates with opens/clicks is not a real finding.
- Opens and clicks may be mentioned as diagnostics (e.g. "this subject line got opened a lot but still didn't convert to a reply, so the opener/body is the likely problem, not the subject"), but never as the basis for a "this worked" conclusion on their own.
- If there are too few replies to say anything meaningful about what drives them, say exactly that — do not fall back to open/click patterns dressed up as a substitute finding.

Other rules:
- Base every claim on the actual data given — never invent a pattern that isn't visibly supported by multiple examples.
- With a small sample, say so explicitly rather than stating a weak pattern as if it were proven (e.g. "only one data point supports this, treat as a hunch not a rule").
- Do not suggest anything that contradicts the existing hard rules already baked into email generation (no invented facts, no process talk, no dashes) — you're tuning angle and style within those constraints, not overriding them.
- Output 3-6 short bullet points, plain text, no markdown headers, no preamble.`,
    messages: [
      {
        role: "user",
        content: `Here is every step-tagged email sent so far, with its actual engagement:\n\n${dataset}\n\nWrite the playbook.`,
      },
    ],
  });

  const block = msg.content[0];
  if (block.type !== "text") throw new Error("Unexpected response from AI");

  await sb.from("email_learnings").insert({
    guidance: block.text.trim(),
    based_on_sends: qualifying.length,
  });

  return { skipped: false, basedOnSends: qualifying.length };
}
