import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Automations (scheduled routines, cron jobs) self-report here after each
// run so /dashboard/automations can show whether they're actually firing.
export async function POST(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const slug: string = body.slug || "";
  const status: string = body.status === "error" ? "error" : "ok";
  const summary: string = body.summary || "";
  if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });

  const sb = createSupabaseClient();
  const { error } = await sb
    .from("automations")
    .update({ last_run_at: new Date().toISOString(), last_status: status, last_summary: summary })
    .eq("slug", slug);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
