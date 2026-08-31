import { generateCreativeHypotheses } from "@/lib/creativeBrain";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const clientId = typeof body.clientId === "string" ? body.clientId.trim() : "";
  if (!clientId) return NextResponse.json({ error: "clientId is required" }, { status: 400 });

  try {
    const result = await generateCreativeHypotheses(clientId);
    return NextResponse.json(result);
  } catch (err) {
    const messageText = err instanceof Error ? err.message : "unknown_error";
    return NextResponse.json({ error: messageText }, { status: 500 });
  }
}
