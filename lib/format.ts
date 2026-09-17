export function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleString("en-NZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    // Server components render on Vercel (UTC), not in the browser — without
    // this, times silently render in UTC while every other clock in the app
    // reads NZT, off by a 12-13h DST-dependent offset.
    timeZone: "Pacific/Auckland",
  });
}

// /api/click stores the real destination on every click event, so which
// specific link someone clicked (book a time vs case studies vs the video
// vs the Meet link) has always been recoverable from email_events.url — this
// just turns the raw URL into something readable wherever clicks are shown
// (email-outreach Activity tab, per-lead timeline in CallForm.tsx).
export function labelForUrl(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    const path = u.pathname.replace(/\/$/, "");
    if (path.endsWith("/book")) return "Book a time";
    if (host === "lsgrowth.agency" && (path === "" || path === "/")) return "Case studies (lsgrowth.agency)";
    if (host === "app.lsgrowth.agency" && path.includes("/videos/lucky-intro")) return "Watched Lucky's video intro";
    if (host === "meet.google.com") return "Joined the Google Meet";
    return url.length > 60 ? url.slice(0, 57) + "…" : url;
  } catch {
    return url;
  }
}

export function deviceFromUserAgent(ua: string | null): string {
  if (!ua) return "Unknown device";
  const isMobile = /Mobile|Android|iPhone|iPad/.test(ua);
  let os = "Unknown OS";
  if (/Windows/.test(ua)) os = "Windows";
  else if (/Mac OS X/.test(ua)) os = "Mac";
  else if (/Android/.test(ua)) os = "Android";
  else if (/iPhone|iPad|iOS/.test(ua)) os = "iOS";
  else if (/Linux/.test(ua)) os = "Linux";

  let browser = "Unknown browser";
  if (/Edg\//.test(ua)) browser = "Edge";
  else if (/Chrome\//.test(ua)) browser = "Chrome";
  else if (/Firefox\//.test(ua)) browser = "Firefox";
  else if (/Safari\//.test(ua)) browser = "Safari";

  return `${browser} on ${os}${isMobile ? " (mobile)" : ""}`;
}
