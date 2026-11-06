import { createSupabaseClient } from "@/lib/supabase";
import { setComboScriptStatus, setComboDesignPreviewStatus, draftDesignBriefForCombo, queueComboForDesignPreview } from "@/lib/creativeBuilder";
import { NextRequest, NextResponse } from "next/server";

// Bearer-gated like the other /api/cron/* routes (public in middleware,
// self-checked here) — called from aios (lucky's desktop app) when he taps
// "Yes" on a pending combo there, instead of from a logged-in dashboard
// session. Chains script-approve -> draft design brief -> queue the design
// preview in one call, since aios only has a single yes/no action, not a
// multi-step dashboard flow.
export async function POST(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const comboId = String(body?.comboId ?? "");
  if (!comboId) return NextResponse.json({ error: "comboId is required" }, { status: 400 });

  const sb = createSupabaseClient();

  try {
    const { data: combo, error } = await sb
      .from("creative_builder_combos")
      .select("script_status, design_preview_status")
      .eq("id", comboId)
      .maybeSingle();
    if (error || !combo) return NextResponse.json({ error: error?.message ?? "Combo not found" }, { status: 404 });

    if (combo.script_status === "drafted") {
      await setComboScriptStatus(sb, comboId, "approved");
    }

    // A design preview that was itself the thing waiting on approval (built
    // by an agent session already) just gets approved, same as the script
    // case above. A combo with no design preview yet gets one drafted and
    // queued now that the script is settled — same chain runAdsEngineAutopilot
    // already runs server-side for autopilot-originated combos.
    if (combo.design_preview_status === "drafted") {
      await setComboDesignPreviewStatus(sb, comboId, "approved");
    } else if (combo.design_preview_status === "none") {
      await draftDesignBriefForCombo(sb, comboId);
      await queueComboForDesignPreview(sb, comboId);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
