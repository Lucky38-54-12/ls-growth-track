// Builds the "let's get started" email sent once a deal closes: the
// /connect/[lqClientId] link (Calendar + Facebook Page + Ads Manager
// access — no separate client portal), and how to hand over photos/videos
// (a Drive folder, or WhatsApp). The signed agreement itself goes through
// separate e-signature software, not this email — no agreement link here.
export interface KickoffEmailInput {
  clientName: string;
  company: string;
  connectUrl: string;
  photosFolderUrl: string;
  whatsappNumber: string;
}

function whatsappLink(number: string): string {
  return `https://wa.me/${number.replace(/[^\d]/g, "")}`;
}

export function buildKickoffEmail(input: KickoffEmailInput): { subject: string; html: string } {
  const subject = `Let's get ${input.company} started`;
  const firstName = input.clientName.split(" ")[0] || input.clientName;

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.6;max-width:560px;">
  <p style="margin:0 0 12px">Hey ${firstName},</p>
  <p style="margin:0 0 12px">Good chatting, keen to get things moving.</p>
  <p style="margin:0 0 16px">If you can jump through this link and give me access, that'll get us set up: <a href="${input.connectUrl}">${input.connectUrl}</a></p>
  <p style="margin:0 0 16px">I'll also need a few photos or videos we can use in the ads — easiest way is to drop them into <a href="${input.photosFolderUrl}">this folder</a>, or send them to me on WhatsApp: <a href="${whatsappLink(input.whatsappNumber)}">${input.whatsappNumber}</a>.</p>
  <p style="margin:16px 0 0">Cheers,<br>Lucky<br>LS Growth</p>
</div>`;

  return { subject, html };
}
