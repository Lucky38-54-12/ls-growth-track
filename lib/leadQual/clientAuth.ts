// Auth for the client-facing portal — entirely separate from the internal
// admin session in lib/session.ts (different cookie, different secret usage,
// never grants access to /dashboard). Edge + Node compatible (no Buffer),
// same crypto.subtle HMAC pattern as the admin session so it works in
// middleware.

export const CLIENT_COOKIE_NAME = "lq_client_session";
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 90; // 90 days
const MAGIC_LINK_DURATION_MS = 1000 * 60 * 30; // 30 minutes — a login link left in an old email shouldn't work forever

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  return secret;
}

function toBase64Url(buf: ArrayBuffer) {
  const bytes = new Uint8Array(buf);
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(message: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return toBase64Url(sig);
}

// `kind` is mixed into the signed message so a magic-link token can never be
// replayed as a session token or vice versa, even though both are just
// "clientId + expiry" underneath.
async function sign(kind: "magic" | "session", clientId: string, expires: number): Promise<string> {
  const payload = `${kind}.${clientId}.${expires}`;
  const sig = await hmac(payload);
  return `${clientId}.${expires}.${sig}`;
}

async function verify(kind: "magic" | "session", token: string): Promise<string | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [clientId, expiresRaw, sig] = parts;
  const expires = Number(expiresRaw);
  if (!clientId || !expires || !sig || Date.now() > expires) return null;
  const expectedSig = await hmac(`${kind}.${clientId}.${expires}`);
  return sig === expectedSig ? clientId : null;
}

export async function createMagicLinkToken(clientId: string): Promise<string> {
  return sign("magic", clientId, Date.now() + MAGIC_LINK_DURATION_MS);
}

export async function verifyMagicLinkToken(token: string): Promise<string | null> {
  return verify("magic", token);
}

export async function createClientSessionToken(clientId: string): Promise<string> {
  return sign("session", clientId, Date.now() + SESSION_DURATION_MS);
}

export async function verifyClientSessionToken(token: string): Promise<string | null> {
  return verify("session", token);
}
