// ClickSend SMS — used for meeting reminders (day-before, 3-hours-before)
// alongside the bookings@lsgrowth.agency email reminder, since a text has a
// much better chance of actually being seen in time than an email sitting
// in an inbox. Failures here are logged but never thrown — a missing/failed
// SMS should never stop the email reminder (the part with more history/
// reliability) from going out.
// Lead phone numbers are stored inconsistently (local "021 830 061" from a
// manually typed number vs "+6421830061" from an API source — same issue
// noted in lib/leadQual/dedupe.ts) — normalize to E.164 since that's what
// ClickSend expects.
function toE164(phone: string): string | null {
  const digits = phone.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("0")) return `+64${digits.slice(1)}`;
  if (digits.startsWith("64")) return `+${digits}`;
  return digits ? `+64${digits}` : null;
}

export async function sendReminderSms(to: string | null | undefined, body: string): Promise<void> {
  const normalized = to ? toE164(to) : null;
  if (!normalized) return;
  const username = process.env.CLICKSEND_USERNAME;
  const apiKey = process.env.CLICKSEND_API_KEY;
  const fromNumber = process.env.CLICKSEND_FROM_NUMBER;
  if (!username || !apiKey) return;

  try {
    const auth = Buffer.from(`${username}:${apiKey}`).toString("base64");
    const res = await fetch("https://rest.clicksend.com/v3/sms/send", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          {
            source: "ls-growth-track",
            from: fromNumber || undefined,
            to: normalized,
            body,
          },
        ],
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`ClickSend ${res.status}: ${text}`);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("sendReminderSms failed:", err instanceof Error ? err.message : err);
  }
}
