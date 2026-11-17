import { dismissDiscoveredPage } from "@/lib/leadQual/meta";
import { NextRequest, NextResponse } from "next/server";

export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  await dismissDiscoveredPage(params.id);
  return NextResponse.json({ ok: true });
}
