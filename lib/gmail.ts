import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

export interface InboxMessage {
  uid: number;
  messageId: string;
  from: string;
  fromEmail: string;
  to: string;
  subject: string;
  date: string;
  snippet: string;
  seen: boolean;
  hasAttachment: boolean;
}

export interface MessageDetail extends InboxMessage {
  bodyHtml: string;
  bodyText: string;
  to: string;
}

function getClient() {
  return new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: {
      user: process.env.GMAIL_USER!,
      pass: process.env.GMAIL_APP_PASSWORD!,
    },
    logger: false,
  });
}

// Fetches the most recent messages from any IMAP mailbox (e.g. "INBOX" or "[Gmail]/Sent Mail").
export async function fetchMailbox(mailbox: string, limit = 40): Promise<InboxMessage[]> {
  const client = getClient();
  const messages: InboxMessage[] = [];

  try {
    await client.connect();
    const info = await client.mailboxOpen(mailbox);
    if (!info || info.exists === 0) return [];

    const start = Math.max(1, info.exists - limit + 1);
    const range = `${start}:${info.exists}`;

    for await (const msg of client.fetch(range, {
      uid: true,
      flags: true,
      envelope: true,
      bodyStructure: true,
    })) {
      const env = msg.envelope;
      const fromAddr = env?.from?.[0];
      const toAddr = env?.to?.[0];
      const hasAttachment = !!(msg.bodyStructure && JSON.stringify(msg.bodyStructure).includes('"attachment"'));
      messages.push({
        uid: msg.uid,
        messageId: env?.messageId || String(msg.uid),
        from: fromAddr?.name || fromAddr?.address || "",
        fromEmail: fromAddr?.address?.toLowerCase() || "",
        to: toAddr?.address?.toLowerCase() || "",
        subject: env?.subject || "(No subject)",
        date: env?.date ? new Date(env.date).toISOString() : new Date().toISOString(),
        snippet: "",
        seen: msg.flags?.has("\\Seen") ?? false,
        hasAttachment,
      });
    }

    messages.reverse(); // newest first
  } finally {
    await client.logout().catch(() => {});
  }

  return messages;
}

export async function archiveMessage(uid: number): Promise<void> {
  const client = getClient();
  try {
    await client.connect();
    await client.mailboxOpen("INBOX");
    await client.messageMove(String(uid), "[Gmail]/All Mail", { uid: true });
  } finally {
    await client.logout().catch(() => {});
  }
}

export async function trashMessage(uid: number, mailbox = "INBOX"): Promise<void> {
  const client = getClient();
  const box = mailbox === "sent" ? "[Gmail]/Sent Mail" : "INBOX";
  try {
    await client.connect();
    await client.mailboxOpen(box);
    await client.messageMove(String(uid), "[Gmail]/Trash", { uid: true });
  } finally {
    await client.logout().catch(() => {});
  }
}

export async function markAsUnread(uid: number, mailbox = "INBOX"): Promise<void> {
  const client = getClient();
  const box = mailbox === "sent" ? "[Gmail]/Sent Mail" : "INBOX";
  try {
    await client.connect();
    await client.mailboxOpen(box);
    await client.messageFlagsRemove(String(uid), ["\\Seen"], { uid: true });
  } finally {
    await client.logout().catch(() => {});
  }
}

// Fetches full content of a single message by UID from the given mailbox.
export async function fetchMessageDetail(uid: number, mailbox = "INBOX"): Promise<MessageDetail> {
  const client = getClient();

  try {
    await client.connect();
    await client.mailboxOpen(mailbox);

    // Fetch by UID — pass { uid: true } as the third arg so imapflow treats the range as UIDs
    let raw: Buffer = Buffer.alloc(0);
    for await (const msg of client.fetch(String(uid), { uid: true, source: true }, { uid: true })) {
      if (msg.source) raw = Buffer.from(msg.source);
    }

    if (raw.length === 0) throw new Error("Message not found");

    // Mark as read (inbox only; no need to mark sent mail as read)
    if (mailbox === "INBOX") {
      await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true }).catch(() => {});
    }

    const parsed = await simpleParser(raw);
    const fromAddr = parsed.from?.value?.[0];
    const toVal = parsed.to;
    const toAddr = toVal && !Array.isArray(toVal) ? toVal.value?.[0] : Array.isArray(toVal) ? toVal[0]?.value?.[0] : undefined;

    let bodyHtml = (parsed.html || "").toString();
    if (bodyHtml) {
      // Sandbox external content — strip scripts, remove tracking pixels, rewrite external links to open in new tab
      bodyHtml = bodyHtml
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<img[^>]+src=["'][^"']*track[^"']*["'][^>]*>/gi, "")
        .replace(/(<a\s)/gi, '$1target="_blank" rel="noopener noreferrer" ');
    }

    const bodyText = parsed.text || "";
    const snippet = bodyText.replace(/\s+/g, " ").trim().slice(0, 200);

    return {
      uid,
      messageId: parsed.messageId || String(uid),
      from: fromAddr?.name || fromAddr?.address || "",
      fromEmail: fromAddr?.address?.toLowerCase() || "",
      to: toAddr?.address || "",
      subject: parsed.subject || "(No subject)",
      date: parsed.date?.toISOString() || new Date().toISOString(),
      snippet,
      seen: true,
      hasAttachment: (parsed.attachments || []).length > 0,
      bodyHtml,
      bodyText,
    };
  } finally {
    await client.logout().catch(() => {});
  }
}
