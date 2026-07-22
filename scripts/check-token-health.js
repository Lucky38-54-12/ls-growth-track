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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!process.env[key]) process.env[key] = value;
  }
}
loadEnv(".env.local");
loadEnv(".env.vercel.local");

const { createClient } = require("@supabase/supabase-js");
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function decryptSecret(stored) {
  const hex = typeof stored === "string" && stored.startsWith("\\x") ? stored.slice(2) : stored;
  const buf = Buffer.from(hex, "hex");
  const key = Buffer.from(process.env.LEAD_QUAL_ENCRYPTION_KEY, "base64");
  const iv = buf.subarray(0, 12);
  const authTag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

async function main() {
  const { data: channels } = await sb.from("lq_channels").select("id, external_page_id, credentials, lq_clients(name)").eq("type", "messenger");
  for (const ch of channels) {
    const name = ch.lq_clients?.name || "unknown";
    try {
      const token = decryptSecret(ch.credentials);
      const res = await fetch("https://graph.facebook.com/debug_token?input_token=" + encodeURIComponent(token) + "&access_token=" + process.env.META_APP_ID + "|" + process.env.META_APP_SECRET);
      const body = await res.json();
      console.log(name, ch.external_page_id, JSON.stringify(body.data || body.error));
    } catch (e) {
      console.log(name, ch.external_page_id, "ERROR", e.message);
    }
  }
}
main();
