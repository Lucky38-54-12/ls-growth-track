import { getLuckyGoogleConnectionStatus } from "@/lib/luckyGoogleAuth";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const status = await getLuckyGoogleConnectionStatus();
  return NextResponse.json(status);
}
