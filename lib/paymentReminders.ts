import { createSupabaseClient } from "./supabase";
import { sendClientEmail } from "./email";
import { reportAutomationStatus } from "./automationStatus";

type SupabaseClient = ReturnType<typeof createSupabaseClient>;

// Payment lands on a flat 30-day cycle from campaign start (see
// agreementMaker.ts for the monthly-fee terms this tracks). Self-addressed
// nudge only, no record of whether a cycle was actually paid.
const CYCLE_DAYS = 30;

interface DueClient {
  company: string;
  cycleDay: number;
}

function nzTodayISODate(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Pacific/Auckland" }).format(new Date());
}

function daysBetween(startIso: string, todayIso: string): number {
  const [sy, sm, sd] = startIso.split("-").map(Number);
  const [ty, tm, td] = todayIso.split("-").map(Number);
  const start = Date.UTC(sy, sm - 1, sd);
  const today = Date.UTC(ty, tm - 1, td);
  return Math.round((today - start) / 86400000);
}

export async function sendPaymentRemindersIfDue(sb: SupabaseClient): Promise<{ sent: boolean }> {
  const { data: clients } = await sb
    .from("onboarding_clients")
    .select("company, campaign_start_date")
    .not("campaign_start_date", "is", null);
  if (!clients || clients.length === 0) return { sent: false };

  const today = nzTodayISODate();
  const due: DueClient[] = [];
  for (const c of clients as { company: string; campaign_start_date: string }[]) {
    const days = daysBetween(c.campaign_start_date, today);
    if (days > 0 && days % CYCLE_DAYS === 0) due.push({ company: c.company, cycleDay: days });
  }

  if (due.length === 0) return { sent: false };

  const listed = due.map((d) => `<li>${d.company} — day ${d.cycleDay}</li>`).join("");
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.6;max-width:480px;">
  <p style="margin:0 0 4px">Payment due today (30-day cycle from campaign start):</p>
  <ul style="margin:0;padding-left:18px">${listed}</ul>
</div>`;

  await sendClientEmail(process.env.GMAIL_USER as string, "Payment reminder", html);
  await reportAutomationStatus(sb, "payment-reminder", "ok", `Flagged ${due.length} client(s) due for payment`);
  return { sent: true };
}
