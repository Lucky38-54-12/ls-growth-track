import { createSupabaseClient } from "@/lib/supabase";
import { nextStepFor, groupBySegment, segmentKey, segmentLabel } from "@/lib/leads";
import { renderTemplate, EmailStep, industryKey, INDUSTRY_LABELS } from "@/lib/templates";
import { Lead, EmailSend, EmailEvent } from "@/lib/types";
import SendButton from "@/components/SendButton";
import Topbar from "@/components/Topbar";
import Link from "next/link";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };

export const revalidate = 0;

const STEP_LABEL: Record<EmailStep, string> = {
  initial: "Initial Outreach",
  followup1: "Follow-up 1",
  followup2: "Follow-up 2",
};

const STEP_ORDER: EmailStep[] = ["initial", "followup1", "followup2"];

const STEP_TIMING: Record<EmailStep, string> = {
  initial: "Sent immediately on import",
  followup1: "4 days after initial — if no reply",
  followup2: "7 days after follow-up 1 — if no reply",
};

const STEP_DAY: Record<EmailStep, string> = {
  initial: "Day 0",
  followup1: "Day 4+",
  followup2: "Day 11+",
};

type QueueItem = { lead: Lead; step: EmailStep; subject: string; html: string };

export default async function OutreachPage({
  searchParams,
}: {
  searchParams: { segment?: string; lead?: string };
}) {
  const sb = createSupabaseClient();

  const [{ data: leads }, { data: sends }, { data: events }] = await Promise.all([
    sb.from("leads").select("*").order("date_added", { ascending: false }),
    sb.from("email_sends").select("id, step, sent_at"),
    sb.from("email_events").select("id, event_type"),
  ]);

  const allLeads = (leads || []) as Lead[];
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

  // --- Sequence stage breakdown ---
  const stageCounts = {
    not_contacted: allLeads.filter(l => l.status === "not_contacted").length,
    contacted: allLeads.filter(l => l.status === "contacted").length,
    followup_1_sent: allLeads.filter(l => l.status === "followup_1_sent").length,
    followup_2_sent: allLeads.filter(l => l.status === "followup_2_sent").length,
    converted: repliedCount + bookedCount,
  };

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
      });
      return { lead, step, subject, html };
    })
    .filter((x): x is QueueItem => x !== null);

  const activeSegment = searchParams?.segment || "all";
  const segments = groupBySegment(queue.map((q) => q.lead));
  const visibleQueue =
    activeSegment === "all"
      ? queue
      : queue.filter((q) => segmentKey(q.lead.trade, q.lead.location) === activeSegment);

  const selectedId = searchParams?.lead;
  const selected = (selectedId && visibleQueue.find((q) => q.lead.lead_id === selectedId)) || visibleQueue[0];

  // Counts per step in the visible queue
  const queueByStep: Record<EmailStep, number> = { initial: 0, followup1: 0, followup2: 0 };
  for (const q of visibleQueue) queueByStep[q.step]++;

  return (
    <div style={{ background: "#f1f5f9", minHeight: "100vh" }}>
      <Topbar title="EMAIL OUTREACH" subtitle="Automated 3-step sequence — stops when they reply or book" />

      <div style={{ padding: "20px 28px 60px", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
          {[
            { label: "Active in Sequence", value: activeLeads.length, color: L.text },
            { label: "Due to Send", value: queue.length, color: queue.length > 0 ? "#dc2626" : L.text },
            { label: "Total Emails Sent", value: totalSent.toLocaleString(), color: L.text },
            { label: "Open Rate", value: `${openRate}%`, color: openRate > 30 ? "#16a34a" : L.text },
            { label: "Reply / Booked", value: `${replyRate}%`, color: replyRate > 5 ? "#16a34a" : L.text },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: L.surface, border: `1px solid ${L.border}`, padding: "14px 18px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: L.dimmed, marginBottom: 6 }}>{label}</div>
              <div style={{ fontSize: 26, fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Sequence pipeline */}
        <div style={{ background: L.surface, border: `1px solid ${L.border}`, padding: "18px 20px" }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: L.muted, marginBottom: 16 }}>Sequence Pipeline</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 28px 1fr 28px 1fr 28px 1fr 28px 1fr", alignItems: "center", gap: 0 }}>

            {/* Stage: Queued */}
            <div style={{ padding: "12px 14px", background: "#f8fafc", border: `1px solid ${L.border}` }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: L.dimmed }}>Not Started</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: L.text, margin: "4px 0" }}>{stageCounts.not_contacted}</div>
              <div style={{ fontSize: 11, color: L.dimmed }}>Awaiting initial</div>
            </div>

            <div style={{ textAlign: "center", color: L.dimmed, fontSize: 16, fontWeight: 300 }}>›</div>

            {/* Step 1 */}
            <div style={{ padding: "12px 14px", background: "#fff7ed", border: "1px solid #fed7aa" }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#c2410c" }}>Step 1 · Day 0</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: "#c2410c", margin: "4px 0" }}>{stageCounts.contacted + queueByStep.initial}</div>
              <div style={{ fontSize: 11, color: "#9a3412" }}>Initial outreach</div>
              {queueByStep.initial > 0 && <div style={{ fontSize: 10, fontWeight: 700, color: "#dc2626", marginTop: 4 }}>↑ {queueByStep.initial} due now</div>}
            </div>

            <div style={{ textAlign: "center", color: L.dimmed, fontSize: 16, fontWeight: 300 }}>›</div>

            {/* Step 2 */}
            <div style={{ padding: "12px 14px", background: "#fffbeb", border: "1px solid #fde68a" }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#b45309" }}>Step 2 · Day 4+</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: "#b45309", margin: "4px 0" }}>{stageCounts.followup_1_sent + queueByStep.followup1}</div>
              <div style={{ fontSize: 11, color: "#92400e" }}>Follow-up 1</div>
              {queueByStep.followup1 > 0 && <div style={{ fontSize: 10, fontWeight: 700, color: "#dc2626", marginTop: 4 }}>↑ {queueByStep.followup1} due now</div>}
            </div>

            <div style={{ textAlign: "center", color: L.dimmed, fontSize: 16, fontWeight: 300 }}>›</div>

            {/* Step 3 */}
            <div style={{ padding: "12px 14px", background: "#fefce8", border: "1px solid #fef08a" }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#854d0e" }}>Step 3 · Day 11+</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: "#854d0e", margin: "4px 0" }}>{stageCounts.followup_2_sent + queueByStep.followup2}</div>
              <div style={{ fontSize: 11, color: "#713f12" }}>Follow-up 2</div>
              {queueByStep.followup2 > 0 && <div style={{ fontSize: 10, fontWeight: 700, color: "#dc2626", marginTop: 4 }}>↑ {queueByStep.followup2} due now</div>}
            </div>

            <div style={{ textAlign: "center", color: L.dimmed, fontSize: 16, fontWeight: 300 }}>›</div>

            {/* Converted */}
            <div style={{ padding: "12px 14px", background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#15803d" }}>Converted</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: "#15803d", margin: "4px 0" }}>{stageCounts.converted}</div>
              <div style={{ fontSize: 11, color: "#166534" }}>{repliedCount} replied · {bookedCount} booked</div>
            </div>
          </div>

          {/* Sequence settings */}
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${L.border}`, display: "flex", gap: 6, flexWrap: "wrap" }}>
            {STEP_ORDER.map((step) => (
              <div key={step} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", background: "#f8fafc", border: `1px solid ${L.border}`, fontSize: 11 }}>
                <span style={{ fontWeight: 700, color: L.text }}>{STEP_LABEL[step]}</span>
                <span style={{ color: L.dimmed }}>·</span>
                <span style={{ color: L.muted }}>{STEP_DAY[step]}</span>
                <span style={{ color: L.dimmed }}>·</span>
                <span style={{ color: L.dimmed }}>{STEP_TIMING[step]}</span>
              </div>
            ))}
            <Link href="/dashboard/templates" style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", background: "transparent", border: `1px solid ${L.border}`, fontSize: 11, fontWeight: 700, color: "#2563eb", textDecoration: "none" }}>
              Edit email templates →
            </Link>
          </div>
        </div>

        {/* Ready to send */}
        <div style={{ background: L.surface, border: `1px solid ${L.border}`, padding: "16px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: L.muted }}>Ready to Send</div>
              <p style={{ fontSize: 12.5, color: L.muted, marginTop: 3 }}>
                {queue.length > 0
                  ? `${queue.length} lead${queue.length !== 1 ? "s" : ""} due across ${segments.length} campaign${segments.length !== 1 ? "s" : ""}`
                  : "All caught up — no emails due right now."}
              </p>
            </div>
            <SendButton due={queue.length} />
          </div>

          {/* Campaign tabs */}
          {segments.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", paddingTop: 10, borderTop: `1px solid ${L.border}` }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: L.dimmed }}>Campaigns</span>
              {[{ key: "all", trade: "", location: "", count: queue.length }, ...segments].map((s) => {
                const active = activeSegment === s.key;
                const label = s.key === "all" ? "All Due" : segmentLabel(s.trade, s.location);
                const href = s.key === "all" ? "/dashboard/send" : `/dashboard/send?segment=${encodeURIComponent(s.key)}`;
                return (
                  <Link key={s.key} href={href} style={{
                    display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", fontSize: 11,
                    fontWeight: 600, textDecoration: "none",
                    border: `1px solid ${active ? "var(--red)" : L.border}`,
                    background: active ? "#fef2f2" : L.surface,
                    color: active ? "var(--red)" : L.muted,
                  }}>
                    {label}
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", background: active ? "#fee2e2" : "#f1f5f9", color: active ? "var(--red)" : L.dimmed }}>{s.count}</span>
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
              {activeSegment !== "all" && visibleQueue.length > 0 && (
                <div style={{ background: L.surface, border: `1px solid ${L.border}`, padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <span style={{ fontSize: 12.5, color: L.muted }}>
                    {visibleQueue.length} lead{visibleQueue.length !== 1 ? "s" : ""} due in{" "}
                    <strong style={{ color: L.text }}>{segmentLabel(visibleQueue[0].lead.trade, visibleQueue[0].lead.location)}</strong>
                  </span>
                  <SendButton due={visibleQueue.length} leadIds={visibleQueue.map((q) => q.lead.lead_id)} label={`Send campaign (${visibleQueue.length})`} />
                </div>
              )}

              {visibleQueue.length === 0 ? (
                <div style={{ background: L.surface, border: `1px solid ${L.border}`, padding: "32px", textAlign: "center", color: L.dimmed, fontSize: 13 }}>
                  Nothing due in this campaign.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  {/* Column headers */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 100px", gap: 0, padding: "6px 14px", background: "#f8fafc", border: `1px solid ${L.border}` }}>
                    {["Company", "Step", ""].map((h, i) => (
                      <div key={i} style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: L.dimmed }}>{h}</div>
                    ))}
                  </div>

                  {visibleQueue.map(({ lead, step }) => {
                    const active = selected?.lead.lead_id === lead.lead_id;
                    const params = new URLSearchParams();
                    if (activeSegment !== "all") params.set("segment", activeSegment);
                    params.set("lead", lead.lead_id);

                    const stepColors: Record<EmailStep, { bg: string; text: string }> = {
                      initial: { bg: "#fff7ed", text: "#c2410c" },
                      followup1: { bg: "#fffbeb", text: "#b45309" },
                      followup2: { bg: "#fefce8", text: "#854d0e" },
                    };
                    const sc = stepColors[step];

                    return (
                      <Link key={lead.lead_id} href={`/dashboard/send?${params.toString()}`} style={{
                        display: "grid", gridTemplateColumns: "1fr 100px 100px",
                        alignItems: "center", gap: 0,
                        background: active ? "#fef2f2" : L.surface,
                        border: `1px solid ${active ? "var(--red)" : L.border}`,
                        borderLeft: active ? "2px solid var(--red)" : `2px solid transparent`,
                        padding: "10px 14px", textDecoration: "none",
                        marginTop: -1,
                      }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 13.5, color: L.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{lead.company}</div>
                          <div style={{ fontSize: 11.5, color: L.dimmed, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{lead.email}</div>
                        </div>
                        <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", background: sc.bg, color: sc.text, display: "inline-block" }}>
                          {STEP_LABEL[step]}
                        </span>
                        <div style={{ display: "flex", justifyContent: "flex-end" }}>
                          <SendButton due={1} leadIds={[lead.lead_id]} label="Send" />
                        </div>
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
                  {/* Preview header */}
                  <div style={{ background: L.surface, border: `1px solid ${L.border}` }}>
                    <div style={{ padding: "12px 16px", borderBottom: `1px solid ${L.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 13.5, color: L.text }}>{selected.lead.company}</div>
                        <div style={{ fontSize: 11.5, color: L.dimmed, marginTop: 1 }}>{selected.lead.email}</div>
                      </div>
                      <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", background: "#fff7ed", color: "#c2410c" }}>
                        {STEP_LABEL[selected.step]}
                      </span>
                    </div>
                    <div style={{ padding: "14px 16px" }}>
                      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: L.dimmed, marginBottom: 3 }}>Subject</div>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: L.text, marginBottom: 12 }}>{selected.subject}</div>
                      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: L.dimmed, marginBottom: 6 }}>Body</div>
                      <div style={{ border: `1px solid ${L.border}`, padding: 14, background: "#f8fafc", maxHeight: 340, overflow: "auto", fontSize: 13, lineHeight: 1.6 }}
                        dangerouslySetInnerHTML={{ __html: selected.html }} />
                    </div>
                    <div style={{ padding: "0 16px 14px", display: "flex", gap: 8, alignItems: "center" }}>
                      <SendButton due={1} leadIds={[selected.lead.lead_id]} label="Send this email" />
                      <Link href={`/dashboard/leads/${selected.lead.lead_id}`} style={{ fontSize: 12, color: "#2563eb", fontWeight: 600, textDecoration: "none" }}>
                        View lead →
                      </Link>
                    </div>
                  </div>

                  {/* Sequence status for this lead */}
                  <div style={{ background: L.surface, border: `1px solid ${L.border}`, padding: "14px 16px" }}>
                    <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: L.muted, marginBottom: 12 }}>Sequence Status</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {STEP_ORDER.map((step, i) => {
                        const stepIndex = STEP_ORDER.indexOf(selected.step);
                        const isDone = i < stepIndex;
                        const isCurrent = step === selected.step;
                        const isPending = i > stepIndex;
                        return (
                          <div key={step} style={{
                            display: "flex", gap: 10, alignItems: "flex-start",
                            padding: "8px 10px",
                            background: isCurrent ? "#fef2f2" : isDone ? "#f0fdf4" : "#f8fafc",
                            border: `1px solid ${isCurrent ? "#fca5a5" : isDone ? "#bbf7d0" : L.border}`,
                          }}>
                            <span style={{
                              width: 18, height: 18, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: 10, fontWeight: 800,
                              background: isCurrent ? "var(--red)" : isDone ? "#16a34a" : "#e2e8f0",
                              color: isCurrent || isDone ? "#fff" : L.dimmed,
                            }}>
                              {isDone ? "✓" : i + 1}
                            </span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 700, color: isCurrent ? "var(--red)" : isDone ? "#15803d" : L.muted }}>
                                {STEP_LABEL[step]}
                                {isCurrent && " · Due now"}
                                {isDone && " · Sent"}
                                {isPending && " · Pending"}
                              </div>
                              <div style={{ fontSize: 11, color: L.dimmed, marginTop: 1 }}>{STEP_TIMING[step]}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${L.border}`, fontSize: 11.5, color: L.dimmed, lineHeight: 1.5 }}>
                      Template: <strong style={{ color: L.muted }}>{INDUSTRY_LABELS[industryKey(selected.lead.trade)]}</strong>
                      {" · "}
                      <Link href={`/dashboard/templates?trade=${encodeURIComponent(selected.lead.trade)}`} style={{ color: "#2563eb" }}>Edit</Link>
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ background: L.surface, border: `1px solid ${L.border}`, padding: "40px", textAlign: "center", color: L.dimmed, fontSize: 13 }}>
                  Select a lead to preview their email.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
