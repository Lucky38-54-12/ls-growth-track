// Outbound push notifications via ntfy.sh — a free, no-signup push service.
// Silently no-ops if NTFY_TOPIC isn't set, so every caller can fire-and-forget
// without checking whether it's configured. Mirrors lib/slackNotify.ts.
export async function notifyNtfy(text: string, title?: string): Promise<void> {
  const topic = process.env.NTFY_TOPIC;
  if (!topic) return;
  try {
    await fetch(`https://ntfy.sh/${topic}`, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        ...(title ? { Title: title } : {}),
      },
      body: text,
    });
  } catch {
    // Best-effort — a failed push should never break the caller's flow.
  }
}
