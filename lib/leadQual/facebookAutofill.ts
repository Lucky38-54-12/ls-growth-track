import { draftConfigFromSnippet, type AutofillDraft } from "./autofillShared";

// Facebook Pages are public, but their "About" section is client-side
// rendered — a plain HTML fetch won't contain it. The og:title/og:description
// meta tags are server-rendered for link-preview purposes though, and
// reliably carry the Page's name and tagline/about blurb, which is enough
// to seed a draft without needing any Graph API permissions (those are
// gated behind App Review for reading Page metadata).
async function fetchFacebookPageSnippet(pageId: string): Promise<{ name: string; snippet: string }> {
  const res = await fetch(`https://www.facebook.com/${pageId}`, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
  });
  const html = await res.text();
  const title = html.match(/<meta property="og:title" content="([^"]*)"/)?.[1];
  const description = html.match(/<meta property="og:description" content="([^"]*)"/)?.[1];
  return {
    name: (title || "").replace(/&amp;/g, "&").replace(/&#039;/g, "'"),
    snippet: (description || "").replace(/&amp;/g, "&").replace(/&#039;/g, "'"),
  };
}

export type { AutofillDraft };

// Businesses without a website (common for smaller trades) otherwise get
// no auto-fill at all today, so this is the fallback path.
export async function draftConfigFromFacebookPage(pageId: string, trade: string): Promise<AutofillDraft> {
  const { name, snippet } = await fetchFacebookPageSnippet(pageId);
  if (!snippet) {
    throw new Error("Could not read anything public from this Facebook Page — it may be private, or Facebook blocked the request.");
  }
  return draftConfigFromSnippet(name, snippet, trade, "Facebook Page");
}
