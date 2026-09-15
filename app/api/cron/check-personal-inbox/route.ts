import { NextRequest, NextResponse } from "next/server";
import { checkPersonalInbox } from "@/lib/personalInbox";
import { createSupabaseClient } from "@/lib/supabase";
import { reportAutomationStatus } from "@/lib/automationStatus";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await checkPersonalInbox();
    await reportAutomationStatus(createSupabaseClient(), "check-personal-inbox", "ok", "Checked personal inbox.");
    return NextResponse.json(result);
  } catch (e) {
    await reportAutomationStatus(createSupabaseClient(), "check-personal-inbox", "error", e instanceof Error ? e.message : "personal inbox check failed");
    return NextResponse.json({ error: e instanceof Error ? e.message : "personal inbox check failed" }, { status: 500 });
  }
}
