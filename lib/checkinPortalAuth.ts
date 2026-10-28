// A capability link for the weekly job-outcome check-in email, same
// crypto.subtle HMAC pattern as lib/onboardingPortalAuth.ts and
// lib/leadQual/clientAuth.ts but its own "kind" so none of the three token
// types can be swapped for each other even though they share SESSION_SECRET.
// Scoped to an lq_clients id (not a login session) since the client taps
// through from an email link with no cookie.
const LINK_DURATION_MS = 1000 * 60 * 60 * 24 * 30;

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

export async function createCheckinToken(clientId: string): Promise<string> {
  const expires = Date.now() + LINK_DURATION_MS;
  const payload = `checkin.${clientId}.${expires}`;
  const sig = await hmac(payload);
  return `${clientId}.${expires}.${sig}`;
}

export async function verifyCheckinToken(token: string): Promise<string | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [clientId, expiresRaw, sig] = parts;
  const expires = Number(expiresRaw);
  if (!clientId || !expires || !sig || Date.now() > expires) return null;
  const expectedSig = await hmac(`checkin.${clientId}.${expires}`);
  return sig === expectedSig ? clientId : null;
}
