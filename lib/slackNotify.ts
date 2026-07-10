// Outbound Slack notifications via a single Incoming Webhook URL — separate
// from lib/slackActions.ts, which handles inbound slash-command style
// actions. Silently no-ops if SLACK_WEBHOOK_URL isn't set, so every caller
// can fire-and-forget without checking whether Slack is configured.
export async function notifySlack(text: string): Promise<void> {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch {
    // Best-effort — a failed Slack ping should never break the caller's flow.
  }
}
