import { NextRequest, NextResponse } from "next/server";
import { createDocFromMarkedTextWithPhotos } from "@/lib/googleDocs";
import Anthropic from "@anthropic-ai/sdk";

export const dynamic = "force-dynamic";

const ai = new Anthropic();

// Structure/tone reference only — the model rewrites every clause (fees,
// payment terms especially) to match whatever the actual deal notes say,
// rather than filling blanks in this fixed shape. Keeps every generated
// agreement consistent in format without forcing every deal into the same
// trial+threshold structure this particular example happens to use.
const REFERENCE_TEMPLATE = `META ADS MANAGEMENT AGREEMENT

LS Growth – Meta (Facebook & Instagram) Advertising
Client: Charl Van der Mescht – HRC Electrical ("Client")
Provider: LS & Growth ("Provider")
Effective Date: 26/07/26
Campaign Start Date: 27/07/26

1) Scope of Work
1.1 Campaign Management (Meta Ads)
The Provider will manage Meta (Facebook & Instagram) advertising campaigns designed to generate qualified quote requests for electrical services offered by HRC Electrical, with an initial focus on solar installations (the "Campaign").
1.2 Services Include
Campaign strategy and setup
Ongoing campaign management and optimisation
Ad creative implementation (copywriting and approved image/video assets)
Audience targeting and location configuration
Lead form setup and lead delivery system
Lead handling and calendar booking of quote requests
Ongoing testing and optimisation
Performance monitoring and reporting
1.3 Platform
All campaigns will run on Meta (Facebook & Instagram). Advertising spend is paid directly by the Client to Meta via the Client's own ad account.

2) Fees (NZD)
2.1 Trial Period (First 3 Weeks)
The first 3 weeks of campaign management are provided at no cost to the Client. No management fee applies during this period.
2.2 Ongoing Management Fee
If the performance condition in Section 3 is met, the Client agrees to pay a flat monthly management fee of NZD $2,000, covering ads management, lead handling and calendar booking of quote requests.
2.3 Advertising Spend
Advertising spend is paid directly by the Client to Meta throughout the trial period and beyond. This is separate from the management fee and is the Client's responsibility from day one. The Campaign will begin at approximately NZD $15 per day in advertising spend, which may be increased by mutual agreement as the Campaign scales.
2.4 GST
All amounts are exclusive of GST (if applicable).

3) Payment Terms & Performance Guarantee
This Agreement begins with a 3-week free trial. No management fees are charged during this period.
If the Campaign generates at least 10 qualified quote requests for HRC Electrical during the 3-week trial, the Client agrees to pay the NZD $2,000 monthly management fee from that point forward.
If 10 qualified quote requests are not generated within the trial period, the Client owes nothing and may walk away from this Agreement at no cost.
A "qualified quote request" means a genuine enquiry received through the Campaign's lead form or landing page, screened and confirmed as a fit by the Provider.
The Client must promptly notify the Provider of any confirmed quote requests so performance can be tracked.
There is no lock-in beyond what is agreed here – either party may cancel in writing at any time after the trial.

4) Setup & Term
4.1 Setup
Setup takes 3-5 business days once the Provider has received photos/videos and the required access (Meta Business Manager, Facebook Page and Ad Account).
4.2 Term
This Agreement begins with a 3-week free trial period. If the performance condition in Section 3 is met, the Agreement continues on a month-to-month basis with no minimum fixed term. Either party may cancel in writing at any time after the trial.

5) Client Responsibilities
The Client agrees to:
Provide and maintain access to Meta Business Manager, Facebook Page and Ad Account
Supply photos, videos and any other creative assets required for setup
Confirm service areas and priority services
Pay Meta directly for advertising spend and keep payment methods active throughout the trial and beyond
Respond promptly to approvals or requests that may impact campaign performance
Promptly notify the Provider of quote requests generated through the Campaign for performance verification

6) Ownership & Data
All advertising campaigns, creatives and audiences remain the property of the Provider until all fees due under this Agreement are paid.
Upon full payment, the Client gains full usage rights to campaign assets created specifically for their business.
Meta ad accounts, leads generated and business pages remain the property of the Client.
The Provider may retain anonymised campaign data for internal benchmarking or portfolio use.

7) Performance & Liability
The Provider will perform services with reasonable care and skill. Due to variables such as market demand, ad budget, competition and seasonality, the Provider does not guarantee specific results beyond the condition outlined in Section 3. The Provider's liability is limited to the total management fees paid by the Client under this Agreement.

8) Publicity
The Provider may reference HRC Electrical as a client and use non-sensitive campaign data in its portfolio unless the Client objects in writing.

9) Governing Law
This Agreement is governed by the laws of New Zealand. Both parties submit to the exclusive jurisdiction of the New Zealand courts.

10) Entire Agreement
This Agreement represents the entire understanding between the Client and Provider regarding Meta Ads management. Any amendments must be made in writing (email acceptable).

Signatures
Client – HRC Electrical ("Client")
Name: Charl Van der Mescht
Signature: _________________________
Date: 26/07/26

Provider – LS & Growth
Name: Lucky
Title: Owner
Signature:
Date: 26/07/26`;

