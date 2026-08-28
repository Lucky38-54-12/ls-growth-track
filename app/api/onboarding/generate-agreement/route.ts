import { NextRequest, NextResponse } from "next/server";
import { generateAgreementDoc } from "@/lib/agreementMaker";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const dealNotes = body.dealNotes || body.callNotes;
  if (!dealNotes || !String(dealNotes).trim()) {
    return NextResponse.json({ error: "Deal notes are required" }, { status: 400 });
  }

  try {
    const url = await generateAgreementDoc(
      {
        company: body.company || undefined,
        trade: body.trade || undefined,
        email: body.email || undefined,
        dealNotes: String(dealNotes),
      },
      body.photosFolderUrl || undefined
    );
    return NextResponse.json({ url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to create document";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
