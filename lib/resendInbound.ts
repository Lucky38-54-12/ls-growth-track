// Resend's inbound webhook only carries metadata (from/subject/id) — the
// body requires a second API call. See app/api/webhooks/resend/route.ts.
export interface ReceivedEmail {
  from: string;
  subject: string;
  text: string;
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function fetchReceivedEmail(emailId: string): Promise<ReceivedEmail> {
  const res = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
  });
  if (!res.ok) throw new Error(`Resend receiving API ${res.status}: ${await res.text()}`);
  const data = await res.json();

  let html: string | null = data.html || null;
  // Large bodies come back as a data: URI instead of inline HTML.
  if (html && data.html_format === "data_uri" && html.startsWith("data:")) {
    const base64 = html.split(",")[1] || "";
    html = Buffer.from(base64, "base64").toString("utf-8");
  }

  const text = data.text || (html ? htmlToPlainText(html) : "");
  return { from: data.from, subject: data.subject || "", text };
}
