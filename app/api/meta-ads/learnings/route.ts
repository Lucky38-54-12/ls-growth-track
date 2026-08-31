import { createSupabaseClient } from "@/lib/supabase";
import { getAdLearningsForClient } from "@/lib/adLearnings";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "clientId is required" }, { status: 400 });

  const sb = createSupabaseClient();
  const learnings = await getAdLearningsForClient(sb, clientId, 50);
  return NextResponse.json({ learnings });
}
