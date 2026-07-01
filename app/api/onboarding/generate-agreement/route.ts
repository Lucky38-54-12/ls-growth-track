import { NextRequest, NextResponse } from "next/server";
import { createAgreementDoc } from "@/lib/googleDocs";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { clientName, company, email, trade, setupFee, monthlyFee, startDate, services } = body;

  if (!company && !clientName) {
    return NextResponse.json({ error: "Company or client name is required" }, { status: 400 });
  }

  const effectiveDate = new Date().toLocaleDateString("en-NZ", { day: "numeric", month: "2-digit", year: "2-digit" });

  try {
    const docUrl = await createAgreementDoc({
      clientName: clientName || "",
      company: company || clientName,
      email: email || "",
      trade: trade || "",
      setupFee: setupFee || "$750",
      monthlyFee: monthlyFee || "$1,200",
      startDate: startDate || "",
      effectiveDate,
      services,
    });
    return NextResponse.json({ url: docUrl });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to create document";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
