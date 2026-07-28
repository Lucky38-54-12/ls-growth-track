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

// Takes AI-generated doc text using "# " for the title line and "## " for
// section headings (markdown-lite, stripped before insertion) — lets the
// actual clause content vary freely per deal (trial+threshold, deposit,
// whatever was actually agreed) while still getting consistent bold
// title/heading formatting, instead of hardcoding a fixed set of heading
// strings to search for as the old fixed-template version did.
export async function createDocFromMarkedText(title: string, markedText: string): Promise<string> {
  const auth = getAuth();
  const docs = google.docs({ version: "v1", auth });
  const drive = google.drive({ version: "v3", auth });

  const created = await docs.documents.create({ requestBody: { title } });
  const docId = created.data.documentId!;

  await drive.permissions.create({
    fileId: docId,
    requestBody: { role: "writer", type: "user", emailAddress: LUCKY_EMAIL },
    sendNotificationEmail: false,
  });

  const lines = markedText.split("\n");
  let plainText = "";
  const titleRanges: { start: number; end: number; fontSize: number }[] = [];
  const headingRanges: { start: number; end: number }[] = [];

  for (const rawLine of lines) {
    const isTitle = rawLine.startsWith("# ");
    const isHeading = rawLine.startsWith("## ");
    const line = isTitle ? rawLine.slice(2) : isHeading ? rawLine.slice(3) : rawLine;
    const start = plainText.length;
    plainText += line + "\n";
    const end = plainText.length - 1;
    if (isTitle) titleRanges.push({ start, end, fontSize: 20 });
    else if (isHeading) headingRanges.push({ start, end });
  }

  const requests: object[] = [
    { insertText: { location: { index: 1 }, text: plainText } },
    ...titleRanges.map((r) => ({
      updateTextStyle: {
        range: { startIndex: r.start + 1, endIndex: r.end + 1 },
        textStyle: { bold: true, fontSize: { magnitude: r.fontSize, unit: "PT" } },
        fields: "bold,fontSize",
      },
    })),
    ...headingRanges.map((r) => ({
      updateTextStyle: {
        range: { startIndex: r.start + 1, endIndex: r.end + 1 },
        textStyle: { bold: true },
        fields: "bold",
      },
    })),
  ];

  await docs.documents.batchUpdate({ documentId: docId, requestBody: { requests } });

  return `https://docs.google.com/document/d/${docId}/edit`;
}

