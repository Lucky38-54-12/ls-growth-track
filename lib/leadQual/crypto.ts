import crypto from "crypto";

// Client calendar refresh tokens are stored encrypted at rest (bytea column)
// so a database leak alone doesn't hand over write access to every client's
// Google Calendar.
function getKey(): Buffer {
  const key = process.env.LEAD_QUAL_ENCRYPTION_KEY;
  if (!key) throw new Error("LEAD_QUAL_ENCRYPTION_KEY env var is not set");
  return Buffer.from(key, "base64");
}

export function encryptSecret(plaintext: string): Buffer {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Layout: iv (12 bytes) | authTag (16 bytes) | ciphertext
  return Buffer.concat([iv, authTag, encrypted]);
}

export function decryptSecret(stored: Buffer): string {
  const iv = stored.subarray(0, 12);
  const authTag = stored.subarray(12, 28);
  const encrypted = stored.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
