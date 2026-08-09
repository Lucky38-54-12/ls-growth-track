import { revealApolloPerson } from "@/lib/apollo";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Admin-only — gated by the regular admin session cookie via middleware.ts.
// Separate from apollo-search on purpose: this is the call that spends an
// Apollo credit, so it only ever fires per-person on explicit user action.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  try {
    const person = await revealApolloPerson(body.id);
    return NextResponse.json({ person });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Apollo reveal failed" }, { status: 400 });
  }
}
