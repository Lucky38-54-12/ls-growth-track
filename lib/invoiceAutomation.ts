import { google } from "googleapis";
import { getLuckyGoogleAuthedClient } from "@/lib/luckyGoogleAuth";
import { shareWithEmail } from "@/lib/googleDocs";
import { createSupabaseClient } from "@/lib/supabase";
import { notifySlack } from "@/lib/slackNotify";
import { reportAutomationStatus } from "@/lib/automationStatus";
import { draftMessage } from "@/lib/gmail";

type SupabaseClient = ReturnType<typeof createSupabaseClient>;

const APP_URL = process.env.APP_URL || "https://app.lsgrowth.agency";
// Compact (23KB) copy of the full letterhead logo (public/agreement-assets/logo.png,
// ~900KB) — the full-size file makes every generated invoice doc/PDF
// needlessly huge (~1MB) for an image that only ever renders at 90pt. Lives
// in the same already-public /agreement-assets path so it needs no new
// middleware.ts entry (see PUBLIC_PATHS).
const LOGO_URL = `${APP_URL}/agreement-assets/logo-small.png`;
const DEFAULT_FOLDER_ID = "1_2E0ugCHU8POB7O3abgksA0OKGMlVOeR";
const ACCOUNT_NUMBER = "12-3153-0167681-50"; // see reference_invoice_bank_account memory

type InvoiceTone = "overdue" | "simple";

function nzTodayISODate(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Pacific/Auckland" }).format(new Date());
}

function formatNZDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-NZ", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

interface InvoiceClient {
  id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  monthly_fee: number | null;
  next_payment_due_date: string | null;
  last_invoice_drafted_due_date: string | null;
  status: string | null;
}

async function createInvoiceDoc(client: InvoiceClient): Promise<string> {
  const auth = await getLuckyGoogleAuthedClient();
  const docs = google.docs({ version: "v1", auth });
  const drive = google.drive({ version: "v3", auth });

  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID || DEFAULT_FOLDER_ID;
  const created = await drive.files.create({
    requestBody: { name: `${client.name} Invoice - ${nzTodayISODate()}`, mimeType: "application/vnd.google-apps.document", parents: [folderId] },
    fields: "id",
    supportsAllDrives: true,
  });
  const docId = created.data.id!;

  // Logo first, centered — same two-step pattern as
  // createDocFromMarkedTextWithPhotos in lib/googleDocs.ts (the image's
  // inserted height needs to land before the body text's insert index is known).
  await docs.documents.batchUpdate({
    documentId: docId,
    requestBody: {
      requests: [
        { insertInlineImage: { location: { index: 1 }, uri: LOGO_URL, objectSize: { height: { magnitude: 90, unit: "PT" }, width: { magnitude: 90, unit: "PT" } } } },
        { insertText: { location: { index: 2 }, text: "\n\n" } },
        { updateParagraphStyle: { range: { startIndex: 1, endIndex: 2 }, paragraphStyle: { alignment: "CENTER" }, fields: "alignment" } },
      ],
    },
  });

  const afterLogo = await docs.documents.get({ documentId: docId, fields: "body.content" });
  const logoContent = afterLogo.data.body?.content || [];
  const insertAt = Math.max(1, (logoContent.length ? logoContent[logoContent.length - 1].endIndex || 1 : 1) - 1);

  const amount = (client.monthly_fee || 0).toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const dueDate = client.next_payment_due_date ? formatNZDate(client.next_payment_due_date) : formatNZDate(nzTodayISODate());

  const lines: [string, "heading" | "bold" | null][] = [
    ["INVOICE", "heading"],
    [`Invoice Date: ${dueDate}`, null],
    ["", null],
    ["From", "bold"],
    ["Lucky", null],
    ["LS Growth", null],
    ["Email: Lucky@lsgrowth.agency", null],
    ["Phone: 021 028 20190", null],
    ["", null],
    ["To", "bold"],
    [client.contact_name || client.name, null],
    [client.name, null],
    ["", null],
    ["Description of Services", "bold"],
    [`Meta Ads Management – Monthly Retainer: $${amount}`, null],
    ["", null],
    ["Summary", "bold"],
    [`Subtotal: $${amount}`, null],
    [`Total Due: $${amount} NZD`, "bold"],
    ["", null],
    ["Payment Method: Bank Transfer", null],
    ["Account Name: Lucky", null],
    [`Account Number: ${ACCOUNT_NUMBER}`, null],
    ["", null],
    ["Notes", "bold"],
    ["Thank you for choosing LS Growth.", null],
  ];

  let plainText = "";
  const headingRanges: { start: number; end: number }[] = [];
  const boldRanges: { start: number; end: number }[] = [];
  for (const [text, style] of lines) {
    const start = plainText.length;
    plainText += text + "\n";
    const end = plainText.length - 1;
    if (style === "heading") headingRanges.push({ start, end });
    else if (style === "bold") boldRanges.push({ start, end });
  }

  const requests: object[] = [{ insertText: { location: { index: insertAt }, text: plainText } }];
  for (const r of headingRanges) {
    requests.push({
      updateTextStyle: { range: { startIndex: insertAt + r.start, endIndex: insertAt + r.end }, textStyle: { bold: true, fontSize: { magnitude: 18, unit: "PT" } }, fields: "bold,fontSize" },
    });
  }
  for (const r of boldRanges) {
    requests.push({ updateTextStyle: { range: { startIndex: insertAt + r.start, endIndex: insertAt + r.end }, textStyle: { bold: true }, fields: "bold" } });
  }

  await docs.documents.batchUpdate({ documentId: docId, requestBody: { requests } });

  return `https://docs.google.com/document/d/${docId}/edit`;
}

