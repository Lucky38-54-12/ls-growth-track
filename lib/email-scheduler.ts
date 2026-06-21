import { renderTemplate, EmailStep } from "./templates";

export interface ScheduledEmail {
  email: string;
  company: string;
  step: EmailStep;
  dayDue: number;
  subject: string;
  html: string;
}

const EMAIL_SCHEDULE: Record<EmailStep, number> = {
  initial: 0,
  followup1: 3,
  followup2: 7,
  followup3: 14,
  followup4: 21,
};

function daysSince(dateStr: string): number | null {
  if (!dateStr) return null;
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  } catch {
    return null;
  }
}

export function getNextEmailStep(
  dateCalled: string,
  lastSentStep?: EmailStep
): EmailStep | null {
  const days = daysSince(dateCalled);
  if (days === null) return null;

  const steps: EmailStep[] = ["initial", "followup1", "followup2", "followup3", "followup4"];
  const lastIndex = lastSentStep ? steps.indexOf(lastSentStep) : -1;

  for (let i = lastIndex + 1; i < steps.length; i++) {
    const step = steps[i];
    if (days >= EMAIL_SCHEDULE[step]) {
      return step;
    }
  }

  return null;
}

export function buildScheduledEmails(leads: any[]): ScheduledEmail[] {
  const emails: ScheduledEmail[] = [];

  for (const lead of leads) {
    if (!lead.email || !lead.businessName || !lead.dateCalled) continue;

    const step = getNextEmailStep(lead.dateCalled, lead.lastSentStep);
    if (!step) continue;

    try {
      const { subject, html } = renderTemplate(step, {
        company: lead.businessName,
        contact_name: lead.contactName || "there",
        trade: lead.trade || "cleaning",
        location: lead.location || "",
        cta_link: process.env.NEXT_PUBLIC_APP_URL || "https://app.lsgrowth.agency",
        pixel: "",
        personalization: lead.personalization || undefined,
      });

      emails.push({
        email: lead.email,
        company: lead.businessName,
        step,
        dayDue: EMAIL_SCHEDULE[step],
        subject,
        html,
      });
    } catch (error) {
      console.error(`Failed to build email for ${lead.email}:`, error);
    }
  }

  return emails;
}
