// Replays real historical lead-qual conversations through both Sonnet and
// Haiku at every user turn, and compares each model's next_action and
// extracted_fields against what actually happened (or, for Sonnet, against
// itself as a sanity check the harness is doing the comparison correctly).
// Purpose: decide whether runQualifyingTurn (lib/leadQual/ai.ts) can safely
// move from Sonnet to Haiku without hurting qualification accuracy, using
// real conversations instead of guessing. Read-only — never writes to the
// database, never sends a real message, never touches live traffic.
//
// Usage: node scripts/ab-test-qualifying-model.js [conversationLimit]
// Costs real Anthropic API money (2 models x N turns) — run it deliberately,
// not on a schedule. Requires ANTHROPIC_API_KEY / SUPABASE_URL /
// SUPABASE_SERVICE_ROLE_KEY in .env.local.

const fs = require("fs");
const path = require("path");

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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!process.env[key]) process.env[key] = value;
  }
}
loadEnv(".env.local");
loadEnv(".env.vercel.local");

const { createClient } = require("@supabase/supabase-js");
const Anthropic = require("@anthropic-ai/sdk").default;

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SONNET_MODEL = "claude-sonnet-4-5";
const HAIKU_MODEL = "claude-haiku-4-5-20251001";

// Mirrors buildSystemPrompt() in lib/leadQual/ai.ts. Kept as a plain-JS copy
// here (no ts-node/tsx in this repo to import the TS source directly from a
// script) — if the prompt in lib/leadQual/ai.ts changes, update this too so
// the comparison stays apples-to-apples.
function buildSystemPrompt(config) {
  const faqBlock = config.faqs.length
    ? config.faqs.map((f) => `Q: ${f.question}\nA: ${f.answer}`).join("\n\n")
    : "(none provided)";
  const responseCommitment = config.responseCommitment || "shortly";
  const isCleaningTrade = /clean/i.test(config.trade || "") || /clean/i.test(config.description || "");
  const propertySizeClause = isCleaningTrade
    ? " Then, straight after that and before asking anything else, ask how big the property is (how many bedrooms, or roughly how big for a commercial space) since you need that to quote it properly. This is property_size."
    : "";

  return `You are texting back on behalf of ${config.businessName}, a ${config.description || "local trade business"} — as if you're a real staff member replying on their phone, not a bot filling out a form.

Services offered: ${config.services.join(", ") || "(not specified)"}
Service areas: ${config.serviceAreas.join(", ") || "(not specified)"}
${config.proofPoint ? `Proof point you can mention if it fits naturally: ${config.proofPoint}` : ""}

Frequently asked questions you can answer directly:
${faqBlock}
${config.websiteContent ? `\nBackground pulled from the business's own website — use this for real specifics (exact services, area, tone) but never quote it verbatim or mention "the website":\n${config.websiteContent}\n` : ""}${config.extraContext ? `\nAdditional context from the business owner:\n${config.extraContext}\n` : ""}

YOUR JOB: have a warm, human, natural conversation with a lead who messaged in about a job — not an interrogation. Walk through these in order, one at a time, always reacting to what they just said before moving on — never dump two questions in one message:
1. job_type: what kind of job/service they need${propertySizeClause}
2. location: where the job is (suburb/area)
3. timeline: when they're hoping to get it done (their own words, e.g. "this week", "just researching", "ASAP")
4. quote_method: ask whether they'd like someone to come out and quote it in person, or whether a call to sort the quote over the phone works better for them
5. Depending on their answer to 4:
   - They want a call: confirm warmly that the team will call to sort the quote over the phone, then ask what time works best for that call. This time is callback_time.
   - They want someone to come out: ask what time works for someone to come round and quote it in person (this is visit_time). Once they give a time, also ask what time works for a quick call beforehand to confirm everything. This time is callback_time.
6. Accept whatever time reference they give as the callback_time (or visit_time) — a general answer like "tomorrow arvo", "sometime in the morning", or "after 3" is good enough, real people don't book exact minutes over text. Do NOT keep asking for a more precise time once they've given you a reasonable one — move straight to step 7 instead.
7. Once you have a callback_time, confirm it back to them warmly, e.g. "Perfect, I'll get the team to call you then to confirm everything." If it fits naturally, you can mention the team's real response commitment ("${responseCommitment}") so it feels concrete rather than vague.
8. Confirm their contact number. If a phone number already appears anywhere earlier in this conversation (e.g. they messaged in through a lead form that included one), quote that exact number back and ask if it's still the best one to call them on, e.g. "Just to confirm, is 021 123 4567 still the best number to call you on?" If they confirm it or give you a different number, that's their phone. If no phone number has appeared anywhere in the conversation, ask for one directly instead, e.g. "What's the best number to call you on?" Never skip this step.
9. Ask if there's anything else they want to know before you wrap up.
10. If they say no / have nothing else, close naturally and set next_action to "ready_for_qualification" — don't ask anything further. If they do ask something, answer it from the BUSINESS INFO above, then close the same way.

HOW TO SOUND HUMAN, NOT GENERIC:
- React to what they actually said before asking the next thing — acknowledge it like a person would ("Nice, a deep clean, no worries"), don't just march through a checklist.
- Use contractions, casual phrasing, and warmth. Skip corporate phrases like "Thanks for reaching out to X" — that's what a bot says. Never use stock phrases like "okay sweet" every single time — vary how you acknowledge things, same as a real person would.
- Never use a dash (either "-" or "—") in your reply_text. Real texts use full stops, commas, or just start a new sentence instead. Rewrite anything that would naturally use a dash.
- Vary your phrasing turn to turn. Never repeat the same sentence structure twice in a row.
- Keep messages short — 1-2 sentences, like a real text.
- If a proof point fits naturally (e.g. they mention urgency or ask if you're any good), drop it in casually — don't force it into every message.
- NEVER give a price yourself, at any point. Quotes are always given in person or over a phone call, never a number in the chat.

RULES:
- Only use the BUSINESS INFO above to answer questions. If asked something it doesn't cover, say a team member will follow up — never invent details, prices, or availability.
- Only set next_action to "ready_for_qualification" once you've been through the full sequence above (job_type, location, timeline, quote_method, a scheduled callback_time, a confirmed phone number, and you've asked if they have other questions). Don't close early.
- If the person seems confused, frustrated, or asks something you can't answer from the info above, set next_action to "needs_human".
- Otherwise, while you still need more info, set next_action to "continue".

Respond with ONLY a JSON object, no markdown fences, in this exact shape:
{"reply_text": "...", "extracted_fields": {"job_type": "..."${isCleaningTrade ? ', "property_size": "..."' : ""}, "location": "...", "timeline": "...", "quote_method": "phone" | "on_site", "visit_time": "...", "callback_time": "...", "phone": "..."}, "confidence": 0.0-1.0, "next_action": "continue" | "ready_for_qualification" | "needs_human"}

extracted_fields should only include fields you've actually learned so far — omit fields you don't know yet. confidence reflects how sure you are the extracted fields are accurate.`;
}

function parseJsonResponse(text) {
  const stripped = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  try {
    return JSON.parse(stripped);
  } catch {
    const match = stripped.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error(`Could not parse: ${text.slice(0, 200)}`);
  }
}

async function callModel(model, systemPrompt, history) {
  const lastIndex = history.length - 1;
  const start = Date.now();
  const res = await anthropic.messages.create({
    model,
    max_tokens: 500,
    system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
    messages: history.map((turn, i) => ({
      role: turn.role,
      content:
        i === lastIndex - 1
          ? [{ type: "text", text: turn.content, cache_control: { type: "ephemeral" } }]
          : turn.content,
    })),
  });
  const ms = Date.now() - start;
  const textBlock = res.content.find((b) => b.type === "text");
  let parsed;
  try {
    parsed = parseJsonResponse(textBlock.text);
  } catch (e) {
    parsed = { parseError: e.message, raw: textBlock.text.slice(0, 300) };
  }
  return { parsed, usage: res.usage, ms };
}

function fieldDiff(a, b) {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  const diffs = [];
  for (const k of keys) {
    const av = (a || {})[k];
    const bv = (b || {})[k];
    if (JSON.stringify(av) !== JSON.stringify(bv)) diffs.push(`${k}: real="${av ?? "?"}" haiku="${bv ?? "?"}"`);
  }
  return diffs;
}

async function loadClientConfig(clientId) {
  const { data: client } = await sb.from("lq_clients").select("name, trade, timezone").eq("id", clientId).single();
  const { data: configRow } = await sb
    .from("lq_client_configs")
    .select("*")
    .eq("client_id", clientId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const businessInfo = configRow?.business_info || {};
  return {
    businessName: client?.name || "the business",
    trade: client?.trade,
    description: businessInfo.description || client?.trade || "",
    services: configRow?.services || [],
    serviceAreas: configRow?.service_areas || [],
    faqs: configRow?.faqs || [],
    responseCommitment: businessInfo.response_commitment || "shortly",
    proofPoint: businessInfo.proof_point,
    websiteContent: businessInfo.website_content,
    extraContext: businessInfo.extra_context,
  };
}

async function main() {
  const convLimit = parseInt(process.argv[2] || "5", 10);

  // Pick recent, real, multi-turn conversations (at least 4 messages, i.e.
  // at least 2 full exchanges) — single-message conversations don't
  // exercise the "react to context" behavior this test cares about.
  const { data: conversations, error } = await sb
    .from("lq_conversations")
    .select("id, client_id, started_at")
    .order("started_at", { ascending: false })
    .limit(50);
  if (error) throw error;

  const candidates = [];
  for (const conv of conversations || []) {
    const { data: messages } = await sb
      .from("lq_messages")
      .select("role, content, structured_output, created_at")
      .eq("conversation_id", conv.id)
      .order("created_at", { ascending: true });
    if ((messages || []).filter((m) => m.role !== "system").length >= 4) {
      candidates.push({ conv, messages });
    }
    if (candidates.length >= convLimit) break;
  }

  if (!candidates.length) {
    console.log("No multi-turn lead-qual conversations found to replay. Nothing to compare yet.");
    return;
  }

  console.log(`Replaying ${candidates.length} real conversation(s) through Sonnet and Haiku...\n`);

  let totalSonnetTokens = 0;
  let totalHaikuTokens = 0;
  let agreeCount = 0;
  let compareCount = 0;

  for (const { conv, messages } of candidates) {
    const config = await loadClientConfig(conv.client_id);
    const systemPrompt = buildSystemPrompt(config);
    const turns = messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: m.content, structured_output: m.structured_output }));

    console.log(`=== Conversation ${conv.id} (${config.businessName}, ${turns.length} messages) ===`);

    for (let i = 0; i < turns.length; i++) {
      if (turns[i].role !== "user") continue;
      const history = turns.slice(0, i + 1).map((t) => ({ role: t.role, content: t.content }));
      // What actually happened: the real assistant reply that followed this
      // user message, if this conversation has one recorded.
      const realNext = turns[i + 1] && turns[i + 1].role === "assistant" ? turns[i + 1].structured_output : null;
      if (!realNext) continue; // conversation ended here, or a staff reply took over

      const [sonnet, haiku] = await Promise.all([
        callModel(SONNET_MODEL, systemPrompt, history),
        callModel(HAIKU_MODEL, systemPrompt, history),
      ]);

      totalSonnetTokens += (sonnet.usage.input_tokens || 0) + (sonnet.usage.output_tokens || 0);
      totalHaikuTokens += (haiku.usage.input_tokens || 0) + (haiku.usage.output_tokens || 0);
      compareCount++;

      const actionMatch = realNext.next_action === haiku.parsed.next_action;
      if (actionMatch) agreeCount++;
      const diffs = fieldDiff(realNext.extracted_fields, haiku.parsed.extracted_fields);

      console.log(`  Turn ${i + 1} — real next_action: ${realNext.next_action} | haiku: ${haiku.parsed.next_action} | sonnet(fresh): ${sonnet.parsed.next_action} ${actionMatch ? "MATCH" : "*** MISMATCH ***"}`);
      if (diffs.length) console.log(`    field diffs (real vs haiku): ${diffs.join("; ")}`);
      console.log(`    haiku reply: "${(haiku.parsed.reply_text || "").slice(0, 100)}"`);
    }
    console.log("");
  }

  console.log("=== Summary ===");
  console.log(`Turns compared: ${compareCount}`);
  console.log(`Haiku next_action matched real outcome: ${agreeCount}/${compareCount}`);
  console.log(`Total tokens — Sonnet: ${totalSonnetTokens}, Haiku: ${totalHaikuTokens}`);
  console.log(`Review any "*** MISMATCH ***" and field diffs above before deciding whether to switch runQualifyingTurn to Haiku in lib/leadQual/ai.ts.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
