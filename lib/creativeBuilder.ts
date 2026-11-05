import type { SupabaseClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { getAdLearningsForClient } from "./adLearnings";

export type OptionCategory = "offer" | "angle" | "hook" | "style";

export interface CreativeBuilderOption {
  id: string;
  client_id: string;
  category: OptionCategory;
  label: string;
  subtext: string | null;
  sort_order: number;
}

export interface CreativeBuilderCombo {
  id: string;
  client_id: string;
  service: string | null;
  offer: string | null;
  customer_reason: string | null;
  hypothesis: string | null;
  angle: string | null;
  hook: string | null;
  style: string | null;
  notes: string | null;
  status: "idea" | "shooting" | "live" | "tested";
  script: string | null;
  script_status: "none" | "drafted" | "approved";
  design_brief: { headline: Record<string, string>; primaryText: string; cta: string } | null;
  design_preview_url: string | null;
  design_preview_status: "none" | "queued" | "drafted" | "approved";
  video_status: "none" | "queued" | "rendering" | "ready";
  video_url: string | null;
  launch_status: "none" | "pending" | "launched";
  meta_ad_id: string | null;
  meta_ad_set_id: string | null;
  launched_at: string | null;
  created_at: string;
}

// Default library, taken directly from the Cleaning Creative Angle
// Framework doc — used only to seed a brand new client's option lists the
// first time they're loaded (see getOptionsForClient). Every client then
// owns and edits their own copy independently.
const DEFAULT_SEED: { category: OptionCategory; label: string; subtext: string }[] = [
  { category: "offer", label: "First Clean Special", subtext: "e.g. $50 off first clean — simple, but overused now" },
  { category: "offer", label: "Limited Time Discount", subtext: "e.g. 15% off for spring clean — good for seasonal pushes" },
  { category: "offer", label: "Free Add-On", subtext: "book a full clean, get the oven cleaned free — feels more valuable than a discount" },
  { category: "offer", label: "Move-Out Guarantee", subtext: "move-out clean with a satisfaction guarantee — solves a very specific problem" },
  { category: "offer", label: "Same-Week Clean", subtext: "\"3 spots available this week\" — urgency without fake scarcity" },
  { category: "offer", label: "Recurring Upgrade", subtext: "book your first 3 cleans, get a free deep-clean add-on — encourages recurring revenue" },
  { category: "offer", label: "Landlord Package", subtext: "end-of-tenancy clean + inspection-ready guarantee — targets a high-intent customer" },
  { category: "offer", label: "Spring/Seasonal", subtext: "full-home deep clean + windows — gives the campaign a reason to exist" },
  { category: "offer", label: "Guarantee", subtext: "\"if we miss something, we'll come back and fix it free\" — removes risk" },
  { category: "offer", label: "Bundle", subtext: "full house + oven + inside windows for $X — increases perceived value and AOV" },

  { category: "angle", label: "Time", subtext: "focus on the time they get back by outsourcing the cleaning" },
  { category: "angle", label: "Results", subtext: "show what they're actually getting — dirty to spotless transformation" },
  { category: "angle", label: "Convenience", subtext: "eliminate the work/hassle — book it, we handle the rest" },
  { category: "angle", label: "Stress", subtext: "remove another responsibility from an already-busy life" },
  { category: "angle", label: "Lifestyle", subtext: "focus on what they can do instead of cleaning" },
  { category: "angle", label: "Quality", subtext: "the difference between DIY and a professional result" },

  { category: "hook", label: "Stop spending your Saturday cleaning.", subtext: "time / getting their life back" },
  { category: "hook", label: "This was the kitchen before we touched it.", subtext: "results / transformation" },
  { category: "hook", label: "Still cleaning the same mess every weekend?", subtext: "pain / frustration" },
  { category: "hook", label: "Most homeowners forget to clean THIS.", subtext: "curiosity" },
  { category: "hook", label: "Not all cleaning companies are the same.", subtext: "competitive / why us" },
  { category: "hook", label: "Moving out? Don't leave this until the last day.", subtext: "situation-based" },
  { category: "hook", label: "Open cold on a disgusting oven → spotless oven, no words.", subtext: "strong visual hook, no copy needed" },

  { category: "style", label: "Founder-led", subtext: "owner talking to camera" },
  { category: "style", label: "Client testimonial", subtext: "customer explaining their experience" },
  { category: "style", label: "Before & After", subtext: "show the transformation" },
  { category: "style", label: "UGC", subtext: "casual, customer-style video" },
  { category: "style", label: "Service demo", subtext: "show the cleaners doing the work" },
  { category: "style", label: "Voiceover + B-roll", subtext: "voiceover with cleaning footage" },
  { category: "style", label: "POV", subtext: "\"POV: you booked a cleaner instead\"" },
  { category: "style", label: "Problem → Solution", subtext: "show the problem, then the result" },
  { category: "style", label: "Review / Social proof", subtext: "reviews, ratings, screenshots" },
];

// Auto-seeds this client's option library from DEFAULT_SEED the first time
// it's empty, then always returns whatever's actually stored for THIS
// client — so later edits/deletes are per-client and never touch the seed
// or any other client's list.
export async function getOptionsForClient(sb: SupabaseClient, clientId: string): Promise<CreativeBuilderOption[]> {
  const { data: existing, error } = await sb
    .from("creative_builder_options")
    .select("*")
    .eq("client_id", clientId)
    .order("category")
    .order("sort_order");
  if (error) throw new Error(error.message);
  if (existing && existing.length > 0) return existing;

  const rows = DEFAULT_SEED.map((o, i) => ({ client_id: clientId, category: o.category, label: o.label, subtext: o.subtext, sort_order: i }));
  const { data: seeded, error: seedError } = await sb.from("creative_builder_options").insert(rows).select("*");
  if (seedError) throw new Error(seedError.message);
  return seeded || [];
}

export async function addOption(sb: SupabaseClient, clientId: string, category: OptionCategory, label: string, subtext: string | null): Promise<CreativeBuilderOption> {
  const { data, error } = await sb
    .from("creative_builder_options")
    .insert({ client_id: clientId, category, label, subtext, sort_order: 999 })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteOption(sb: SupabaseClient, id: string): Promise<void> {
  const { error } = await sb.from("creative_builder_options").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function getCombosForClient(sb: SupabaseClient, clientId: string): Promise<CreativeBuilderCombo[]> {
  const { data, error } = await sb
    .from("creative_builder_combos")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function saveCombo(sb: SupabaseClient, clientId: string, combo: { service?: string | null; offer?: string | null; customer_reason?: string | null; hypothesis?: string | null; angle?: string | null; hook?: string | null; style?: string | null; notes?: string | null }): Promise<CreativeBuilderCombo> {
  const { data, error } = await sb
    .from("creative_builder_combos")
    .insert({ client_id: clientId, ...combo })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateComboStatus(sb: SupabaseClient, id: string, status: CreativeBuilderCombo["status"]): Promise<CreativeBuilderCombo> {
  const { data, error } = await sb.from("creative_builder_combos").update({ status }).eq("id", id).select("*").single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteCombo(sb: SupabaseClient, id: string): Promise<void> {
  const { error } = await sb.from("creative_builder_combos").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// Script-first, by Lucky's explicit rule: this only ever drafts a VO script
// and holds it on the combo for him to read/edit/approve — it never touches
// HyperFrames or any render pipeline. That's a later, separate step gated
// on script_status = "approved".
export async function draftScriptForCombo(sb: SupabaseClient, comboId: string): Promise<CreativeBuilderCombo> {
  const { data: combo, error: comboError } = await sb.from("creative_builder_combos").select("*").eq("id", comboId).maybeSingle();
  if (comboError || !combo) throw new Error(`Unknown combo id "${comboId}"`);

  const { data: client } = await sb.from("lq_clients").select("id, name, trade").eq("id", combo.client_id).maybeSingle();
  if (!client) throw new Error(`Combo's client_id "${combo.client_id}" not found`);

  const learnings = await getAdLearningsForClient(sb, combo.client_id, 10).catch(() => []);
  const learningsSummary = learnings
    .map((l) => `- [${l.status}${l.confidence ? `, ${l.confidence}` : ""}] angle: ${l.angle || "n/a"} / hook: ${l.hook || "n/a"}: ${l.observed}${l.inference ? ` → ${l.inference}` : ""}`)
    .join("\n") || "No banked ad learnings yet for this client.";

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY env var is not set");
  const anthropic = new Anthropic({ apiKey });

  const systemPrompt = `You write voiceover scripts for short (15-30 second) direct-response video ads for New Zealand trade/home-service businesses, built to be shot and rendered as a real ad, not read as marketing copy.

Write for the END CUSTOMER watching the ad (a homeowner, tenant, landlord etc.) — never for the business owner, and never in the agency's own voice.

Rules:
- Spoken, not written. Short sentences, contractions, the way someone actually talks.
- Open with the hook in the first 2-3 seconds. No throat-clearing, no "hey guys".
- Structure: hook → problem/situation → how the service solves it → the offer → a direct call to action.
- One clear offer and one clear CTA. No stacking multiple offers.
- No marketing words (streamline, unlock, elevate, seamless, journey, solutions).
- No dashes as punctuation.
- Output ONLY the spoken VO lines, one short line per beat, nothing else — no scene directions, no shot list, no headings.`;

  const userPrompt = `Client: ${client.name} (${client.trade || "trade unknown"})

This ad's combo:
- Service: ${combo.service || "not set"}
- Offer: ${combo.offer || "not set"}
- Customer reason (why they'd want this): ${combo.customer_reason || "not set"}
- Hypothesis: ${combo.hypothesis || "not set"}
- Angle: ${combo.angle || "not set"}
- Hook direction: ${combo.hook || "not set"}
- Creative style: ${combo.style || "not set"}
- Notes: ${combo.notes || "none"}

Banked ad learnings for this client (what's already worked/flopped — build on winners, don't repeat losers):
${learningsSummary}

Write the VO script for this exact ad.`;

  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 500,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });
  const script = msg.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n").trim();
  if (!script) throw new Error("Claude returned an empty script");

  const { data, error } = await sb
    .from("creative_builder_combos")
    .update({ script, script_status: "drafted", script_drafted_at: new Date().toISOString() })
    .eq("id", comboId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateComboScript(sb: SupabaseClient, id: string, script: string): Promise<CreativeBuilderCombo> {
  const { data, error } = await sb.from("creative_builder_combos").update({ script }).eq("id", id).select("*").single();
  if (error) throw new Error(error.message);
  return data;
}

export async function setComboScriptStatus(sb: SupabaseClient, id: string, scriptStatus: "drafted" | "approved"): Promise<CreativeBuilderCombo> {
  const { data, error } = await sb.from("creative_builder_combos").update({ script_status: scriptStatus }).eq("id", id).select("*").single();
  if (error) throw new Error(error.message);
  return data;
}

export interface DesignBrief {
  headline: Record<"1x1" | "4x5" | "9x16", string>;
  primaryText: string;
  cta: string;
}

// Stage 04 of the ads engine loop — this app has no image-generation
// integration, so this produces a copy-and-sizing brief only (headline per
// placement ratio, primary text, CTA). Turning it into actual statics stays
// a manual/Canva step, same as Lucky's own diagram marks this stage
// "augmented" rather than fully automated.
export async function draftDesignBriefForCombo(sb: SupabaseClient, comboId: string): Promise<CreativeBuilderCombo> {
  const { data: combo, error: comboError } = await sb.from("creative_builder_combos").select("*").eq("id", comboId).maybeSingle();
  if (comboError || !combo) throw new Error(`Unknown combo id "${comboId}"`);
  if (!combo.script) throw new Error("Draft and approve a script before generating a design brief");

  const { data: client } = await sb.from("lq_clients").select("id, name, trade").eq("id", combo.client_id).maybeSingle();
  if (!client) throw new Error(`Combo's client_id "${combo.client_id}" not found`);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY env var is not set");
  const anthropic = new Anthropic({ apiKey });

  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 500,
    system: `You write Meta ad static specs for New Zealand trade/home-service businesses. Output ONLY valid JSON matching exactly:
{"headline": {"1x1": "...", "4x5": "...", "9x16": "..."}, "primaryText": "...", "cta": "..."}
Headlines are short (under 8 words), one per placement ratio (they can be identical if that reads fine at all three). Primary text is 1-2 short sentences, no marketing words, no dashes. CTA is a single short phrase (e.g. "Book now", "Get a quote").`,
    messages: [{ role: "user", content: `Client: ${client.name} (${client.trade || "trade unknown"})\n\nApproved VO script for this ad:\n${combo.script}\n\nOffer: ${combo.offer || "not set"}\nHook: ${combo.hook || "not set"}` }],
  });
  const text = msg.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n").trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Claude did not return parseable JSON for the design brief");
  const designBrief = JSON.parse(jsonMatch[0]) as DesignBrief;

  const { data, error } = await sb.from("creative_builder_combos").update({ design_brief: designBrief }).eq("id", comboId).select("*").single();
  if (error) throw new Error(error.message);
  return data;
}

// Stage 04.5 — static-visual preview, built with the claude.ai "Design"
// Artifact canvas (same reason as the render queue below: that only runs
// inside an agent session, not Vercel's serverless runtime). Gated on the
// copy-only design brief existing, since the preview is built from it.
export async function queueComboForDesignPreview(sb: SupabaseClient, comboId: string): Promise<CreativeBuilderCombo> {
  const { data: combo, error: comboError } = await sb.from("creative_builder_combos").select("design_brief").eq("id", comboId).maybeSingle();
  if (comboError || !combo) throw new Error(`Unknown combo id "${comboId}"`);
  if (!combo.design_brief) throw new Error("Draft a design brief before queuing a design preview");

  await sb.from("ad_design_preview_queue").insert({ combo_id: comboId, status: "queued" });
  const { data, error } = await sb.from("creative_builder_combos").update({ design_preview_status: "queued" }).eq("id", comboId).select("*").single();
  if (error) throw new Error(error.message);
  return data;
}

export async function markComboDesignPreviewReady(sb: SupabaseClient, comboId: string, previewUrl: string): Promise<CreativeBuilderCombo> {
  await sb.from("ad_design_preview_queue").update({ status: "done", preview_url: previewUrl, completed_at: new Date().toISOString() }).eq("combo_id", comboId).in("status", ["queued", "processing"]);
  const { data, error } = await sb.from("creative_builder_combos").update({ design_preview_status: "drafted", design_preview_url: previewUrl }).eq("id", comboId).select("*").single();
  if (error) throw new Error(error.message);
  return data;
}

export async function markComboDesignPreviewFailed(sb: SupabaseClient, comboId: string, errorMessage: string): Promise<CreativeBuilderCombo> {
  await sb.from("ad_design_preview_queue").update({ status: "failed", error: errorMessage, completed_at: new Date().toISOString() }).eq("combo_id", comboId).in("status", ["queued", "processing"]);
  const { data, error } = await sb.from("creative_builder_combos").update({ design_preview_status: "none" }).eq("id", comboId).select("*").single();
  if (error) throw new Error(error.message);
  return data;
}

// Lucky reviewing the preview: "approved" is what gates it into the render
// queue below; anything else sends it back to "drafted" for another pass.
export async function setComboDesignPreviewStatus(sb: SupabaseClient, id: string, status: "drafted" | "approved"): Promise<CreativeBuilderCombo> {
  const { data, error } = await sb.from("creative_builder_combos").update({ design_preview_status: status }).eq("id", id).select("*").single();
  if (error) throw new Error(error.message);
  return data;
}

// Stage 05 handoff — HyperFrames only runs as a Claude Code skill, not
// inside Vercel's serverless runtime, so this just queues the request. An
// agent session (me, on request) drains ad_render_queue and calls
// markComboVideoReady/markComboVideoFailed below once a render completes.
// Carries the approved design preview URL along so the agent can pull it
// into HyperFrames via import-claude-design-from-url as the starting visual.
export async function queueComboForRender(sb: SupabaseClient, comboId: string): Promise<CreativeBuilderCombo> {
  const { data: combo, error: comboError } = await sb.from("creative_builder_combos").select("script_status, design_preview_status, design_preview_url").eq("id", comboId).maybeSingle();
  if (comboError || !combo) throw new Error(`Unknown combo id "${comboId}"`);
  if (combo.script_status !== "approved") throw new Error("Approve the script before sending this to the render queue");
  if (combo.design_preview_status !== "approved") throw new Error("Approve the design preview before sending this to the render queue");

  await sb.from("ad_render_queue").insert({ combo_id: comboId, status: "queued", design_preview_url: combo.design_preview_url });
  const { data, error } = await sb.from("creative_builder_combos").update({ video_status: "queued" }).eq("id", comboId).select("*").single();
  if (error) throw new Error(error.message);
  return data;
}

export async function markComboVideoReady(sb: SupabaseClient, comboId: string, videoUrl: string): Promise<CreativeBuilderCombo> {
  await sb.from("ad_render_queue").update({ status: "done", video_url: videoUrl, completed_at: new Date().toISOString() }).eq("combo_id", comboId).in("status", ["queued", "processing"]);
  const { data, error } = await sb.from("creative_builder_combos").update({ video_status: "ready", video_url: videoUrl }).eq("id", comboId).select("*").single();
  if (error) throw new Error(error.message);
  return data;
}
