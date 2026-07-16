// One-time: re-subscribes every already-connected Messenger page to the
// "message_echoes" webhook field so staff replies typed directly into the
// Page inbox get detected as human takeover (see supabase_migration_lead_qual_human_takeover.sql
// and app/api/lead-qual/webhooks/meta/route.ts). New pages get this
// automatically via connectMessengerPage(); this backfills pages connected
// before that field was added.
//
// Usage: node scripts/resubscribe-messenger-echoes.js

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

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
loadEnv(".env.vercel.local");

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const LEAD_QUAL_ENCRYPTION_KEY = process.env.LEAD_QUAL_ENCRYPTION_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set");
if (!LEAD_QUAL_ENCRYPTION_KEY) throw new Error("LEAD_QUAL_ENCRYPTION_KEY not set");

function decryptSecret(stored) {
  const hex = typeof stored === "string" && stored.startsWith("\\x") ? stored.slice(2) : stored;
  const buf = Buffer.from(hex, "hex");
  const key = Buffer.from(LEAD_QUAL_ENCRYPTION_KEY, "base64");
  const iv = buf.subarray(0, 12);
  const authTag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

async function main() {
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: channels, error } = await sb
    .from("lq_channels")
    .select("id, external_page_id, credentials, lq_clients(name)")
    .eq("type", "messenger");
  if (error) throw error;

  console.log(`Found ${channels.length} connected Messenger page(s).`);

  for (const channel of channels) {
    const clientName = channel.lq_clients?.name || "unknown client";
    if (!channel.credentials) {
      console.log(`- ${clientName} (${channel.external_page_id}): no stored token, skipping`);
      continue;
    }
    try {
      const token = decryptSecret(channel.credentials);
      const res = await fetch(
        `https://graph.facebook.com/v20.0/${channel.external_page_id}/subscribed_apps?subscribed_fields=messages,messaging_postbacks,messaging_optins,message_echoes&access_token=${encodeURIComponent(token)}`,
        { method: "POST" }
      );
      const body = await res.json();
      if (!res.ok) {
        console.log(`- ${clientName} (${channel.external_page_id}): FAILED — ${JSON.stringify(body)}`);
      } else {
        console.log(`- ${clientName} (${channel.external_page_id}): subscribed OK`);
      }
    } catch (e) {
      console.log(`- ${clientName} (${channel.external_page_id}): ERROR — ${e.message}`);
    }
  }
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
