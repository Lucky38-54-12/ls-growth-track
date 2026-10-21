import { resolveMx } from "dns/promises";

// Cheapest possible pre-send filter: does the email's domain even have mail
// servers configured at all? Catches dead/typo'd/fake domains for free
// (no third-party verification API, no per-check cost) before a lead is
// ever eligible to send to — this is a first pass, not full mailbox-level
// verification (it can't tell you if the specific mailbox exists, only that
// the domain could theoretically receive mail), but it's a real chunk of
// the bounce rate for free. Per-email verification (ZeroBounce/NeverBounce)
// is a deliberately separate, not-yet-built next step.
const mxCache = new Map<string, boolean>();

export async function hasMxRecord(email: string): Promise<boolean> {
  const domain = email.split("@")[1]?.trim().toLowerCase();
  if (!domain) return false;
  if (mxCache.has(domain)) return mxCache.get(domain)!;

  let ok = false;
  try {
    const records = await resolveMx(domain);
    ok = records.length > 0;
  } catch {
    ok = false;
  }
  mxCache.set(domain, ok);
  return ok;
}
