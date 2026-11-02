import { createSupabaseClient } from "@/lib/supabase";
import Topbar from "@/components/Topbar";
import PaymentsTable, { PaymentClient } from "@/components/payments/PaymentsTable";

export const revalidate = 0;

export default async function PaymentsPage() {
  const sb = createSupabaseClient();
  const { data: clients } = await sb
    .from("lq_clients")
    .select("id, name, contact_name, trade, monthly_fee, billing_cycle_days, next_payment_due_date, last_paid_at")
    .order("name", { ascending: true });

  return (
    <div>
      <Topbar title="PAYMENTS" subtitle="Who's due, who's overdue, and when each client gets invoiced next" />
      <div style={{ height: 20 }} />
      <PaymentsTable clients={(clients || []) as PaymentClient[]} />
    </div>
  );
}
