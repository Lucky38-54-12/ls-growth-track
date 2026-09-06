import type { SupabaseClient } from "@supabase/supabase-js";

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
