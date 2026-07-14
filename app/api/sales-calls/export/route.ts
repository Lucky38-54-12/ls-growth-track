import { NextResponse } from "next/server";
import { createSupabaseClient, fetchAllRows } from "@/lib/supabase";
import { SalesCall } from "@/lib/types";

export const dynamic = "force-dynamic";

const HEADER = [
  "Call Date", "Prospect Name", "Business", "Outcome", "Main Objection",
  "Next Step Booked", "Next Step", "Went Well", "Work Ons", "Raw Summary", "Logged At",
];

function csvEscape(value: string): string {
  const needsQuoting = /[",\n]/.test(value);
  const escaped = value.replace(/"/g, '""');
  return needsQuoting ? `"${escaped}"` : escaped;
}

function toRow(c: SalesCall): string[] {
  return [
    c.call_date, c.prospect_name, c.business_name, c.outcome, c.main_objection,
    c.next_step_booked ? "Yes" : "No", c.next_step_detail, c.went_well, c.work_ons,
    c.raw_summary, c.created_at,
  ];
}

export async function GET() {
  const sb = createSupabaseClient();
  const calls = await fetchAllRows<SalesCall>((from, to) =>
    sb.from("sales_calls").select("*").order("created_at", { ascending: false }).range(from, to));

  const lines = [HEADER, ...calls.map(toRow)].map((row) => row.map(csvEscape).join(","));
  const csv = lines.join("\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="sales-calls-${new Date().toISOString().split("T")[0]}.csv"`,
    },
  });
}
