import { createSupabaseClient, fetchAllRows } from "./supabase";
import { SalesCall } from "./types";
import { generateCallPrep, CallPrepResult } from "./salesCallsAi";
import { recentWorkOnThemes, recentObjectionThemes } from "./salesCallsStats";

// The actual logic behind the /dashboard/sales-calls "Call Prep" tab (see
// app/api/sales-calls/prep/route.ts, which now just wraps this) — pulled out
// so the Brain chat can generate the same tailored call sheet when Lucky
// asks it to prep him for a call, instead of duplicating this in two places.
export async function prepSalesCall(sb: ReturnType<typeof createSupabaseClient>, notes: string): Promise<CallPrepResult> {
  const { data: currentVersion, error: versionError } = await sb.from("sales_script_versions").select("*").eq("is_current", true).maybeSingle();
  if (versionError) throw new Error(versionError.message);
  if (!currentVersion) throw new Error("No master script found yet.");

  const calls = await fetchAllRows<SalesCall>((from, to) =>
    sb.from("sales_calls").select("*").order("created_at", { ascending: false }).range(from, to));

  return generateCallPrep({
    notes: notes || "",
    masterScript: currentVersion.content,
    recentWorkOns: recentWorkOnThemes(calls),
    recentObjections: recentObjectionThemes(calls),
  });
}
