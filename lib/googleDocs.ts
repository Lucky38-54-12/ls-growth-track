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
  setupFee: string;
  monthlyFee: string;
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
  const setupFee = data.setupFee || "$750";
  const monthlyFee = data.monthlyFee || "$1,200";
  const startDate = data.startDate || "TBC";

  const servicesList = data.services
    ? data.services
    : `Campaign strategy and setup\nOngoing campaign management and optimisation\nAd creative implementation (copywriting and approved image/video assets)\nAudience targeting and location configuration\nLead form setup and lead delivery system\nOngoing testing and optimisation\nPerformance monitoring and reporting`;

  // Build the full document text
  const body = [
    `META ADS MANAGEMENT AGREEMENT\n`,
    `Client: ${data.clientName} – ${data.company} ("Client")\n`,
    `Provider: LS & Growth ("Provider")\n`,
    `Effective Date: ${effectiveDate}\n`,
    `Campaign Start Date: ${startDate}\n\n`,

    `1) Scope of Work\n\n`,
    `1.1 Campaign Management (Meta Ads) The Provider will manage Meta (Facebook & Instagram) advertising campaigns designed to generate enquiries for ${tradeLabel} offered by ${data.company} (the "Campaign").\n\n`,
    `1.2 Services Include\n`,
    ...servicesList.split("\n").map((s: string) => `• ${s.trim()}\n`),
    `\n`,
    `1.3 Platform All campaigns will run on Meta (Facebook & Instagram). Advertising spend is paid directly by the Client to Meta via the Client's own ad account.\n\n`,

    `2) Fees (NZD)\n\n`,
    `2.1 Setup Fee A one-time campaign setup fee of NZD ${setupFee}, payable only if the performance condition in Section 3 is met.\n\n`,
    `2.2 Monthly Management Fee A campaign management fee of NZD ${monthlyFee} per month, payable only if the performance condition in Section 3 is met. Monthly fees include:\n`,
    `• Ongoing optimisation\n• Creative testing\n• Reporting\n• Campaign management\n\n`,
    `2.3 Advertising Spend Advertising spend is paid directly by the Client to Meta and is separate from management fees.\n\n`,
    `2.4 GST All amounts are exclusive of GST (if applicable).\n\n`,

    `3) Payment Terms & Performance Guarantee\n\n`,
    `• This Agreement operates on a trial-month basis with a performance guarantee.\n`,
    `• If the Campaign generates at least 1 confirmed job for ${data.company} during the trial month, the Client agrees to pay the ${setupFee} setup fee and the ${monthlyFee} monthly management fee.\n`,
    `• If no confirmed job is generated, the Client owes nothing and may walk away from this Agreement at no cost.\n`,
    `• A "confirmed job" means a paying client engagement that originated from a lead generated through the Campaign.\n`,
    `• The Client must promptly notify the Provider of any confirmed jobs so performance can be verified.\n\n`,

    `4) Term\n\n`,
    `This Agreement is an open, month-to-month contract. There is no minimum fixed term. After the trial month (assuming the performance condition in Section 3 is met), the Agreement continues month-to-month until either party cancels in writing.\n\n`,

    `5) Client Responsibilities\n\n`,
    `The Client agrees to:\n`,
    `• Provide and maintain access to Meta Business Manager, Facebook Page and Ad Account\n`,
    `• Supply or approve creative assets where required\n`,
    `• Confirm service areas and priority services\n`,
    `• Pay Meta directly for advertising spend and keep payment methods active\n`,
    `• Respond promptly to approvals or requests that may impact campaign performance\n`,
    `• Promptly notify the Provider of any confirmed job leads for performance verification\n\n`,

    `6) Ownership & Data\n\n`,
    `• All advertising campaigns, creatives and audiences remain the property of the Provider until all fees due under this Agreement are paid.\n`,
    `• Upon full payment, the Client gains full usage rights to campaign assets created specifically for their business.\n`,
    `• Meta ad accounts, leads generated and business pages remain the property of the Client.\n`,
    `• The Provider may retain anonymised campaign data for internal benchmarking or portfolio use.\n\n`,

    `7) Performance & Liability\n\n`,
    `The Provider will perform services with reasonable care and skill. Due to variables such as market demand, ad budget, competition and seasonality, the Provider does not guarantee specific results, leads or sales outcomes beyond the condition outlined in Section 3. The Provider's liability is limited to the total management fees paid by the Client under this Agreement.\n\n`,

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
    ...["1) Scope of Work", "2) Fees (NZD)", "3) Payment Terms & Performance Guarantee", "4) Term", "5) Client Responsibilities", "6) Ownership & Data", "7) Performance & Liability", "8) Publicity", "9) Governing Law", "10) Entire Agreement", "Signatures"].flatMap(heading => {
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
