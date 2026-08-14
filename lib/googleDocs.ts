import { google } from "googleapis";

const LUCKY_EMAIL = "luckyspersonal38@gmail.com";

// Same shared Drive folder lib/salesCallsDrive.ts and lib/sheets-connector.ts
// already use for this exact reason — see moveIntoSharedFolder below.
const DEFAULT_FOLDER_ID = "1_2E0ugCHU8POB7O3abgksA0OKGMlVOeR";

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

// Shared by createDocFromMarkedText and appendMarkedTextToDoc — builds the
// insertText + bold/heading styling requests for a block of "# "/"## "
// marked-up text, offset to wherever it's landing in the doc (index 1 for a
// fresh doc, or the current end of an existing one).
function buildFormattingRequests(markedText: string, insertAt: number): object[] {
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

  return [
    { insertText: { location: { index: insertAt }, text: plainText } },
    ...titleRanges.map((r) => ({
      updateTextStyle: {
        range: { startIndex: insertAt + r.start, endIndex: insertAt + r.end },
        textStyle: { bold: true, fontSize: { magnitude: r.fontSize, unit: "PT" } },
        fields: "bold,fontSize",
      },
    })),
    ...headingRanges.map((r) => ({
      updateTextStyle: {
        range: { startIndex: insertAt + r.start, endIndex: insertAt + r.end },
        textStyle: { bold: true },
        fields: "bold",
      },
    })),
  ];
}

// Takes AI-generated doc text using "# " for the title line and "## " for
// section headings (markdown-lite, stripped before insertion) — lets the
// actual clause content vary freely per deal (trial+threshold, deposit,
// whatever was actually agreed) while still getting consistent bold
// title/heading formatting, instead of hardcoding a fixed set of heading
// strings to search for as the old fixed-template version did.
export async function createDocFromMarkedText(title: string, markedText: string): Promise<string> {
  const { url } = await createDocWithId(title, markedText);
  return url;
}

export async function createDocWithId(title: string, markedText: string): Promise<{ docId: string; url: string }> {
  const auth = getAuth();
  const docs = google.docs({ version: "v1", auth });
  const drive = google.drive({ version: "v3", auth });

  const created = await docs.documents.create({ requestBody: { title } });
  const docId = created.data.documentId!;

  // docs.documents.create always lands the file in the service account's own
  // My Drive, which has zero storage quota for a bare (non-domain-delegated)
  // service account — every operation after this point 403s with a bare
  // "The caller does not have permission" until the file is moved into a
  // folder a real human owns and has shared with the service account. Same
  // fix lib/salesCallsDrive.ts already applies to its spreadsheet backups.
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID || DEFAULT_FOLDER_ID;
  const file = await drive.files.get({ fileId: docId, fields: "parents", supportsAllDrives: true });
  const previousParents = (file.data.parents || []).join(",");
  await drive.files.update({ fileId: docId, addParents: folderId, removeParents: previousParents, supportsAllDrives: true });

  await drive.permissions.create({
    fileId: docId,
    requestBody: { role: "writer", type: "user", emailAddress: LUCKY_EMAIL },
    sendNotificationEmail: false,
    supportsAllDrives: true,
  });

  await docs.documents.batchUpdate({ documentId: docId, requestBody: { requests: buildFormattingRequests(markedText, 1) } });

  return { docId, url: `https://docs.google.com/document/d/${docId}/edit` };
}

// Appends a new marked-up section onto the end of an already-created doc,
// rather than spawning a new one — used so a client's "master doc" (see
// campaign_briefs.google_doc_id) accumulates the strategy brief, ad copy,
// and anything else built for them in one place over time instead of
// scattering across separate Google Docs per regeneration.
export async function appendMarkedTextToDoc(docId: string, markedText: string): Promise<void> {
  const auth = getAuth();
  const docs = google.docs({ version: "v1", auth });

  const doc = await docs.documents.get({ documentId: docId });
  const content = doc.data.body?.content || [];
  const lastEndIndex = content.length ? content[content.length - 1].endIndex || 1 : 1;
  // endIndex includes the doc's implicit trailing newline, which can't be
  // targeted directly — insert just before it, with a blank line first so
  // the new section doesn't run straight into the previous one.
  const insertAt = Math.max(1, lastEndIndex - 1);

  const requests = [
    { insertText: { location: { index: insertAt }, text: "\n\n" } },
    ...buildFormattingRequests(markedText, insertAt + 2),
  ];

  await docs.documents.batchUpdate({ documentId: docId, requestBody: { requests } });
}

export interface DriveDocMatch {
  id: string;
  name: string;
  url: string;
}

// Live full-text search over every Google Doc the service account can see —
// used by the /dashboard/brain chat to find planning docs relevant to
// whatever Lucky just asked, instead of maintaining a separate index of doc
// content that would drift out of date the moment he edits a doc.
export async function searchDriveDocs(query: string, limit: number = 5): Promise<DriveDocMatch[]> {
  const auth = getAuth();
  const drive = google.drive({ version: "v3", auth });

  // Drive's fullText search treats the query as a single phrase, and fails
  // outright on a query containing an apostrophe or quote unless it's
  // escaped — strip anything that isn't a word character so a natural
  // question like "what's our onboarding policy?" doesn't 400.
  const safeQuery = query.replace(/['"\\]/g, " ").trim();
  if (!safeQuery) return [];

  const list = await drive.files.list({
    q: `fullText contains '${safeQuery}' and mimeType='application/vnd.google-apps.document' and trashed=false`,
    spaces: "drive",
    fields: "files(id, name)",
    pageSize: limit,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    corpora: "allDrives",
  });

  return (list.data.files || [])
    .filter((f) => f.id && f.name)
    .map((f) => ({ id: f.id as string, name: f.name as string, url: `https://docs.google.com/document/d/${f.id}/edit` }));
}

// Pulls a Google Doc's plain text content out of its structural elements —
// docs.documents.get returns a nested body.content tree (paragraphs made of
// text runs), not flat text, so this walks it and joins every run.
export async function readGoogleDocText(docId: string, maxChars: number = 6000): Promise<string> {
  const auth = getAuth();
  const docs = google.docs({ version: "v1", auth });

  const doc = await docs.documents.get({ documentId: docId });
  const content = doc.data.body?.content || [];

  let text = "";
  for (const element of content) {
    for (const run of element.paragraph?.elements || []) {
      if (run.textRun?.content) text += run.textRun.content;
    }
  }

  text = text.trim();
  return text.length > maxChars ? text.slice(0, maxChars) + "\n...(truncated)" : text;
}

