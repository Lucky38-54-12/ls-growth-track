import { NextRequest, NextResponse } from "next/server";
import { createAgreementDoc } from "@/lib/googleDocs";
import Anthropic from "@anthropic-ai/sdk";

export const dynamic = "force-dynamic";

const ai = new Anthropic();

interface AgreementDetails {
  clientName: string;
  company: string;
  email: string;
  trade: string;
  focusService: string;
  monthlyFee: string;
  dailyAdSpend: string;
  quoteThreshold: string;
  trialWeeks: string;
  startDate: string;
}

async function extractAgreementDetails(callNotes: string): Promise<AgreementDetails> {
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
  "focusService": "",
  "monthlyFee": "$2,000",
  "dailyAdSpend": "$15",
  "quoteThreshold": "10",
  "trialWeeks": "3",
  "startDate": ""
}

Rules:
- trade = what the business does generally (e.g. "electrical services", "cleaning", "plumbing")
- focusService = the specific service the campaign should focus on first (e.g. "solar installations", "new builds"), else fall back to trade
- monthlyFee = any recurring management fee mentioned, default "$2,000"
- dailyAdSpend = any daily ad spend mentioned, default "$15"
- quoteThreshold = number of qualified quote requests needed to trigger the fee, default "10"
- trialWeeks = length of the free trial in weeks, default "3"
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
    let details: AgreementDetails;

    if (body.callNotes) {
      details = await extractAgreementDetails(body.callNotes);
    } else {
      const { clientName, company, email, trade, focusService, monthlyFee, dailyAdSpend, quoteThreshold, trialWeeks, startDate } = body;
      if (!company && !clientName) {
        return NextResponse.json({ error: "Company or client name is required" }, { status: 400 });
      }
      details = {
        clientName: clientName || "", company: company || clientName, email: email || "",
        trade: trade || "", focusService: focusService || trade || "",
        monthlyFee: monthlyFee || "$2,000", dailyAdSpend: dailyAdSpend || "$15",
        quoteThreshold: quoteThreshold || "10", trialWeeks: trialWeeks || "3",
        startDate: startDate || "",
      };
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
