import { createSupabaseClient } from "./supabase";
import { sendClientEmail } from "./email";
import { reportAutomationStatus } from "./automationStatus";

type SupabaseClient = ReturnType<typeof createSupabaseClient>;

interface DueClient {
  name: string;
  dueDate: string;
  monthlyFee: number | null;
}

function nzTodayISODate(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Pacific/Auckland" }).format(new Date());
}

// Flags anything due today or already overdue (e.g. the cron missed a day) —
// next_payment_due_date is a real, persisted field on lq_clients, set/advanced
// from the Payments dashboard page, not recomputed from a fixed cycle each run.
export async function sendPaymentRemindersIfDue(sb: SupabaseClient): Promise<{ sent: boolean }> {
  const today = nzTodayISODate();
  const { data: clients } = await sb
    .from("lq_clients")
    .select("name, next_payment_due_date, monthly_fee")
    .not("next_payment_due_date", "is", null)
    .lte("next_payment_due_date", today);
  if (!clients || clients.length === 0) return { sent: false };

  const due: DueClient[] = (clients as { name: string; next_payment_due_date: string; monthly_fee: number | null }[]).map((c) => ({
    name: c.name,
    dueDate: c.next_payment_due_date,
    monthlyFee: c.monthly_fee,
  }));

  const listed = due
    .map((d) => `<li>${d.name} — due ${d.dueDate}${d.monthlyFee ? ` ($${d.monthlyFee})` : ""}</li>`)
    .join("");
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.6;max-width:480px;">
  <p style="margin:0 0 4px">Payment due or overdue:</p>
  <ul style="margin:0;padding-left:18px">${listed}</ul>
  <p style="margin:12px 0 0;font-size:13px;color:#64748b">Mark these paid on the Payments page in the dashboard once confirmed.</p>
</div>`;

  await sendClientEmail(process.env.GMAIL_USER as string, "Payment reminder", html);
  await reportAutomationStatus(sb, "payment-reminder", "ok", `Flagged ${due.length} client(s) due/overdue for payment`);
  return { sent: true };
}
