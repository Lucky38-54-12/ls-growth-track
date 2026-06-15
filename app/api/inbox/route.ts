import { NextRequest, NextResponse } from "next/server";
import { fetchInbox, fetchMessageDetail } from "@/lib/gmail";

export const dynamic = "force-dynamic";

// GET /api/inbox          → list inbox
// GET /api/inbox?uid=123  → single message detail
export async function GET(req: NextRequest) {
  const uid = req.nextUrl.searchParams.get("uid");
  try {
    if (uid) {
      const msg = await fetchMessageDetail(Number(uid));
      return NextResponse.json({ message: msg });
    }
    const messages = await fetchInbox(40);
    return NextResponse.json({ messages });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Gmail error" }, { status: 500 });
  }
}
