import { NextRequest, NextResponse } from "next/server";
import { createDocFromMarkedText } from "@/lib/googleDocs";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { markedText, title } = body;
  if (!markedText || !String(markedText).trim()) {
    return NextResponse.json({ error: "Nothing to put in the doc yet, generate a prep first." }, { status: 400 });
  }

  try {
    const url = await createDocFromMarkedText(title || "Call Prep", String(markedText));
    return NextResponse.json({ url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to create document";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
