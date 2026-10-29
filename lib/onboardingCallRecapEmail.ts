// Confirms in writing what was agreed on the onboarding call (timeline,
// creative revisions, first review date, and what creatives are still
// needed) — the paper trail for when a client later disputes what they
// were told. Sent once, after Lucky marks the onboarding call done.
export interface OnboardingCallRecapInput {
  clientName: string;
  company: string;
  firstReviewDate: string | null;
  campaignStartDate: string | null;
  checkinScheduleNote: string | null;
  creativesReceived: boolean;
  outstandingCreativeAsks: string[];
}

function formatDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-NZ", { day: "numeric", month: "long" });
}

export function buildOnboardingCallRecapEmail(input: OnboardingCallRecapInput): { subject: string; html: string } {
  const subject = `${input.company} — what we covered today`;
  const firstName = input.clientName.split(" ")[0] || input.clientName;

  const lines: string[] = [];
  lines.push(`<p style="margin:0 0 12px">Hey ${firstName},</p>`);
  lines.push(`<p style="margin:0 0 12px">Quick recap of what we covered so it's all in writing.</p>`);
  lines.push(`<p style="margin:0 0 12px">Here's roughly how the next 4 months go:</p>`);
  lines.push(`<ul style="margin:0 0 12px;padding-left:20px">
    <li style="margin-bottom:8px"><strong>Day 30:</strong> testing. Finding which ads and offers actually get your phone ringing. Expect a handful of leads. Some weeks will be quieter than others, that's normal, not a sign it's not working.</li>
    <li style="margin-bottom:8px"><strong>Day 60:</strong> we've found the winners and we're pushing harder on them. Leads should be coming in steadier. First jobs from month one should start landing.</li>
    <li style="margin-bottom:8px"><strong>Day 90:</strong> it should feel repeatable. We know your cost per lead and cost per job by now, not guessing anymore.</li>
    <li style="margin-bottom:0"><strong>Day 120:</strong> there's a track record. That's when we talk about pushing budget further, or going after a second offer, backed by real numbers.</li>
  </ul>`);
  lines.push(`<p style="margin:0 0 12px">If day 30 looks quiet, that's not the point to judge this by. Day 90 and day 120 is.</p>`);

  lines.push(`<p style="margin:0 0 12px">Creatives: no fixed limit on revisions, we'll keep adjusting until you're happy with them.</p>`);

  if (!input.creativesReceived && input.outstandingCreativeAsks.length > 0) {
    lines.push(`<p style="margin:0 0 12px">Your ads only look as premium and established as what's actually in them, so before anything goes live I need real content from your business, not stock stuff. Here's what to send through:</p>`);
    lines.push(`<ul style="margin:0 0 12px;padding-left:20px">${input.outstandingCreativeAsks.map((a) => `<li style="margin-bottom:4px">${a}</li>`).join("")}</ul>`);
    lines.push(`<p style="margin:0 0 12px">No start date gets locked in until that's actually in hand, that's what keeps the ads looking like your business and not someone else's.</p>`);
  } else if (input.campaignStartDate) {
    lines.push(`<p style="margin:0 0 12px">Campaign goes live ${formatDate(input.campaignStartDate)}.</p>`);
  }

  if (input.firstReviewDate) {
    lines.push(`<p style="margin:0 0 12px">First results review booked for ${formatDate(input.firstReviewDate)}.</p>`);
  }

  if (input.checkinScheduleNote) {
    lines.push(`<p style="margin:0 0 12px">We'll catch up every 2 weeks (${input.checkinScheduleNote}) on what's working, what's not, and which jobs have closed.</p>`);
  }

  lines.push(`<p style="margin:16px 0 0">Cheers,<br>Lucky<br>LS Growth</p>`);

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.6;max-width:560px;">${lines.join("\n  ")}</div>`;

  return { subject, html };
}
