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
    const isTitle = rawLine.startsWith("# ") && !rawLine.startsWith("## ");
    // Anything from "## " to "###### " counts as a heading — models
    // sometimes emit a deeper level than asked for (e.g. "### " for a
    // numbered sub-point like "1.1 Campaign Management"), and this doc only
    // has one heading style anyway, so any depth just collapses to it
    // instead of leaking literal "###" text into the document.
    const headingMatch = rawLine.match(/^(#{2,6})\s+/);
    const isHeading = !isTitle && !!headingMatch;
    const line = isTitle ? rawLine.slice(2) : isHeading ? rawLine.slice(headingMatch![0].length) : rawLine;
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

// Accepts a pasted Drive folder link (or a bare folder ID) and pulls out the
// folder ID — Drive folder URLs look like
// https://drive.google.com/drive/folders/<id>?usp=sharing, but people also
// just paste the raw id, so both are handled.
export function extractDriveFolderId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const fromUrl = trimmed.match(/folders\/([a-zA-Z0-9_-]+)/);
  if (fromUrl) return fromUrl[1];
  if (/^[a-zA-Z0-9_-]{10,}$/.test(trimmed)) return trimmed;
  return null;
}

export interface DriveImage {
  id: string;
  name: string;
}

// Lists the images sitting in a client's Drive folder and makes each one
// link-shareable (view-only) — Docs' insertInlineImage fetches the image
// from a public URI at insertion time, so a Drive file only this account can
// see would fail to embed.
export async function listAndShareImagesInFolder(folderId: string, limit: number = 12): Promise<DriveImage[]> {
  const auth = await getLuckyGoogleAuthedClient();
  const drive = google.drive({ version: "v3", auth });

  const list = await drive.files.list({
    q: `'${folderId}' in parents and mimeType contains 'image/' and trashed=false`,
    fields: "files(id, name)",
    pageSize: limit,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  const files = (list.data.files || []).filter((f): f is { id: string; name: string } => !!f.id && !!f.name);

  await Promise.all(
    files.map((f) =>
      drive.permissions
        .create({ fileId: f.id, requestBody: { role: "reader", type: "anyone" }, supportsAllDrives: true })
        .catch(() => {})
    )
  );

  return files;
}

// Appends an "Attached Photos" section with each image embedded inline —
// called after the doc's text is already written, so this just tacks images
// onto the end rather than trying to interleave them with clauses.
export async function appendImagesToDoc(docId: string, images: DriveImage[]): Promise<void> {
  if (!images.length) return;

  const auth = await getLuckyGoogleAuthedClient();
  const docs = google.docs({ version: "v1", auth });

  const doc = await docs.documents.get({ documentId: docId });
  const content = doc.data.body?.content || [];
  const lastEndIndex = content.length ? content[content.length - 1].endIndex || 1 : 1;
  const insertAt = Math.max(1, lastEndIndex - 1);

  const heading = "\nAttached Photos\n";
  const requests: object[] = [{ insertText: { location: { index: insertAt }, text: heading } }];
  const headingStart = insertAt + 1;
  requests.push({
    updateTextStyle: {
      range: { startIndex: headingStart, endIndex: headingStart + "Attached Photos".length },
      textStyle: { bold: true },
      fields: "bold",
    },
  });

  let idx = insertAt + heading.length;
  for (const img of images) {
    requests.push({
      insertInlineImage: {
        location: { index: idx },
        uri: `https://drive.google.com/uc?export=view&id=${img.id}`,
        objectSize: { height: { magnitude: 200, unit: "PT" }, width: { magnitude: 266, unit: "PT" } },
      },
    });
    idx += 1;
    requests.push({ insertText: { location: { index: idx }, text: "\n" } });
    idx += 1;
  }

  await docs.documents.batchUpdate({ documentId: docId, requestBody: { requests } });
}

// Every generated agreement carries the same LS Growth letterhead and
// Lucky's signature — fetched by the Docs API over plain HTTP, so these have
// to be publicly reachable URLs, not local file paths (see the
// PUBLIC_PATHS entries in middleware.ts that keep them out from behind the
// dashboard login).
const APP_URL = process.env.APP_URL || "https://app.lsgrowth.agency";
const LOGO_URL = `${APP_URL}/agreement-assets/logo.png`;
const SIGNATURE_URL = `${APP_URL}/agreement-assets/signature.png`;

// One-stop helper for the agreement route: creates the doc with the LS
// Growth logo at the top and Lucky's signature dropped into the Provider
// signature block, then — if a photos folder was given — pulls its images
// in as an appended section. Swallows photo-attach failures rather than
// failing the whole doc, since a bad folder link (wrong id, no images,
// folder not shared) shouldn't block getting the agreement itself out the
// door — but the logo/signature are baked into the main batchUpdate since
// every agreement needs them.
export async function createDocFromMarkedTextWithPhotos(
  title: string,
  markedText: string,
  photosFolderUrl?: string
): Promise<string> {
  const auth = await getLuckyGoogleAuthedClient();
  const docs = google.docs({ version: "v1", auth });
  const drive = google.drive({ version: "v3", auth });

  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID || DEFAULT_FOLDER_ID;
  const created = await drive.files.create({
    requestBody: { name: title, mimeType: "application/vnd.google-apps.document", parents: [folderId] },
    fields: "id",
    supportsAllDrives: true,
  });
  const docId = created.data.id!;

  // Logo first, in its own batchUpdate — its inserted width/height need to
  // land before we can know where the agreement text should start.
  await docs.documents.batchUpdate({
    documentId: docId,
    requestBody: {
      requests: [
        {
          insertInlineImage: {
            location: { index: 1 },
            uri: LOGO_URL,
            objectSize: { height: { magnitude: 90, unit: "PT" }, width: { magnitude: 90, unit: "PT" } },
          },
        },
        { insertText: { location: { index: 2 }, text: "\n\n" } },
      ],
    },
  });

  const afterLogo = await docs.documents.get({ documentId: docId, fields: "body.content" });
  const logoContent = afterLogo.data.body?.content || [];
  const insertAt = Math.max(1, (logoContent.length ? logoContent[logoContent.length - 1].endIndex || 1 : 1) - 1);

  await docs.documents.batchUpdate({
    documentId: docId,
    requestBody: { requests: buildFormattingRequests(markedText, insertAt) },
  });

  // Drop Lucky's signature right under "Title: Owner" in the Provider
  // block (before the blank "Signature:" line) — found by locating that
  // line in the plain text we just wrote, rather than trusting the doc's
  // structural content, since insertInlineImage needs a plain character
  // index.
  const ownerMarker = "Title: Owner";
  const plainText = markedText
    .split("\n")
    .map((l) => {
      const headingMatch = l.match(/^(#{2,6})\s+/);
      if (headingMatch) return l.slice(headingMatch[0].length);
      return l.startsWith("# ") ? l.slice(2) : l;
    })
    .join("\n");
  const markerIdx = plainText.lastIndexOf(ownerMarker);
  if (markerIdx !== -1) {
    const lineEnd = plainText.indexOf("\n", markerIdx);
    const sigIndex = insertAt + (lineEnd === -1 ? plainText.length : lineEnd + 1);
    try {
      await docs.documents.batchUpdate({
        documentId: docId,
        requestBody: {
          requests: [
            {
              insertInlineImage: {
                location: { index: sigIndex },
                uri: SIGNATURE_URL,
                objectSize: { height: { magnitude: 53, unit: "PT" }, width: { magnitude: 95, unit: "PT" } },
              },
            },
            { insertText: { location: { index: sigIndex + 1 }, text: "\n" } },
          ],
        },
      });
    } catch (e) {
      console.error("createDocFromMarkedTextWithPhotos: signature insert failed", e instanceof Error ? e.message : e);
    }
  }

  const url = `https://docs.google.com/document/d/${docId}/edit`;

  const folderIdFromInput = photosFolderUrl ? extractDriveFolderId(photosFolderUrl) : null;
  if (folderIdFromInput) {
    try {
      const images = await listAndShareImagesInFolder(folderIdFromInput);
      await appendImagesToDoc(docId, images);
    } catch (e) {
      console.error("createDocFromMarkedTextWithPhotos: photo attach failed", e instanceof Error ? e.message : e);
    }
  }

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
