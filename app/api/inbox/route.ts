import { NextRequest, NextResponse } from "next/server";
import { fetchMailbox, fetchMessageDetail, archiveMessage, trashMessage, markAsUnread, SPECIAL_FOLDERS, MailAccount } from "@/lib/gmail";
import { sendFreeformEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

function parseAccount(value: string | null): MailAccount {
  return value === "zoho" ? "zoho" : "gmail";
}

// GET /api/inbox                                  → inbox list (gmail)
// GET /api/inbox?account=zoho                     → inbox list (zoho)
// GET /api/inbox?mailbox=sent                      → sent list
// GET /api/inbox?uid=123                          → inbox message detail
// GET /api/inbox?uid=123&mailbox=sent&account=zoho → sent message detail
export async function GET(req: NextRequest) {
  const uid = req.nextUrl.searchParams.get("uid");
  const account = parseAccount(req.nextUrl.searchParams.get("account"));
  const mailbox = req.nextUrl.searchParams.get("mailbox") === "sent"
    ? SPECIAL_FOLDERS[account].sent
    : "INBOX";

  try {
    if (uid) {
      const msg = await fetchMessageDetail(Number(uid), mailbox, account);
      return NextResponse.json({ message: msg });
    }
    const messages = await fetchMailbox(mailbox, 40, account);
    return NextResponse.json({ messages });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Mailbox error" }, { status: 500 });
  }
}

// POST /api/inbox — send a reply or compose a new email
// Body: { action: "reply"|"compose", to, subject, body, inReplyTo?, references?, account? }
export async function POST(req: NextRequest) {
  try {
    const { to, subject, body, inReplyTo, references, account } = await req.json();
    if (!to || !subject || !body) {
      return NextResponse.json({ error: "Missing to, subject, or body" }, { status: 400 });
    }
    await sendFreeformEmail(to, subject, body, inReplyTo, references, parseAccount(account));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Send failed" }, { status: 500 });
  }
}

// PATCH /api/inbox — archive, trash, or mark as unread
// Body: { action: "archive"|"trash"|"markUnread", uid, mailbox?, account? }
export async function PATCH(req: NextRequest) {
  try {
    const { action, uid, mailbox, account } = await req.json();
    if (!uid) return NextResponse.json({ error: "Missing uid" }, { status: 400 });
    const acc = parseAccount(account);

    if (action === "archive") await archiveMessage(Number(uid), acc);
    else if (action === "trash") await trashMessage(Number(uid), mailbox, acc);
    else if (action === "markUnread") await markAsUnread(Number(uid), mailbox, acc);
    else return NextResponse.json({ error: "Unknown action" }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Action failed" }, { status: 500 });
  }
}
