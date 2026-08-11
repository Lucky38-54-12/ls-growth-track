import { findWorkingAds } from "@/lib/adResearch";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { niche, location } = body;
  if (typeof niche !== "string" || !niche.trim()) {
    return NextResponse.json({ error: "niche is required" }, { status: 400 });
  }

  try {
    const result = await findWorkingAds(niche.trim(), typeof location === "string" ? location.trim() : "");
    return NextResponse.json(result);
  } catch (err) {
    const messageText = err instanceof Error ? err.message : "unknown_error";
    return NextResponse.json({ error: messageText }, { status: 500 });
  }
}