async function generateAgreementText(input: {
  company?: string;
  trade?: string;
  email?: string;
  dealNotes: string;
}): Promise<{ title: string; body: string }> {
  const effectiveDate = new Date().toLocaleDateString("en-NZ", { day: "numeric", month: "2-digit", year: "2-digit" });

  const msg = await ai.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 3000,
    messages: [
      {
        role: "user",
        content: `You write client service agreements for LS Growth (a marketing agency, "LS & Growth" in the signature block), based on a reference template and this specific deal's notes.

REFERENCE TEMPLATE (match its structure, section order, tone, and level of detail — but rewrite every clause, especially Fees and Payment Terms, to match what the deal notes actually say below. Don't force a trial+threshold structure if the deal notes describe something else, e.g. a deposit or a flat monthly fee from day one):

${REFERENCE_TEMPLATE}

CLIENT INFO:
${input.company ? `Business name: ${input.company}\n` : ""}${input.trade ? `Trade: ${input.trade}\n` : ""}${input.email ? `Contact email: ${input.email}\n` : ""}Effective date: ${effectiveDate}

DEAL NOTES (what was actually agreed for this client — the source of truth for terms, overrides the reference template's specific numbers/structure wherever they differ):
${input.dealNotes}

Output ONLY the full agreement document text, nothing else — no preamble, no markdown code fences, no commentary. Formatting rules:
- First line starts with "# " followed by the document title in caps (e.g. "# META ADS MANAGEMENT AGREEMENT", or something more fitting if the deal notes describe different services).
- Every section heading line — including numbered sub-points like "1.1 Campaign Management (Meta Ads)" — is prefixed with exactly "## ", never "### " or any other depth. There is only one heading style in this document.
- Otherwise plain text: blank lines between paragraphs, "• " for bullet items, no other markdown, no "#" characters anywhere outside a heading prefix.
- Keep the same overall sections as the reference template (Scope, Fees, Payment Terms, Setup & Term, Client Responsibilities, Ownership & Data, Performance & Liability, Publicity, Governing Law, Entire Agreement, Signatures) unless the deal notes clearly call for something different.
- Use the real client/business name from CLIENT INFO throughout. If a contact person's name isn't given anywhere, use the business name in the signature block instead of leaving it blank.
- Never invent specifics — a location/service area, employee count, service names, or anything else concrete — that isn't explicitly stated in CLIENT INFO or DEAL NOTES. If something like the service area isn't given, describe it generically (e.g. just "location configuration", no parenthetical area) rather than guessing one.
- End with a Signatures section: the Client's name/signature line/date, and a Provider block (Name: Lucky, Title: Owner, "LS & Growth", Date).`,
      },
    ],
  });

  const raw = (msg.content[0] as { type: string; text: string }).text.trim();
  const titleLine = raw.split("\n").find((l) => l.startsWith("# "));
  const titleText = titleLine ? titleLine.slice(2).trim() : "Agreement";
  return { title: `Agreement with ${input.company || titleText}`, body: raw };
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const dealNotes = body.dealNotes || body.callNotes;
  if (!dealNotes || !String(dealNotes).trim()) {
    return NextResponse.json({ error: "Deal notes are required" }, { status: 400 });
  }

  try {
    const { title, body: docBody } = await generateAgreementText({
      company: body.company || undefined,
      trade: body.trade || undefined,
      email: body.email || undefined,
      dealNotes: String(dealNotes),
    });
    const url = await createDocFromMarkedTextWithPhotos(title, docBody, body.photosFolderUrl || undefined);
    return NextResponse.json({ url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to create document";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
