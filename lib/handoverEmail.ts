export interface HandoverEmailInput {
  company: string;
  contactName?: string;
  handoverDocUrl: string;
  clientDriveFolderUrl: string;
  leadsSheetUrl: string;
  services?: string[];
  adBudget?: string;
}

// Sent to the marketing team (harris@lsgrowth.agency) the moment Lucky marks
// a client signed & closed — points them at the handover doc rather than
// duplicating its content, so there's one source of truth per client.
export function buildHandoverEmail(input: HandoverEmailInput): { subject: string; html: string } {
  const subject = `Client closed: ${input.company} — handover doc ready`;

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.6;max-width:560px;">
  <p style="margin:0 0 12px">Hey Harris,</p>
  <p style="margin:0 0 12px"><strong>${input.company}</strong>${input.contactName ? ` (${input.contactName})` : ""} has signed and closed — we're ready to get started.</p>
  <p style="margin:0 0 12px">Everything you need is in the handover doc: <a href="${input.handoverDocUrl}">${input.handoverDocUrl}</a></p>
  ${input.services?.length ? `<p style="margin:0 0 12px">Focus: ${input.services.filter(Boolean).join(", ")}</p>` : ""}
  ${input.adBudget ? `<p style="margin:0 0 12px">Ad budget: ${input.adBudget}</p>` : ""}
  <p style="margin:0 0 12px">Client's photo/video folder: <a href="${input.clientDriveFolderUrl}">${input.clientDriveFolderUrl}</a></p>
  <p style="margin:0 0 16px">Leads sheet (Meta lead ads will feed into this): <a href="${input.leadsSheetUrl}">${input.leadsSheetUrl}</a></p>
  <p style="margin:0 0 16px">Let's aim to have a strategy ready within 2 days so Lucky and I can jump on a call.</p>
  <p style="margin:16px 0 0">Cheers,<br>Lucky<br>LS Growth</p>
</div>`;

  return { subject, html };
}
