import { google } from "googleapis";

const LUCKY_EMAIL = "luckyspersonal38@gmail.com";

function getAuth() {
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!key) throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY not set");
  const credentials = JSON.parse(key);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: [
      "https://www.googleapis.com/auth/documents",
      "https://www.googleapis.com/auth/drive",
    ],
  });
}

export interface AgreementData {
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
  effectiveDate: string;
  services?: string;
}

export async function createAgreementDoc(data: AgreementData): Promise<string> {
  const auth = getAuth();
  const docs = google.docs({ version: "v1", auth });
  const drive = google.drive({ version: "v3", auth });

  const docTitle = `Agreement with ${data.company || data.clientName}`;

  // Create blank doc
  const created = await docs.documents.create({ requestBody: { title: docTitle } });
  const docId = created.data.documentId!;

  // Share with Lucky so it appears in his Drive
  await drive.permissions.create({
    fileId: docId,
    requestBody: { role: "writer", type: "user", emailAddress: LUCKY_EMAIL },
    sendNotificationEmail: false,
  });

  const effectiveDate = data.effectiveDate || new Date().toLocaleDateString("en-NZ", { day: "numeric", month: "2-digit", year: "2-digit" });
  const tradeLabel = data.trade || "your services";
  const focusService = data.focusService || tradeLabel;
  const monthlyFee = data.monthlyFee || "$2,000";
  const dailyAdSpend = data.dailyAdSpend || "$15";
  const quoteThreshold = data.quoteThreshold || "10";
  const trialWeeks = data.trialWeeks || "3";
  const startDate = data.startDate || "TBC";

  const servicesList = data.services
    ? data.services
    : `Campaign strategy and setup\nOngoing campaign management and optimisation\nAd creative implementation (copywriting and approved image/video assets)\nAudience targeting and location configuration\nLead form setup and lead delivery system\nLead handling and calendar booking of quote requests\nOngoing testing and optimisation\nPerformance monitoring and reporting`;

  // Build the full document text
  const body = [
    `META ADS MANAGEMENT AGREEMENT\n`,
    `Client: ${data.clientName} – ${data.company} ("Client")\n`,
    `Provider: LS & Growth ("Provider")\n`,
    `Effective Date: ${effectiveDate}\n`,
    `Campaign Start Date: ${startDate}\n\n`,

    `1) Scope of Work\n\n`,
    `1.1 Campaign Management (Meta Ads) The Provider will manage Meta (Facebook & Instagram) advertising campaigns designed to generate qualified quote requests for ${tradeLabel} offered by ${data.company}, with an initial focus on ${focusService} (the "Campaign").\n\n`,
    `1.2 Services Include\n`,
    ...servicesList.split("\n").map((s: string) => `• ${s.trim()}\n`),
    `\n`,
    `1.3 Platform All campaigns will run on Meta (Facebook & Instagram). Advertising spend is paid directly by the Client to Meta via the Client's own ad account.\n\n`,

    `2) Fees (NZD)\n\n`,
    `2.1 Trial Period (First ${trialWeeks} Weeks) The first ${trialWeeks} weeks of campaign management are provided at no cost to the Client. No management fee applies during this period.\n\n`,
    `2.2 Ongoing Management Fee If the performance condition in Section 3 is met, the Client agrees to pay a flat monthly management fee of NZD ${monthlyFee}, covering ads management, lead handling and calendar booking of quote requests.\n\n`,
    `2.3 Advertising Spend Advertising spend is paid directly by the Client to Meta throughout the trial period and beyond. This is separate from the management fee and is the Client's responsibility from day one. The Campaign will begin at approximately NZD ${dailyAdSpend} per day in advertising spend, which may be increased by mutual agreement as the Campaign scales.\n\n`,
    `2.4 GST All amounts are exclusive of GST (if applicable).\n\n`,

    `3) Payment Terms & Performance Guarantee\n\n`,
    `This Agreement begins with a ${trialWeeks}-week free trial. No management fees are charged during this period.\n`,
    `If the Campaign generates at least ${quoteThreshold} qualified quote requests for ${data.company} during the ${trialWeeks}-week trial, the Client agrees to pay the NZD ${monthlyFee} monthly management fee from that point forward.\n`,
    `If ${quoteThreshold} qualified quote requests are not generated within the trial period, the Client owes nothing and may walk away from this Agreement at no cost.\n`,
    `A "qualified quote request" means a genuine enquiry received through the Campaign's lead form or landing page, screened and confirmed as a fit by the Provider.\n`,
    `The Client must promptly notify the Provider of any confirmed quote requests so performance can be tracked.\n`,
    `There is no lock-in beyond what is agreed here – either party may cancel in writing at any time after the trial.\n\n`,

    `4) Setup & Term\n\n`,
    `4.1 Setup Setup takes 3-5 business days once the Provider has received photos/videos and the required access (Meta Business Manager, Facebook Page and Ad Account).\n\n`,
    `4.2 Term This Agreement begins with a ${trialWeeks}-week free trial period. If the performance condition in Section 3 is met, the Agreement continues on a month-to-month basis with no minimum fixed term. Either party may cancel in writing at any time after the trial.\n\n`,

    `5) Client Responsibilities\n\n`,
    `The Client agrees to:\n`,
    `• Provide and maintain access to Meta Business Manager, Facebook Page and Ad Account\n`,
    `• Supply photos, videos and any other creative assets required for setup\n`,
    `• Confirm service areas and priority services\n`,
    `• Pay Meta directly for advertising spend and keep payment methods active throughout the trial and beyond\n`,
    `• Respond promptly to approvals or requests that may impact campaign performance\n`,
    `• Promptly notify the Provider of quote requests generated through the Campaign for performance verification\n\n`,

    `6) Ownership & Data\n\n`,
    `• All advertising campaigns, creatives and audiences remain the property of the Provider until all fees due under this Agreement are paid.\n`,
    `• Upon full payment, the Client gains full usage rights to campaign assets created specifically for their business.\n`,
    `• Meta ad accounts, leads generated and business pages remain the property of the Client.\n`,
    `• The Provider may retain anonymised campaign data for internal benchmarking or portfolio use.\n\n`,

    `7) Performance & Liability\n\n`,
    `The Provider will perform services with reasonable care and skill. Due to variables such as market demand, ad budget, competition and seasonality, the Provider does not guarantee specific results beyond the condition outlined in Section 3. The Provider's liability is limited to the total management fees paid by the Client under this Agreement.\n\n`,

    `8) Publicity\n\n`,
    `The Provider may reference ${data.company} as a client and use non-sensitive campaign data in its portfolio unless the Client objects in writing.\n\n`,

    `9) Governing Law\n\n`,
    `This Agreement is governed by the laws of New Zealand. Both parties submit to the exclusive jurisdiction of the New Zealand courts.\n\n`,

    `10) Entire Agreement\n\n`,
    `This Agreement represents the entire understanding between the Client and Provider regarding Meta Ads management. Any amendments must be made in writing (email acceptable).\n\n`,

    `────────────────────────────────────────────────\n\n`,
    `Signatures\n\n`,
    `Client – ${data.company} ("Client")\n`,
    `Name: ${data.clientName}\n`,
    `Signature: ___________________________\n`,
    `Date: ${effectiveDate}\n\n`,
    `Provider – LS & Growth\n`,
    `Name: Lucky\n`,
    `Title: Owner\n`,
    `Date: ${effectiveDate}\n`,
  ];

  const fullText = body.join("");

  // Insert all text at the end of the document
  const requests: object[] = [
    {
      insertText: {
        location: { index: 1 },
        text: fullText,
      },
    },
    // Bold the title
    {
      updateTextStyle: {
        range: { startIndex: 1, endIndex: "META ADS MANAGEMENT AGREEMENT".length + 2 },
        textStyle: { bold: true, fontSize: { magnitude: 20, unit: "PT" } },
        fields: "bold,fontSize",
      },
    },
    // Bold section headings
    ...["1) Scope of Work", "2) Fees (NZD)", "3) Payment Terms & Performance Guarantee", "4) Setup & Term", "5) Client Responsibilities", "6) Ownership & Data", "7) Performance & Liability", "8) Publicity", "9) Governing Law", "10) Entire Agreement", "Signatures"].flatMap(heading => {
      const idx = fullText.indexOf(heading);
      if (idx < 0) return [];
      return [{
        updateTextStyle: {
          range: { startIndex: idx + 1, endIndex: idx + 1 + heading.length },
          textStyle: { bold: true },
          fields: "bold",
        },
      }];
    }),
  ];

  await docs.documents.batchUpdate({ documentId: docId, requestBody: { requests } });

  return `https://docs.google.com/document/d/${docId}/edit`;
}
