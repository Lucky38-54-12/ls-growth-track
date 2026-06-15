import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

export interface InboxMessage {
  uid: number;
  messageId: string;
  from: string;
  fromEmail: string;
  subject: string;
  date: string;
  snippet: string;
  seen: boolean;
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

export async function fetchInbox(limit = 40): Promise<InboxMessage[]> {
  const client = getClient();
  const messages: InboxMessage[] = [];

  try {
    await client.connect();
    const info = await client.mailboxOpen("INBOX");
    if (info.exists === 0) return [];

    // Fetch most recent `limit` messages by sequence number
    const start = Math.max(1, info.exists - limit + 1);
    const range = `${start}:${info.exists}`;

    for await (const msg of client.fetch(range, {
      uid: true,
      flags: true,
      envelope: true,
    })) {
      const env = msg.envelope;
      const fromAddr = env?.from?.[0];
      messages.push({
        uid: msg.uid,
        messageId: env?.messageId || String(msg.uid),
        from: fromAddr?.name || fromAddr?.address || "",
        fromEmail: fromAddr?.address || "",
        subject: env?.subject || "(No subject)",
        date: env?.date ? new Date(env.date).toISOString() : new Date().toISOString(),
        snippet: "",
        seen: msg.flags?.has("\\Seen") ?? false,
      });
    }

    // Return newest first
    messages.reverse();
  } finally {
    await client.logout().catch(() => {});
  }

  return messages;
}

export async function fetchMessageDetail(uid: number): Promise<MessageDetail> {
  const client = getClient();
  try {
    await client.connect();
    await client.mailboxOpen("INBOX");

    let raw: Buffer = Buffer.alloc(0);
    for await (const msg of client.fetch(String(uid), { uid: true, source: true })) {
      if (msg.source) raw = Buffer.from(msg.source);
    }

    // Mark as read
    await client.messageFlagsAdd({ uid: true, all: false } as unknown as string, ["\\Seen"]).catch(() => {});

    const parsed = await simpleParser(raw);
    const fromAddr = parsed.from?.value?.[0];
    const toAddr = parsed.to && !Array.isArray(parsed.to) ? parsed.to.value?.[0] : undefined;

    // Strip scripts/styles for safety before rendering
    let bodyHtml = parsed.html || "";
    if (bodyHtml) {
      bodyHtml = bodyHtml.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
    }

    const bodyText = parsed.text || "";
    const snippet = bodyText.replace(/\s+/g, " ").trim().slice(0, 200);

    return {
      uid,
      messageId: parsed.messageId || String(uid),
      from: fromAddr?.name || fromAddr?.address || "",
      fromEmail: fromAddr?.address || "",
      to: toAddr?.address || "",
      subject: parsed.subject || "(No subject)",
      date: parsed.date?.toISOString() || new Date().toISOString(),
      snippet,
      seen: true,
      bodyHtml,
      bodyText,
    };
  } finally {
    await client.logout().catch(() => {});
  }
}