// Tone rule (per Lucky, 2026-11-17): an ongoing monthly retainer that's
// gone past its due date gets chased ("payment is overdue"); a client whose
// engagement has ended (paused/wrapped up) gets a plain handoff invoice with
// no chasing language, since there's no ongoing relationship to lean on.
function toneFor(client: InvoiceClient): InvoiceTone {
  return client.status === "active" ? "overdue" : "simple";
}

// Runs daily from daily-maintenance. For each client whose payment is due
// or overdue, generates the invoice doc at most once per due cycle (tracked
// via last_invoice_drafted_due_date, not just "once per day" — an overdue
// invoice must not regenerate every single day it stays unpaid) and leaves
// it queued on pending_invoice_doc_url for Lucky to review and send himself
// from /dashboard/payments. Never sends anything itself — see
// feedback_brain_approval_gate memory.
export async function generateInvoicesIfDue(sb: SupabaseClient): Promise<{ generated: number }> {
  const today = nzTodayISODate();
  const { data: clients } = await sb
    .from("lq_clients")
    .select("id, name, contact_name, email, monthly_fee, next_payment_due_date, last_invoice_drafted_due_date, status")
    .not("next_payment_due_date", "is", null)
    .not("monthly_fee", "is", null)
    .lte("next_payment_due_date", today);

  const due = (clients || []) as InvoiceClient[];
  const toGenerate = due.filter((c) => c.last_invoice_drafted_due_date !== c.next_payment_due_date);

  const generated: { name: string; url: string; draftedEmail: boolean }[] = [];
  for (const client of toGenerate) {
    try {
      const url = await createInvoiceDoc(client);

      let draftedEmail = false;
      if (client.email) {
        try {
          await shareWithEmail(url, client.email, "reader");
          const amount = (client.monthly_fee || 0).toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          const { subject, body } = buildInvoiceEmail({ contactName: client.contact_name || client.name, amount, docUrl: url, tone: toneFor(client) });
          await draftMessage({ to: client.email, subject, body });
          draftedEmail = true;
        } catch (e) {
          // Doc still generated and visible on /dashboard/payments even if
          // sharing/drafting failed (e.g. client has no usable email on
          // file) — don't lose the invoice itself over this.
          console.error(`invoice automation: draft email failed for ${client.name}`, e instanceof Error ? e.message : e);
        }
      }

      await sb
        .from("lq_clients")
        .update({ pending_invoice_doc_url: url, pending_invoice_tone: toneFor(client), last_invoice_drafted_due_date: client.next_payment_due_date })
        .eq("id", client.id);
      generated.push({ name: client.name, url, draftedEmail });
    } catch (e) {
      await reportAutomationStatus(sb, "invoice-automation", "error", `Invoice generation failed for ${client.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (generated.length > 0) {
    await notifySlack(
      `🧾 Generated ${generated.length} invoice(s) — a ready-to-send draft is sitting in Gmail Drafts for each one, double check and send yourself:\n` +
      generated.map((g) => `• ${g.name}${g.draftedEmail ? "" : " (doc only, no draft — check their email on file)"}`).join("\n")
    );
    await reportAutomationStatus(sb, "invoice-automation", "ok", `Generated ${generated.length} invoice(s)`);
  }

  return { generated: generated.length };
}

// Builds the body in Lucky's voice (see writing-style.md) — "overdue" chases
// an ongoing retainer that's gone past its due date; "simple" is a plain
// handoff for a client whose engagement has ended, no chasing language.
function buildInvoiceEmail(opts: { contactName: string; amount: string; docUrl: string; tone: InvoiceTone }): { subject: string; body: string } {
  const greeting = `Hi ${opts.contactName},`;
  if (opts.tone === "overdue") {
    return {
      subject: "LS Growth Invoice - payment overdue",
      body: `${greeting}\n\nThis month's invoice for LS Growth's Meta Ads Management services is now overdue.\n\nAmount due: $${opts.amount} NZD\nPayment method: Bank transfer\nAccount name: Lucky\nAccount number: ${ACCOUNT_NUMBER}\n\nInvoice document: ${opts.docUrl}\n\nI'd appreciate it if you could action this at your earliest convenience.\n\nKind regards,\nLucky\nLS Growth\n021 028 20190`,
    };
  }
  return {
    subject: "LS Growth Invoice",
    body: `${greeting}\n\nPlease find this month's invoice for LS Growth's services below.\n\nAmount due: $${opts.amount} NZD\nPayment method: Bank transfer\nAccount name: Lucky\nAccount number: ${ACCOUNT_NUMBER}\n\nInvoice document: ${opts.docUrl}\n\nKind regards,\nLucky\nLS Growth\n021 028 20190`,
  };
}
