// One-time backfill: generates personalization_hook for any existing lead that
// doesn't have one yet (e.g. the 59 leads already in the queue before this
// feature existed).
//
// Run AFTER applying supabase_migration_personalization.sql in the Supabase
// SQL editor. Usage:
//   node scripts/backfill-personalization.js

const fs = require("fs");
const path = require("path");

// Minimal .env.local loader (no dotenv dependency needed)
function loadEnv(file) {
  const fullPath = path.join(__dirname, "..", file);
  if (!fs.existsSync(fullPath)) return;
  const lines = fs.readFileSync(fullPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv(".env.local");
loadEnv(".env.vercel.local"); // pulled via `vercel env pull` — has real production values

const { createClient } = require("@supabase/supabase-js");
const Anthropic = require("@anthropic-ai/sdk").default;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !ANTHROPIC_API_KEY) {
  console.error("Missing required env vars (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY). Check .env.local.");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You write ONE short sentence for a cold outreach email on behalf of Lucky from LS Growth, a company that runs done-for-you lead generation (ads, follow up, booking) for trade businesses in NZ and Australia.

You'll be given a business's name, trade, location, and what's known about their online presence (website, Facebook page, any notes). Write exactly one sentence that replaces a generic line like "I came across {company} and wanted to see if something similar could work for a {trade} business in {location}."

Rules:
- Reference something TRUE and SPECIFIC about this business's online presence — don't invent anything
- If they have no website: point out that's costing them search traffic to competitors who do have one
- If they have a Facebook page but no website: note the mismatch (decent social presence, but missing from Google searches)
- If they have both a website and Facebook: skip the gap-angle, just note you came across their business while looking at {trade} companies in {location}, naturally
- If real notes are provided (e.g. from a call), reference the most specific detail from them instead of the website/Facebook angle
- Sound like a real person noticed something, not a sales tool — casual, one sentence, no corporate phrases
- No dashes or em dashes
- Do NOT include a greeting, sign-off, or call to action — just the one sentence

Respond with ONLY the sentence text, no quotes, no JSON, no markdown.`;

async function generateHook(lead) {
  const userPrompt = `Business: ${lead.company}
Trade: ${lead.trade || "unknown"}
Location: ${lead.location || "unknown"}
Website: ${lead.website || "none found"}
Facebook: ${lead.facebook || "none found"}
Notes: ${lead.notes || "none"}`;

  const msg = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 256,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const block = msg.content[0];
  if (block.type !== "text") throw new Error("Unexpected AI response shape");
  return validateHook(block.text.trim());
}

// Guards against the model refusing (e.g. when call notes say the lead asked
// not to be contacted again) and returning a multi-paragraph explanation
// instead of a sentence. That text must never reach a live email.
function validateHook(text) {
  const tooLong = text.length > 280;
  const multiLine = text.includes("\n");
  const soundsLikeRefusal = /\b(i can't|i cannot|in good conscience|as an ai|i'm not able to|i won't)\b/i.test(text);
  if (tooLong || multiLine || soundsLikeRefusal) {
    throw new Error(`Hook failed validation, discarding: ${text.slice(0, 120)}`);
  }
  return text;
}

async function main() {
  const { data: leads, error } = await sb
    .from("leads")
    .select("lead_id, company, trade, location, website, facebook, notes, personalization_hook")
    .is("personalization_hook", null);

  if (error) {
    console.error("Failed to fetch leads:", error.message);
    process.exit(1);
  }

  console.log(`Found ${leads.length} lead(s) needing a personalization hook.\n`);

  let done = 0, failed = 0;
  for (const lead of leads) {
    try {
      const hook = await generateHook(lead);
      const { error: updateError } = await sb
        .from("leads")
        .update({ personalization_hook: hook })
        .eq("lead_id", lead.lead_id);
      if (updateError) throw updateError;
      done++;
      console.log(`✓ ${lead.company}: ${hook}`);
    } catch (err) {
      failed++;
      console.error(`✗ ${lead.company}: ${err.message || err}`);
    }
  }

  console.log(`\nDone. ${done} updated, ${failed} failed.`);
}

main();
