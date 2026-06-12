import { EmailEvent, EmailSend } from "./types";

export interface SendStats {
  sent: number;
  opened: number;
  clicked: number;
  totalOpens: number;
  totalClicks: number;
}

export interface SubjectStats extends SendStats {
  subject: string;
  step: string;
}

export interface StepStats extends SendStats {
  step: string;
}

export interface DayStats {
  date: string;
  sent: number;
  opened: number;
}

export interface AnalyticsResult {
  overall: SendStats;
  bySubject: SubjectStats[];
  byStep: StepStats[];
  byDay: DayStats[];
}

function emptyStats(): SendStats {
  return { sent: 0, opened: 0, clicked: 0, totalOpens: 0, totalClicks: 0 };
}

export function buildAnalytics(sends: EmailSend[], events: EmailEvent[]): AnalyticsResult {
  const sendsByLead = new Map<string, EmailSend[]>();
  for (const s of sends) {
    const arr = sendsByLead.get(s.lead_id) || [];
    arr.push(s);
    sendsByLead.set(s.lead_id, arr);
  }
  for (const arr of sendsByLead.values()) arr.sort((a, b) => a.sent_at.localeCompare(b.sent_at));

  // Attribute each open/click to the most recent send for that lead at the time of the event.
  const opensBySendId = new Map<number, number>();
  const clicksBySendId = new Map<number, number>();

  for (const ev of events) {
    const leadSends = sendsByLead.get(ev.lead_id);
    if (!leadSends) continue;
    let attributed: EmailSend | null = null;
    for (const s of leadSends) {
      if (s.sent_at <= ev.created_at) attributed = s;
      else break;
    }
    if (!attributed) continue;
    if (ev.event_type === "open") opensBySendId.set(attributed.id, (opensBySendId.get(attributed.id) || 0) + 1);
    else clicksBySendId.set(attributed.id, (clicksBySendId.get(attributed.id) || 0) + 1);
  }

  const overall = emptyStats();
  const bySubjectMap = new Map<string, SubjectStats>();
  const byStepMap = new Map<string, StepStats>();
  const byDayMap = new Map<string, DayStats>();

  for (const s of sends) {
    const opens = opensBySendId.get(s.id) || 0;
    const clicks = clicksBySendId.get(s.id) || 0;
    const wasOpened = opens > 0 ? 1 : 0;
    const wasClicked = clicks > 0 ? 1 : 0;

    overall.sent++;
    overall.opened += wasOpened;
    overall.clicked += wasClicked;
    overall.totalOpens += opens;
    overall.totalClicks += clicks;

    const subjectKey = `${s.step}::${s.subject}`;
    if (!bySubjectMap.has(subjectKey)) bySubjectMap.set(subjectKey, { ...emptyStats(), subject: s.subject, step: s.step });
    const subjStats = bySubjectMap.get(subjectKey)!;
    subjStats.sent++;
    subjStats.opened += wasOpened;
    subjStats.clicked += wasClicked;
    subjStats.totalOpens += opens;
    subjStats.totalClicks += clicks;

    if (!byStepMap.has(s.step)) byStepMap.set(s.step, { ...emptyStats(), step: s.step });
    const stepStats = byStepMap.get(s.step)!;
    stepStats.sent++;
    stepStats.opened += wasOpened;
    stepStats.clicked += wasClicked;
    stepStats.totalOpens += opens;
    stepStats.totalClicks += clicks;

    const day = s.sent_at.slice(0, 10);
    if (!byDayMap.has(day)) byDayMap.set(day, { date: day, sent: 0, opened: 0 });
    const dayStats = byDayMap.get(day)!;
    dayStats.sent++;
    dayStats.opened += wasOpened;
  }

  const bySubject = Array.from(bySubjectMap.values()).sort((a, b) => rate(b.opened, b.sent) - rate(a.opened, a.sent) || b.sent - a.sent);
  const byStep = Array.from(byStepMap.values());
  const byDay = Array.from(byDayMap.values()).sort((a, b) => b.date.localeCompare(a.date));

  return { overall, bySubject, byStep, byDay };
}

export function rate(n: number, total: number): number {
  return total > 0 ? Math.round((n / total) * 1000) / 10 : 0;
}
