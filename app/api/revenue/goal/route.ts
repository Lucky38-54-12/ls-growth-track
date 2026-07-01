import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const sb = createSupabaseClient();
  const { data, error } = await sb.from("revenue_goal").select("*").eq("id", 1).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || { id: 1, monthly_goal: 3000 });
}

export async function PATCH(req: NextRequest) {
  const sb = createSupabaseClient();
  const body = await req.json();
  const monthlyGoal = Number(body.monthly_goal);
  if (!Number.isFinite(monthlyGoal) || monthlyGoal <= 0) {
    return NextResponse.json({ error: "Enter a valid goal amount" }, { status: 400 });
  }

  const { data, error } = await sb.from("revenue_goal").upsert({ id: 1, monthly_goal: monthlyGoal }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
