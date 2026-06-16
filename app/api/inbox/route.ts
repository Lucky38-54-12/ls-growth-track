import { NextRequest, NextResponse } from "next/server";
import { fetchMailbox, fetchMessageDetail, archiveMessage, trashMessage, markAsUnread } from "@/lib/gmail";
import { sendFreeformEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

// GET /api/inbox                     → inbox list
// GET /api/inbox?mailbox=sent        → sent list
// GET /api/inbox?uid=123             → inbox message detail
// GET /api/inbox?uid=123&mailbox=sent → sent message detail
export async function GET(req: NextRequest) {
  const uid     = req.nextUrl.searchParams.get("uid");
  const mailbox = req.nextUrl.searchParams.get("mailbox") === "sent"
    ? "[Gmail]/Sent Mail"
    : "INBOX";

  try {
    if (uid) {
      const msg = await fetchMessageDetail(Number(uid), mailbox);
      return NextResponse.json({ message: msg });
    }
    const messages = await fetchMailbox(mailbox, 40);
    return NextResponse.json({ messages });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Gmail error" }, { status: 500 });
  }
}

// POST /api/inbox — send a reply or compose a new email
// Body: { action: "reply"|"compose", to, subject, body, inReplyTo?, references? }
export async function POST(req: NextRequest) {
  try {
    const { to, subject, body, inReplyTo, references } = await req.json();
    if (!to || !subject || !body) {
      return NextResponse.json({ error: "Missing to, subject, or body" }, { status: 400 });
    }
    await sendFreeformEmail(to, subject, body, inReplyTo, references);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Send failed" }, { status: 500 });
  }
}

// PATCH /api/inbox — archive, trash, or mark as unread
// Body: { action: "archive"|"trash"|"markUnread", uid, mailbox? }
export async function PATCH(req: NextRequest) {
  try {
    const { action, uid, mailbox } = await req.json();
    if (!uid) return NextResponse.json({ error: "Missing uid" }, { status: 400 });

    if (action === "archive") await archiveMessage(Number(uid));
    else if (action === "trash") await trashMessage(Number(uid), mailbox);
    else if (action === "markUnread") await markAsUnread(Number(uid), mailbox);
    else return NextResponse.json({ error: "Unknown action" }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Action failed" }, { status: 500 });
  }
}
