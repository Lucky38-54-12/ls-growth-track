import crypto from "crypto";

// Client calendar refresh tokens are stored encrypted at rest (bytea column)
// so a database leak alone doesn't hand over write access to every client's
// Google Calendar.
function getKey(): Buffer {
  const key = process.env.LEAD_QUAL_ENCRYPTION_KEY;
  if (!key) throw new Error("LEAD_QUAL_ENCRYPTION_KEY env var is not set");
  return Buffer.from(key, "base64");
}

// Returns the Postgres textual bytea format ("\x<hex>") rather than a raw
// Buffer — supabase-js has no bytea encoding of its own, so handing it a
// Buffer/Uint8Array gets silently JSON-serialized (`{"type":"Buffer",...}`)
// instead of written as binary, corrupting the stored value.
export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Layout: iv (12 bytes) | authTag (16 bytes) | ciphertext
  const combined = Buffer.concat([iv, authTag, encrypted]);
  return "\\x" + combined.toString("hex");
}

// PostgREST (Supabase's REST layer) serializes `bytea` columns as a Postgres
// hex-encoded string (e.g. "\x1a2b...") over JSON, not a real Buffer — so
// values read back from the database need normalizing before use here.
function toBuffer(stored: Buffer | Uint8Array | string): Buffer {
  if (Buffer.isBuffer(stored)) return stored;
  if (typeof stored === "string") {
    const hex = stored.startsWith("\\x") ? stored.slice(2) : stored;
    return Buffer.from(hex, "hex");
  }
  return Buffer.from(stored);
}

export function decryptSecret(stored: Buffer | Uint8Array | string): string {
  const buf = toBuffer(stored);
  const iv = buf.subarray(0, 12);
  const authTag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
