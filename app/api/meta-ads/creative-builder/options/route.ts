import { createSupabaseClient } from "@/lib/supabase";
import { getOptionsForClient, addOption, deleteOption, type OptionCategory } from "@/lib/creativeBuilder";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "clientId is required" }, { status: 400 });

  const sb = createSupabaseClient();
  const options = await getOptionsForClient(sb, clientId);
  return NextResponse.json({ options });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { clientId, category, label, subtext } = body as { clientId?: string; category?: OptionCategory; label?: string; subtext?: string | null };
  if (!clientId || !category || !label) return NextResponse.json({ error: "clientId, category and label are required" }, { status: 400 });
  if (!["offer", "angle", "hook", "style"].includes(category)) return NextResponse.json({ error: "Invalid category" }, { status: 400 });

  const sb = createSupabaseClient();
  const option = await addOption(sb, clientId, category, label, subtext || null);
  return NextResponse.json({ option });
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const sb = createSupabaseClient();
  await deleteOption(sb, id);
  return NextResponse.json({ ok: true });
}
