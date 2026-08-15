import { google } from "googleapis";
import { getLuckyGoogleAuthedClient } from "@/lib/luckyGoogleAuth";

// Organizational parent folder only, now — since docs are created under
// Lucky's own connected Google account (see lib/luckyGoogleAuth.ts), he
// already owns everything created here; this just keeps things tidy
// alongside whatever else lives in this folder instead of scattering into
// Drive's root.
const DEFAULT_FOLDER_ID = "1_2E0ugCHU8POB7O3abgksA0OKGMlVOeR";

// Shared by createDocFromMarkedText and appendMarkedTextToDoc — builds the
// insertText + bold/heading styling requests for a block of "# "/"## "
// marked-up text, offset to wherever it's landing in the doc (index 1 for a
// fresh doc, or the current end of an existing one). tabId, when given,
// scopes every request to that tab (see "Work with tabs" in the Docs API —
// Location/Range objects take an optional tabId); omitted entirely for
// classic single-tab docs so behavior there is unchanged.
function buildFormattingRequests(markedText: string, insertAt: number, tabId?: string): object[] {
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

  const loc = (index: number) => (tabId ? { index, tabId } : { index });
  const range = (startIndex: number, endIndex: number) => (tabId ? { startIndex, endIndex, tabId } : { startIndex, endIndex });

  return [
    { insertText: { location: loc(insertAt), text: plainText } },
    ...titleRanges.map((r) => ({
      updateTextStyle: {
        range: range(insertAt + r.start, insertAt + r.end),
        textStyle: { bold: true, fontSize: { magnitude: r.fontSize, unit: "PT" } },
        fields: "bold,fontSize",
      },
    })),
    ...headingRanges.map((r) => ({
      updateTextStyle: {
        range: range(insertAt + r.start, insertAt + r.end),
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
  const auth = await getLuckyGoogleAuthedClient();
  const docs = google.docs({ version: "v1", auth });
  const drive = google.drive({ version: "v3", auth });

  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID || DEFAULT_FOLDER_ID;
  let step = "files.create";
  let docId: string;
  try {
    const created = await drive.files.create({
      requestBody: { name: title, mimeType: "application/vnd.google-apps.document", parents: [folderId] },
      fields: "id",
      supportsAllDrives: true,
    });
    docId = created.data.id!;
  } catch (e) {
    console.error(`googleDocs step failed: ${step}`, e instanceof Error ? e.message : e);
    throw e;
  }

  try {
    step = "documents.batchUpdate";
    await docs.documents.batchUpdate({ documentId: docId, requestBody: { requests: buildFormattingRequests(markedText, 1) } });
  } catch (e) {
    console.error(`googleDocs step failed: ${step} (docId=${docId})`, e instanceof Error ? e.message : e);
    throw e;
  }

  return { docId, url: `https://docs.google.com/document/d/${docId}/edit` };
}

// Appends a new marked-up section onto the end of an already-created doc,
// rather than spawning a new one — used so a client's "master doc" (see
// campaign_briefs.google_doc_id) accumulates the strategy brief, ad copy,
// and anything else built for them in one place over time instead of
// scattering across separate Google Docs per regeneration.
export async function appendMarkedTextToDoc(docId: string, markedText: string): Promise<void> {
  const auth = await getLuckyGoogleAuthedClient();
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

interface TabNode {
  tabProperties?: { tabId?: string | null; title?: string | null } | null;
  documentTab?: { body?: { content?: unknown[] | null } | null } | null;
  childTabs?: TabNode[] | null;
}

function flattenTabs(tabs: TabNode[] | null | undefined): TabNode[] {
  const out: TabNode[] = [];
  for (const t of tabs || []) {
    out.push(t);
    out.push(...flattenTabs(t.childTabs));
  }
  return out;
}

// Finds a top-level tab by exact title (e.g. a service name), creating it if
// it doesn't exist yet — used so each client's master doc can hold one tab
// per service (Renovation, Decks/fences, etc) instead of one long scrolling
// page. Docs' addDocumentTab response doesn't reliably echo the new tab's
// id back in every client library version, so this re-fetches the doc after
// creating and finds it by title rather than trusting the response shape.
async function getOrCreateTab(docId: string, tabTitle: string): Promise<string> {
  const auth = await getLuckyGoogleAuthedClient();
  const docs = google.docs({ version: "v1", auth });

  const doc = await docs.documents.get({ documentId: docId, includeTabsContent: true });
  const existing = flattenTabs(doc.data.tabs as TabNode[] | undefined).find((t) => t.tabProperties?.title === tabTitle);
  if (existing?.tabProperties?.tabId) return existing.tabProperties.tabId;

  await docs.documents.batchUpdate({
    documentId: docId,
    requestBody: { requests: [{ addDocumentTab: { tabProperties: { title: tabTitle } } } as object] },
  });

  const refreshed = await docs.documents.get({ documentId: docId, includeTabsContent: true });
  const created = flattenTabs(refreshed.data.tabs as TabNode[] | undefined).find((t) => t.tabProperties?.title === tabTitle);
  if (!created?.tabProperties?.tabId) throw new Error(`Created tab "${tabTitle}" but couldn't find its id afterwards`);
  return created.tabProperties.tabId;
}

// Same accumulate-in-place behavior as appendMarkedTextToDoc, but writes
// into (creating if needed) a named tab rather than the doc's default first
// tab — one tab per service on a client's master doc.
export async function appendMarkedTextToDocTab(docId: string, tabTitle: string, markedText: string): Promise<void> {
  const auth = await getLuckyGoogleAuthedClient();
  const docs = google.docs({ version: "v1", auth });

  const tabId = await getOrCreateTab(docId, tabTitle);

  const doc = await docs.documents.get({ documentId: docId, includeTabsContent: true });
  const tab = flattenTabs(doc.data.tabs as TabNode[] | undefined).find((t) => t.tabProperties?.tabId === tabId);
  const content = (tab?.documentTab?.body?.content || []) as { endIndex?: number }[];
  const lastEndIndex = content.length ? content[content.length - 1].endIndex || 1 : 1;
  const insertAt = Math.max(1, lastEndIndex - 1);

  const requests =
    insertAt > 1
      ? [
          { insertText: { location: { index: insertAt, tabId }, text: "\n\n" } },
          ...buildFormattingRequests(markedText, insertAt + 2, tabId),
        ]
      : buildFormattingRequests(markedText, insertAt, tabId);

  await docs.documents.batchUpdate({ documentId: docId, requestBody: { requests } });
}

export interface DriveDocMatch {
  id: string;
  name: string;
  url: string;
}

// Live full-text search over every Google Doc Lucky's connected account can
// see — used by the /dashboard/brain chat to find planning docs relevant to
// whatever Lucky just asked, instead of maintaining a separate index of doc
// content that would drift out of date the moment he edits a doc.
export async function searchDriveDocs(query: string, limit: number = 5): Promise<DriveDocMatch[]> {
  const auth = await getLuckyGoogleAuthedClient();
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
  const auth = await getLuckyGoogleAuthedClient();
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
