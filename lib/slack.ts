// Posts a message to a Slack Incoming Webhook so Lucky gets pinged the
// moment something the Brain generated is actually ready (a doc created, a
// brief finished), rather than only finding out next time he opens the
// dashboard. Silently a no-op until SLACK_WEBHOOK_URL is configured — no
// webhook set up yet is not an error condition for whatever action
// triggered it, so callers should never let a Slack failure block the
// action itself.
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
    // Best-effort — never throw out of a notification side effect.
  }
}
