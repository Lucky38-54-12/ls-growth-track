// Twilio SMS — used for meeting reminders (day-before, 3-hours-before)
// alongside the bookings@lsgrowth.agency email reminder, since a text has a
// much better chance of actually being seen in time than an email sitting
// in an inbox. Failures here are logged but never thrown — a missing/failed
// SMS should never stop the email reminder (the part with more history/
// reliability) from going out.
// Lead phone numbers are stored inconsistently (local "021 830 061" from a
// manually typed number vs "+6421830061" from an API source — same issue
// noted in lib/leadQual/dedupe.ts) — normalize to E.164 since that's what
// Twilio expects.
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
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;
  if (!accountSid || !authToken || !fromNumber) return;

  try {
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
    const params = new URLSearchParams({
      To: normalized,
      From: fromNumber,
      Body: body,
    });
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Twilio ${res.status}: ${text}`);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("sendReminderSms failed:", err instanceof Error ? err.message : err);
  }
}
