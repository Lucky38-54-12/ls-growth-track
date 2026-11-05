import type { SupabaseClient } from "@supabase/supabase-js";

const GRAPH_VERSION = "v20.0";

// Stage 06 of the ads engine loop. This is the one step that spends real
// client ad money, so it has a hard rule: the ad it creates is ALWAYS
// status PAUSED. Nothing in this codebase ever flips it ACTIVE — Lucky does
// that by hand in Ads Manager (or a future, separate, explicit "go live"
// action) after reviewing it. No campaign/ad set is ever auto-created
// either — budget/targeting are too consequential to guess, so this always
// launches into an existing ad set Lucky picks.
export async function launchComboToMeta(sb: SupabaseClient, comboId: string, adSetId: string): Promise<{ adId: string }> {
  const token = process.env.META_SYSTEM_USER_TOKEN;
  if (!token) throw new Error("META_SYSTEM_USER_TOKEN env var is not set");

  const { data: combo, error: comboError } = await sb.from("creative_builder_combos").select("*").eq("id", comboId).maybeSingle();
  if (comboError || !combo) throw new Error(`Unknown combo id "${comboId}"`);
  if (combo.script_status !== "approved") throw new Error("Approve the script before launching");
  if (combo.video_status !== "ready" || !combo.video_url) throw new Error("No ready video on file for this combo yet");

  const { data: client } = await sb.from("lq_clients").select("id, name, meta_ad_account_id, meta_page_id").eq("id", combo.client_id).maybeSingle();
  if (!client) throw new Error(`Combo's client_id "${combo.client_id}" not found`);
  if (!client.meta_ad_account_id) throw new Error(`${client.name} has no Meta ad account linked`);
  if (!client.meta_page_id) throw new Error(`${client.name} has no Meta Page ID set — add it on Campaign Setup first`);

  const accountId = (client.meta_ad_account_id as string).startsWith("act_") ? client.meta_ad_account_id : `act_${client.meta_ad_account_id}`;

  // 1. Upload the rendered video to the ad account's video library.
  const uploadRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${accountId}/advideos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_url: combo.video_url, access_token: token }),
  });
  const uploadData = await uploadRes.json();
  if (uploadData.error) throw new Error(`Video upload failed: ${uploadData.error.message}`);
  const videoId = uploadData.id as string;

  // 2. Create the ad creative from that video, using the approved script's
  // first line as the headline/message and the combo's offer as a fallback.
  const message = combo.script.split("\n").find((l: string) => l.trim()) || combo.offer || "";
  const creativeRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${accountId}/adcreatives`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: `${client.name} — ${combo.service || "ad"} — ${new Date().toISOString().slice(0, 10)}`,
      object_story_spec: {
        page_id: client.meta_page_id,
        video_data: { video_id: videoId, message, call_to_action: { type: "LEARN_MORE" } },
      },
      access_token: token,
    }),
  });
  const creativeData = await creativeRes.json();
  if (creativeData.error) throw new Error(`Ad creative creation failed: ${creativeData.error.message}`);
  const creativeId = creativeData.id as string;

  // 3. Create the ad itself, always PAUSED.
  const adRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${accountId}/ads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: `${client.name} — ${combo.angle || combo.service || "ad"} — ${new Date().toISOString().slice(0, 10)}`,
      adset_id: adSetId,
      creative: { creative_id: creativeId },
      status: "PAUSED",
      access_token: token,
    }),
  });
  const adData = await adRes.json();
  if (adData.error) throw new Error(`Ad creation failed: ${adData.error.message}`);
  const adId = adData.id as string;

  await sb.from("creative_builder_combos").update({
    launch_status: "launched",
    meta_ad_id: adId,
    meta_ad_set_id: adSetId,
    launched_at: new Date().toISOString(),
    status: "live",
  }).eq("id", comboId);

  return { adId };
}
