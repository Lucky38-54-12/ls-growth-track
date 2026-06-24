// Strips a website down to plain, deduped text so it's cheap to drop into a
// prompt as grounding — we want real specifics (services offered, area
// covered, who runs it, etc.) instead of the model inventing generic filler.
export async function fetchWebsiteSnippet(url: string): Promise<string> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, { signal: controller.signal, headers: { "User-Agent": "Mozilla/5.0" } });
    clearTimeout(timeout);
    if (!res.ok) return "";
    const html = await res.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return text.slice(0, 1500);
  } catch {
    return "";
  }
}
