import { getArchivedCreatives } from "@/lib/adCreativesArchive";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "clientId is required" }, { status: 400 });

  const archive = await getArchivedCreatives(clientId);
  return NextResponse.json({ archive });
}
