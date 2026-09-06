import { createSupabaseClient } from "@/lib/supabase";
import { getCombosForClient, saveCombo, updateComboStatus, deleteCombo, type CreativeBuilderCombo } from "@/lib/creativeBuilder";
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
  const { id, status } = body as { id?: string; status?: CreativeBuilderCombo["status"] };
  if (!id || !status) return NextResponse.json({ error: "id and status are required" }, { status: 400 });

  const sb = createSupabaseClient();
  const combo = await updateComboStatus(sb, id, status);
  return NextResponse.json({ combo });
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const sb = createSupabaseClient();
  await deleteCombo(sb, id);
  return NextResponse.json({ ok: true });
}
