// Builds the "let's get started" email sent once a deal closes: the
// agreement doc, what's needed from the client, and how to hand it over
// (the portal form, or a quick Drive/WhatsApp drop for anyone who'd rather
// skip the form).
export interface KickoffEmailInput {
  clientName: string;
  company: string;
  agreementDocUrl: string;
  portalUrl: string;
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
  <p style="margin:0 0 12px">Good chatting, keen to get things moving. Here's the agreement we went through:</p>
  <p style="margin:0 0 16px"><a href="${input.agreementDocUrl}">${input.agreementDocUrl}</a></p>
  <p style="margin:0 0 8px">To get started, I just need a few things from you:</p>
  <p style="margin:0 0 6px">- Meta Business Manager access (add LS Growth as a partner, or send me your Business Manager ID and I'll request access)</p>
  <p style="margin:0 0 6px">- Confirmation on services/areas and your ad budget</p>
  <p style="margin:0 0 16px">- A few photos or videos we can use in the ads</p>
  <p style="margin:0 0 12px">Easiest way to sort all of that: <a href="${input.portalUrl}">click here</a> and fill it in on one page.</p>
  <p style="margin:0 0 16px">If it's easier, you can also just drop photos/videos straight into <a href="${input.photosFolderUrl}">this folder</a>, or send them to me on WhatsApp: <a href="${whatsappLink(input.whatsappNumber)}">${input.whatsappNumber}</a>.</p>
  <p style="margin:16px 0 0">Cheers,<br>Lucky<br>LS Growth</p>
</div>`;

  return { subject, html };
}
