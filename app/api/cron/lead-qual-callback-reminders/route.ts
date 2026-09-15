import { dispatchDueCallbackReminders } from "@/lib/leadQual/callbackReminder";
import { createSupabaseClient } from "@/lib/supabase";
import { reportAutomationStatus } from "@/lib/automationStatus";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await dispatchDueCallbackReminders();
  await reportAutomationStatus(
    createSupabaseClient(),
    "lead-qual-callback-reminders",
    result.errors > 0 ? "error" : "ok",
    `Sent ${result.sent}, ${result.errors} error(s).`
  );
  return NextResponse.json(result);
}
