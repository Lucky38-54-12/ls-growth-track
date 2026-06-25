// Edge + Node compatible session signing (used by middleware and API routes).
// Avoids Buffer/Node-only APIs so it works in the Edge runtime.

export const COOKIE_NAME = "ls_growth_session";
export const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

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

export async function createSessionToken(): Promise<string> {
  const expires = Date.now() + SESSION_DURATION_MS;
  const sig = await hmac(String(expires));
  return `${expires}.${sig}`;
}

export async function verifySessionToken(token: string): Promise<boolean> {
  const [expiresRaw, sig] = token.split(".");
  const expires = Number(expiresRaw);
  if (!expires || !sig || Date.now() > expires) return false;
  const expectedSig = await hmac(String(expires));
  return sig === expectedSig;
}
