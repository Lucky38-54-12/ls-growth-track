import { createSupabaseClient, fetchAllRows } from "@/lib/supabase";
import { nextStepFor, groupBySegment, segmentKey, segmentLabel, isReadyForReenroll } from "@/lib/leads";
import { renderTemplate, EmailStep, industryKey, INDUSTRY_LABELS } from "@/lib/templates";
import { Lead, EmailSend, EmailEvent, REPLY_CATEGORY_LABELS, REPLY_CATEGORY_COLORS, ReplyCategory } from "@/lib/types";
import SendButton from "@/components/SendButton";
import ReplyTagPicker from "@/components/ReplyTagPicker";
import Topbar from "@/components/Topbar";
import Link from "next/link";
import { Send, Users, Clock, Mail, TrendingUp, AlertTriangle, RotateCcw, Building2, Zap, CheckCircle } from "lucide-react";

const L = { surface: "#ffffff", border: "#e6eaf0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };

export const revalidate = 0;

const DAILY_LIMIT = 15;

const STEP_LABEL: Record<EmailStep, string> = {
  initial:   "Initial",
  followup1: "Follow-up 1",
  followup2: "Follow-up 2",
  followup3: "Follow-up 3",
  followup4: "Breakup",
};

const STEP_ORDER: EmailStep[] = ["initial", "followup1", "followup2", "followup3", "followup4"];

const STEP_DAY: Record<EmailStep, string> = {
  initial:   "Day 0",
  followup1: "Day 3",
  followup2: "Day 7",
  followup3: "Day 14",
  followup4: "Day 21",
};

const STEP_DESC: Record<EmailStep, string> = {
  initial:   "First touch",
  followup1: "Short follow-up",
  followup2: "Social proof",
  followup3: "Last chance",
  followup4: "Breakup email",
};

const STEP_COLORS: Record<EmailStep, { bg: string; border: string; label: string; text: string }> = {
  initial:   { bg: "#fff7ed", border: "#fed7aa", label: "#c2410c", text: "#9a3412" },
  followup1: { bg: "#fffbeb", border: "#fde68a", label: "#b45309", text: "#92400e" },
  followup2: { bg: "#fefce8", border: "#fef08a", label: "#854d0e", text: "#713f12" },
  followup3: { bg: "#fff1f2", border: "#fecdd3", label: "#be123c", text: "#9f1239" },
  followup4: { bg: "#f5f3ff", border: "#ddd6fe", label: "#6d28d9", text: "#4c1d95" },
};

type QueueItem = { lead: Lead; step: EmailStep; subject: string; html: string };

export default async function OutreachPage({
  searchParams,
}: {
  searchParams: { segment?: string; lead?: string };
}) {
  const sb = createSupabaseClient();

  const [leads, { data: sends }, { data: events }] = await Promise.all([
    fetchAllRows<Lead>((from, to) => sb.from("leads").select("*").order("date_added", { ascending: false }).range(from, to)),
    sb.from("email_sends").select("id, step, sent_at"),
    sb.from("email_events").select("id, event_type"),
  ]);

  const allLeads = leads;
  const allSends = (sends || []) as Pick<EmailSend, "step">[];
  const allEvents = (events || []) as Pick<EmailEvent, "event_type">[];

  // --- Stats ---
  const TERMINAL = new Set(["replied", "booked", "not_interested", "bounced", "sequence_complete"]);
  const activeLeads = allLeads.filter(l => !TERMINAL.has(l.status));
  const totalSent = allSends.length;
  const totalOpens = allEvents.filter(e => e.event_type === "open").length;
  const openRate = totalSent > 0 ? Math.round((totalOpens / totalSent) * 100) : 0;
  const repliedCount = allLeads.filter(l => l.status === "replied").length;
  const bookedCount = allLeads.filter(l => l.status === "booked").length;
  const replyRate = totalSent > 0 ? Math.round(((repliedCount + bookedCount) / totalSent) * 100) : 0;

  // Reply category breakdown
  const replyCats: Record<ReplyCategory, number> = {
    interested: allLeads.filter(l => l.reply_category === "interested").length,
    bad_timing: allLeads.filter(l => l.reply_category === "bad_timing").length,
    not_interested: allLeads.filter(l => l.reply_category === "not_interested").length,
    has_someone: allLeads.filter(l => l.reply_category === "has_someone").length,
  };

  // Stage breakdown
  const stageCounts = {
    not_contacted:    allLeads.filter(l => l.status === "not_contacted").length,
    contacted:        allLeads.filter(l => l.status === "contacted").length,
    followup_1_sent:  allLeads.filter(l => l.status === "followup_1_sent").length,
    followup_2_sent:  allLeads.filter(l => l.status === "followup_2_sent").length,
    followup_3_sent:  allLeads.filter(l => l.status === "followup_3_sent").length,
    converted:        repliedCount + bookedCount,
  };

  // Replied leads awaiting category tag
  const awaitingTag = allLeads.filter(l => l.status === "replied" && !l.reply_category);

  // Re-enrol queue
  const reenrollReady = allLeads.filter(isReadyForReenroll);

  // --- Queue ---
  const queue: QueueItem[] = allLeads
    .map((lead) => {
      const step = nextStepFor(lead);
      if (!step) return null;
      const { subject, html } = renderTemplate(step, {
        company: lead.company,
        contact_name: lead.contact_name || "there",
        trade: lead.trade,
        location: lead.location,
        cta_link: "#",
        pixel: "",
        personalization: lead.personalization_hook || undefined,
      });
      return { lead, step, subject, html };
    })
    .filter((x): x is QueueItem => x !== null);

  const overLimit = queue.length > DAILY_LIMIT;

  const segments = groupBySegment(queue.map((q) => q.lead));
  const firstSegmentKey = segments.length > 0 ? segments[0].key : null;
  const activeSegment = searchParams?.segment || firstSegmentKey || "";
  const visibleQueue = activeSegment
    ? queue.filter((q) => segmentKey(q.lead.trade, q.lead.location) === activeSegment)
    : queue;

  const selectedId = searchParams?.lead;
  const selected = (selectedId && visibleQueue.find((q) => q.lead.lead_id === selectedId)) || visibleQueue[0];

  const queueByStep: Record<EmailStep, number> = { initial: 0, followup1: 0, followup2: 0, followup3: 0, followup4: 0 };
  for (const q of visibleQueue) queueByStep[q.step]++;

  // Pipeline stage → queue count mapping
  const STAGE_STATUS_MAP: Array<{
    key: string;
    label: string;
    day: string;
    desc: string;
    count: number;
    dueCount: number;
    colors: typeof STEP_COLORS.initial;
  }> = [
    {
      key: "not_contacted", label: "Not Started", day: "", desc: "Awaiting initial",
      count: stageCounts.not_contacted, dueCount: queueByStep.initial,
      colors: { bg: "#f8fafc", border: L.border, label: L.muted, text: L.dimmed },
    },
    { key: "initial",   label: "Email 1", day: "Day 0",  desc: "Initial outreach", count: stageCounts.contacted,       dueCount: 0, colors: STEP_COLORS.initial },
    { key: "followup1", label: "Email 2", day: "Day 3",  desc: "Short follow-up",  count: stageCounts.followup_1_sent, dueCount: queueByStep.followup1, colors: STEP_COLORS.followup1 },
    { key: "followup2", label: "Email 3", day: "Day 7",  desc: "Social proof",     count: stageCounts.followup_2_sent, dueCount: queueByStep.followup2, colors: STEP_COLORS.followup2 },
    { key: "followup3", label: "Email 4", day: "Day 14", desc: "Last chance",      count: stageCounts.followup_3_sent, dueCount: queueByStep.followup3, colors: STEP_COLORS.followup3 },
    { key: "followup4", label: "Email 5", day: "Day 21", desc: "Breakup email",    count: 0,                           dueCount: queueByStep.followup4, colors: STEP_COLORS.followup4 },
    {
      key: "converted", label: "Converted", day: "", desc: `${repliedCount} replied · ${bookedCount} booked`,
      count: stageCounts.converted, dueCount: 0,
      colors: { bg: "#f0fdf4", border: "#bbf7d0", label: "#15803d", text: "#166534" },
    },
  ];

  const statCards = [
    { label: "Active in Sequence", value: String(activeLeads.length), sub: null as string | null, icon: Users, accent: false },
    { label: "Due to Send", value: String(queue.length), sub: overLimit ? `Limit: ${DAILY_LIMIT}/day` : null, icon: Clock, accent: queue.length > 0 },
    { label: "Total Emails Sent", value: totalSent.toLocaleString(), sub: null, icon: Mail, accent: false },
    { label: "Open Rate", value: `${openRate}%`, sub: `${totalOpens} opens`, icon: TrendingUp, accent: false },
    { label: "Reply / Booked", value: `${replyRate}%`, sub: `${repliedCount} replied · ${bookedCount} booked`, icon: Send, accent: replyRate > 5 },
  ];

  return (
    <div style={{ background: "#f4f6fa", minHeight: "100vh" }}>
      <Topbar title="EMAIL OUTREACH" subtitle="✨ Fully automated · Runs daily at 9am" />

      <div style={{ padding: "20px 28px 60px", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Automation Status Banner */}
        <div className="surface-card" style={{ background: "#f0fdf4", borderColor: "#bbf7d0", padding: "14px 18px", display: "flex", alignItems: "center", gap: 12, border: "1px solid #bbf7d0" }}>
          <CheckCircle style={{ width: 18, height: 18, color: "#16a34a", flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#15803d" }}>
              Automated Email System Active
            </div>
            <div style={{ fontSize: 12, color: "#16a34a", marginTop: 2 }}>
              New leads from Google Sheets automatically get emailed on Days 0, 3, 7, 14, 21. Next run: Tomorrow at 9am.
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
          {statCards.map(({ label, value, sub, icon: Icon, accent }) => (
            <div key={label} className="stat-card" style={{ padding: "16px 18px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: L.muted }}>{label}</p>
                <div style={{ width: 26, height: 26, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, background: accent ? "#fef2f2" : "#f1f5f9" }}>
                  <Icon style={{ width: 13, height: 13, color: accent ? "var(--red)" : L.dimmed }} />
                </div>
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: L.text, lineHeight: 1, letterSpacing: "-0.01em" }}>{value}</div>
              {sub && <div style={{ fontSize: 11, color: L.dimmed, marginTop: 5 }}>{sub}</div>}
            </div>
          ))}
        </div>

        {/* Staggered send warning */}
        {overLimit && (
          <div className="surface-card" style={{ background: "#fffbeb", borderColor: "#fde68a", padding: "12px 18px", display: "flex", alignItems: "flex-start", gap: 10 }}>
            <AlertTriangle style={{ width: 16, height: 16, color: "#b45309", flexShrink: 0, marginTop: 1 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#92400e" }}>
                {queue.length} emails due — over the {DAILY_LIMIT}/day limit
              </div>
              <div style={{ fontSize: 12, color: "#b45309", marginTop: 2 }}>
                Consider splitting across multiple days to avoid spam filters. Send {DAILY_LIMIT} today and come back tomorrow for the rest.
              </div>
            </div>
          </div>
        )}

        {/* Sequence pipeline */}
        <div className="surface-card" style={{ padding: "18px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: L.muted }}>Sequence Pipeline</span>
            {Object.values(replyCats).some(v => v > 0) && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                {(Object.keys(replyCats) as ReplyCategory[]).map(cat => {
                  const n = replyCats[cat];
                  if (!n) return null;
                  const c = REPLY_CATEGORY_COLORS[cat];
                  return (
                    <span key={cat} style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: c.bg, color: c.text }}>
                      {REPLY_CATEGORY_LABELS[cat]}: {n}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
          <div style={{ overflowX: "auto" }}>
            <div style={{ display: "flex", alignItems: "stretch", gap: 8, minWidth: 700 }}>
              {STAGE_STATUS_MAP.map((stage) => (
                <div key={stage.key} style={{ flex: 1, minWidth: 0, padding: "12px 14px", borderRadius: 12, background: stage.colors.bg, border: `1px solid ${stage.colors.border}` }}>
                  <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: stage.colors.label, whiteSpace: "nowrap" }}>
                    {stage.label}{stage.day ? ` · ${stage.day}` : ""}
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: stage.colors.label, margin: "4px 0" }}>{stage.count}</div>
                  <div style={{ fontSize: 10.5, color: stage.colors.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{stage.desc}</div>
                  {stage.dueCount > 0 && <div style={{ fontSize: 9.5, fontWeight: 800, color: "#dc2626", marginTop: 4 }}>↑ {stage.dueCount} due</div>}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Replied leads awaiting tag */}
        {awaitingTag.length > 0 && (
          <div className="surface-card" style={{ padding: "16px 18px" }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: L.muted, marginBottom: 4 }}>
              Tag Replies ({awaitingTag.length})
            </div>
            <p style={{ fontSize: 12.5, color: L.muted, marginBottom: 14 }}>
              These leads replied but haven&apos;t been categorised yet. Tag each one to track pipeline health and set the right re-enrol window.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {awaitingTag.map(lead => (
                <div key={lead.lead_id} className="row-hover" style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 16, padding: "10px 14px", borderRadius: 10, background: "#f8fafc" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: L.text }}>{lead.company}</div>
                    <div style={{ fontSize: 11, color: L.dimmed, marginTop: 1 }}>{lead.email}</div>
                    {lead.notes && <div style={{ fontSize: 11, color: L.muted, marginTop: 3, fontStyle: "italic" }}>{lead.notes}</div>}
                  </div>
                  <ReplyTagPicker leadId={lead.lead_id} current={lead.reply_category} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Scheduled to Send */}
        <div className="surface-card" style={{ padding: "16px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 10 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: L.muted }}>⚙️ Scheduled to Send at 9am</div>
              <p style={{ fontSize: 12.5, color: L.muted, marginTop: 3 }}>
                {queue.length > 0
                  ? `${queue.length} lead${queue.length !== 1 ? "s" : ""} scheduled across ${segments.length} campaign${segments.length !== 1 ? "s" : ""}`
                  : "All caught up — no emails scheduled for tomorrow."}
              </p>
            </div>
          </div>

          {segments.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", paddingTop: 10, borderTop: `1px solid ${L.border}` }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: L.dimmed }}>Campaigns</span>
              {segments.map((s) => {
                const active = activeSegment === s.key;
                const label = segmentLabel(s.trade, s.location);
                const href = `/dashboard/send?segment=${encodeURIComponent(s.key)}`;
                return (
                  <Link key={s.key} href={href} className="pill-hover" style={{
                    display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", fontSize: 11,
                    fontWeight: 600, textDecoration: "none", borderRadius: 20,
                    border: `1px solid ${active ? "var(--red)" : L.border}`,
                    background: active ? "#fef2f2" : L.surface,
                    color: active ? "var(--red)" : L.muted,
                  }}>
                    {label}
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 10, background: active ? "#fee2e2" : "#f1f5f9", color: active ? "var(--red)" : L.dimmed }}>{s.count}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Queue + preview */}
        {queue.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 420px", gap: 12, alignItems: "start" }}>

            {/* Lead list */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {activeSegment && visibleQueue.length > 0 && (
                <div className="surface-card" style={{ padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12.5, color: L.muted }}>
                    {visibleQueue.length} lead{visibleQueue.length !== 1 ? "s" : ""} scheduled for{" "}
                    <strong style={{ color: L.text }}>{segmentLabel(visibleQueue[0].lead.trade, visibleQueue[0].lead.location)}</strong>
                  </span>
                </div>
              )}

              {visibleQueue.length === 0 ? (
                <div className="surface-card" style={{ padding: "32px", textAlign: "center", color: L.dimmed, fontSize: 13 }}>
                  Nothing due in this campaign.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {visibleQueue.map(({ lead, step }) => {
                    const active = selected?.lead.lead_id === lead.lead_id;
                    const params = new URLSearchParams();
                    if (activeSegment) params.set("segment", activeSegment);
                    params.set("lead", lead.lead_id);
                    const sc = STEP_COLORS[step];

                    return (
                      <Link key={lead.lead_id} href={`/dashboard/send?${params.toString()}`} className="card-hover" style={{
                        display: "grid", gridTemplateColumns: "auto 1fr 110px auto",
                        alignItems: "center", gap: 12,
                        background: active ? "#fef2f2" : L.surface,
                        border: `1px solid ${active ? "var(--red)" : L.border}`,
                        padding: "10px 14px", textDecoration: "none",
                      }}>
                        <div style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${active ? "#fca5a5" : L.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, background: active ? "#fff" : "#f8fafc" }}>
                          <Building2 style={{ width: 13, height: 13, color: active ? "var(--red)" : L.muted }} />
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 13, color: L.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{lead.company}</div>
                          <div style={{ fontSize: 11, color: L.dimmed, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{lead.email}</div>
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 8, background: sc.bg, color: sc.label, display: "inline-block", whiteSpace: "nowrap" }}>
                          {STEP_LABEL[step]} · {STEP_DAY[step]}
                        </span>
                        <CheckCircle style={{ width: 16, height: 16, color: "#16a34a", flexShrink: 0 }} />
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Email preview */}
            <div style={{ position: "sticky", top: 20, display: "flex", flexDirection: "column", gap: 10 }}>
              {selected ? (
                <>
                  <div className="surface-card">
                    <div style={{ padding: "12px 16px", borderBottom: `1px solid ${L.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: 13.5, color: L.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selected.lead.company}</div>
                        <div style={{ fontSize: 11.5, color: L.dimmed, marginTop: 1 }}>{selected.lead.email}</div>
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 8, background: STEP_COLORS[selected.step].bg, color: STEP_COLORS[selected.step].label, whiteSpace: "nowrap" }}>
                        {STEP_LABEL[selected.step]} · {STEP_DAY[selected.step]}
                      </span>
                    </div>
                    <div style={{ padding: "14px 16px" }}>
                      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: L.dimmed, marginBottom: 3 }}>Subject</div>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: L.text, marginBottom: 12 }}>{selected.subject}</div>
                      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: L.dimmed, marginBottom: 6 }}>Body</div>
                      <div
                        className="email-preview"
                        style={{ border: `1px solid ${L.border}`, borderRadius: 10, padding: 14, background: "#f8fafc", maxHeight: 300, overflow: "auto", fontSize: 13, lineHeight: 1.6 }}
                        dangerouslySetInnerHTML={{ __html: selected.html }}
                      />
                    </div>
                    {selected.lead.notes && (
                      <div style={{ padding: "0 16px 12px" }}>
                        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: L.dimmed, marginBottom: 4 }}>Notes</div>
                        <div style={{ fontSize: 12.5, color: L.muted, fontStyle: "italic" }}>{selected.lead.notes}</div>
                      </div>
                    )}
                    <div style={{ padding: "0 16px 14px", display: "flex", gap: 12, alignItems: "center" }}>
                      <Link href={`/dashboard/leads/${selected.lead.lead_id}`} style={{ fontSize: 12, color: "var(--blue)", fontWeight: 600, textDecoration: "none" }}>
                        View lead →
                      </Link>
                    </div>
                  </div>

                  {/* Sequence status tracker */}
                  <div className="surface-card" style={{ padding: "14px 16px" }}>
                    <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: L.muted, marginBottom: 12 }}>Sequence Status</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      {STEP_ORDER.map((step, i) => {
                        const stepIndex = STEP_ORDER.indexOf(selected.step);
                        const isDone = i < stepIndex;
                        const isCurrent = step === selected.step;
                        return (
                          <div key={step} style={{
                            display: "flex", gap: 9, alignItems: "flex-start", padding: "7px 9px", borderRadius: 8,
                            background: isCurrent ? "#fef2f2" : isDone ? "#f0fdf4" : "#f8fafc",
                            border: `1px solid ${isCurrent ? "#fca5a5" : isDone ? "#bbf7d0" : L.border}`,
                          }}>
                            <span style={{
                              width: 17, height: 17, borderRadius: "50%", flexShrink: 0,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: 9, fontWeight: 800,
                              background: isCurrent ? "var(--red)" : isDone ? "#16a34a" : "#e2e8f0",
                              color: isCurrent || isDone ? "#fff" : L.dimmed,
                            }}>
                              {isDone ? "✓" : i + 1}
                            </span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 11.5, fontWeight: 700, color: isCurrent ? "var(--red)" : isDone ? "#15803d" : L.muted }}>
                                {STEP_LABEL[step]} · {STEP_DAY[step]}
                                {isCurrent && " · Due now"}
                                {isDone && " · Sent"}
                                {!isCurrent && !isDone && " · Pending"}
                              </div>
                              <div style={{ fontSize: 10.5, color: L.dimmed, marginTop: 1 }}>{STEP_DESC[step]}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${L.border}`, fontSize: 11.5, color: L.dimmed }}>
                      Template: <strong style={{ color: L.muted }}>{INDUSTRY_LABELS[industryKey(selected.lead.trade)]}</strong>
                    </div>
                  </div>
                </>
              ) : (
                <div className="surface-card" style={{ padding: "40px", textAlign: "center", color: L.dimmed, fontSize: 13 }}>
                  Select a lead to preview their email.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Re-enrol queue */}
        {reenrollReady.length > 0 && (
          <div className="surface-card" style={{ borderColor: "#ddd6fe", padding: "16px 18px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <RotateCcw style={{ width: 14, height: 14, color: "#6d28d9" }} />
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "#6d28d9" }}>
                Re-enrol Queue ({reenrollReady.length})
              </div>
            </div>
            <p style={{ fontSize: 12.5, color: L.muted, marginBottom: 14 }}>
              These contacts completed the sequence and are now past their re-enrolment window. They&apos;ll appear in the send queue above automatically — or you can review them first.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {reenrollReady.map(lead => {
                const rc = lead.reply_category;
                return (
                  <div key={lead.lead_id} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", alignItems: "center", gap: 16, padding: "10px 14px", borderRadius: 10, background: "#faf5ff", border: "1px solid #ddd6fe" }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: L.text }}>{lead.company}</div>
                      <div style={{ fontSize: 11, color: L.dimmed }}>{lead.email}</div>
                      {lead.notes && <div style={{ fontSize: 11, color: L.muted, fontStyle: "italic", marginTop: 2 }}>{lead.notes}</div>}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      {rc && (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 8, background: REPLY_CATEGORY_COLORS[rc].bg, color: REPLY_CATEGORY_COLORS[rc].text, display: "block", marginBottom: 4 }}>
                          {REPLY_CATEGORY_LABELS[rc]}
                        </span>
                      )}
                      <div style={{ fontSize: 10.5, color: "#6d28d9" }}>Ready to re-enrol</div>
                    </div>
                    <Link href={`/dashboard/leads/${lead.lead_id}`} style={{ fontSize: 12, fontWeight: 600, color: "#6d28d9", textDecoration: "none", whiteSpace: "nowrap" }}>
                      View →
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
