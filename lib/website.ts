async function fetchPageText(url: string): Promise<string> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, { signal: controller.signal, headers: { "User-Agent": "Mozilla/5.0" } });
    clearTimeout(timeout);
    if (!res.ok) return "";
    const html = await res.text();
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  } catch {
    return "";
  }
}

// Strips a website down to plain, deduped text so it's cheap to drop into a
// prompt as grounding — we want real specifics (services offered, area
// covered, who runs it, etc.) instead of the model inventing generic filler.
// Homepages are often nav/hero boilerplate with little real substance, so if
// the homepage text is thin we also try a likely About page off the same
// origin before giving up.
export async function fetchWebsiteSnippet(url: string): Promise<string> {
  const home = await fetchPageText(url);
  let combined = home;

  if (home.length < 400) {
    try {
      const origin = new URL(url).origin;
      for (const path of ["/about", "/about-us"]) {
        const extra = await fetchPageText(origin + path);
        if (extra) {
          combined = combined ? `${combined} ${extra}` : extra;
          break;
        }
      }
    } catch {
      // invalid URL — fall through with whatever the homepage gave us
    }
  }

  return combined.slice(0, 3000);
}
