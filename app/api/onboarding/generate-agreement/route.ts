import { NextRequest, NextResponse } from "next/server";
import { createAgreementDoc } from "@/lib/googleDocs";
import Anthropic from "@anthropic-ai/sdk";

export const dynamic = "force-dynamic";

const ai = new Anthropic();

async function extractAgreementDetails(callNotes: string) {
  const msg = await ai.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 512,
    messages: [{
      role: "user",
      content: `Extract agreement details from these call notes. Return ONLY valid JSON, no markdown.

Notes:
${callNotes}

Return this exact JSON shape (use empty string if not found):
{
  "clientName": "",
  "company": "",
  "email": "",
  "trade": "",
  "setupFee": "$750",
  "monthlyFee": "$1,200",
  "startDate": ""
}

Rules:
- trade = what the business does (e.g. "cleaning", "plumbing", "building")
- setupFee = any one-time fee mentioned, default "$750"
- monthlyFee = any recurring fee mentioned, default "$1,200"
- startDate = campaign start date if mentioned, else empty`,
    }],
  });

  const raw = (msg.content[0] as { type: string; text: string }).text.trim();
  const jsonStr = raw.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  return JSON.parse(jsonStr);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const effectiveDate = new Date().toLocaleDateString("en-NZ", { day: "numeric", month: "2-digit", year: "2-digit" });

  try {
    let details: { clientName: string; company: string; email: string; trade: string; setupFee: string; monthlyFee: string; startDate: string };

    if (body.callNotes) {
      details = await extractAgreementDetails(body.callNotes);
    } else {
      const { clientName, company, email, trade, setupFee, monthlyFee, startDate } = body;
      if (!company && !clientName) {
        return NextResponse.json({ error: "Company or client name is required" }, { status: 400 });
      }
      details = { clientName: clientName || "", company: company || clientName, email: email || "", trade: trade || "", setupFee: setupFee || "$750", monthlyFee: monthlyFee || "$1,200", startDate: startDate || "" };
    }

    if (!details.company && !details.clientName) {
      return NextResponse.json({ error: "Could not extract company name from notes." }, { status: 400 });
    }

    const docUrl = await createAgreementDoc({
      ...details,
      company: details.company || details.clientName,
      effectiveDate,
    });
    return NextResponse.json({ url: docUrl });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to create document";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
