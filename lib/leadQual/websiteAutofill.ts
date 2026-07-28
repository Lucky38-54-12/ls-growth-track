import { draftConfigFromSnippet, type AutofillDraft } from "./autofillShared";

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchWebsiteSnippet(url: string): Promise<{ name: string; snippet: string }> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
  });
  const html = await res.text();
  const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || "";
  const text = stripHtml(html);
  return {
    name: title.trim(),
    // Homepages carry more marketing copy than a single Facebook blurb, so
    // give the model a bigger window to work with.
    snippet: text.slice(0, 6000),
  };
}

export type { AutofillDraft };

export async function draftConfigFromWebsite(url: string, trade: string): Promise<AutofillDraft> {
  let normalized = url.trim();
  if (!/^https?:\/\//i.test(normalized)) normalized = `https://${normalized}`;

  let name: string;
  let snippet: string;
  try {
    ({ name, snippet } = await fetchWebsiteSnippet(normalized));
  } catch {
    throw new Error("Could not reach that website — check the URL is correct.");
  }
  if (!snippet) {
    throw new Error("Could not read anything from that website — it may block automated requests.");
  }
  return draftConfigFromSnippet(name, snippet, trade, "website");
}
