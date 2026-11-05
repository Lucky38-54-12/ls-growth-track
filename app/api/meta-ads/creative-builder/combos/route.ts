import { createSupabaseClient } from "@/lib/supabase";
import { getCombosForClient, saveCombo, updateComboStatus, deleteCombo, draftScriptForCombo, updateComboScript, setComboScriptStatus, draftDesignBriefForCombo, queueComboForDesignPreview, setComboDesignPreviewStatus, queueComboForRender, type CreativeBuilderCombo } from "@/lib/creativeBuilder";
import { launchComboToMeta } from "@/lib/metaAdsLaunch";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "clientId is required" }, { status: 400 });

  const sb = createSupabaseClient();
  const combos = await getCombosForClient(sb, clientId);
  return NextResponse.json({ combos });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { clientId, service, offer, customerReason, hypothesis, angle, hook, style, notes } = body as { clientId?: string; service?: string; offer?: string; customerReason?: string; hypothesis?: string; angle?: string; hook?: string; style?: string; notes?: string };
  if (!clientId) return NextResponse.json({ error: "clientId is required" }, { status: 400 });
  if (!offer && !angle && !hook && !style) return NextResponse.json({ error: "Pick at least one piece before saving" }, { status: 400 });

  const sb = createSupabaseClient();
  const combo = await saveCombo(sb, clientId, { service: service || null, offer: offer || null, customer_reason: customerReason || null, hypothesis: hypothesis || null, angle: angle || null, hook: hook || null, style: style || null, notes: notes || null });
  return NextResponse.json({ combo });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { id, status, action, script, scriptStatus, designPreviewStatus, adSetId } = body as {
    id?: string;
    status?: CreativeBuilderCombo["status"];
    action?: "draftScript" | "draftDesignBrief" | "queueDesignPreview" | "queueRender" | "launch";
    script?: string;
    scriptStatus?: "drafted" | "approved";
    designPreviewStatus?: "drafted" | "approved";
    adSetId?: string;
  };
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const sb = createSupabaseClient();

  try {
    if (action === "draftScript") {
      const combo = await draftScriptForCombo(sb, id);
      return NextResponse.json({ combo });
    }
    if (action === "draftDesignBrief") {
      const combo = await draftDesignBriefForCombo(sb, id);
      return NextResponse.json({ combo });
    }
    if (action === "queueDesignPreview") {
      const combo = await queueComboForDesignPreview(sb, id);
      return NextResponse.json({ combo });
    }
    if (action === "queueRender") {
      const combo = await queueComboForRender(sb, id);
      return NextResponse.json({ combo });
    }
    if (action === "launch") {
      if (!adSetId) return NextResponse.json({ error: "adSetId is required to launch" }, { status: 400 });
      const { adId } = await launchComboToMeta(sb, id, adSetId);
      return NextResponse.json({ adId });
    }
    if (typeof script === "string") {
      const combo = await updateComboScript(sb, id, script);
      return NextResponse.json({ combo });
    }
    if (scriptStatus) {
      const combo = await setComboScriptStatus(sb, id, scriptStatus);
      return NextResponse.json({ combo });
    }
    if (designPreviewStatus) {
      const combo = await setComboDesignPreviewStatus(sb, id, designPreviewStatus);
      return NextResponse.json({ combo });
    }
    if (status) {
      const combo = await updateComboStatus(sb, id, status);
      return NextResponse.json({ combo });
    }
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const sb = createSupabaseClient();
  await deleteCombo(sb, id);
  return NextResponse.json({ ok: true });
}
