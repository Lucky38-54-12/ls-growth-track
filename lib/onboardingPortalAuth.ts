// A capability link, not a login session: the token itself is the
// credential (no cookie, no password), same crypto.subtle HMAC pattern as
// lib/leadQual/clientAuth.ts but a separate "kind" so the two token types can
// never be swapped for each other even though they share SESSION_SECRET.
// Long-lived (30 days) since this sits in an email the client might not open
// for a while, unlike a 30-minute magic login link.
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

export async function createOnboardingPortalToken(onboardingClientId: string): Promise<string> {
  const expires = Date.now() + LINK_DURATION_MS;
  const payload = `onboarding.${onboardingClientId}.${expires}`;
  const sig = await hmac(payload);
  return `${onboardingClientId}.${expires}.${sig}`;
}

export async function verifyOnboardingPortalToken(token: string): Promise<string | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [onboardingClientId, expiresRaw, sig] = parts;
  const expires = Number(expiresRaw);
  if (!onboardingClientId || !expires || !sig || Date.now() > expires) return null;
  const expectedSig = await hmac(`onboarding.${onboardingClientId}.${expires}`);
  return sig === expectedSig ? onboardingClientId : null;
}
