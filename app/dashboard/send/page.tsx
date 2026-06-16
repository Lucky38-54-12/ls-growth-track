import { createSupabaseClient } from "@/lib/supabase";
import { nextStepFor, groupBySegment, segmentKey, segmentLabel } from "@/lib/leads";
import { renderTemplate, EmailStep, industryKey, INDUSTRY_LABELS } from "@/lib/templates";
import { Lead } from "@/lib/types";
import SendButton from "@/components/SendButton";
import Topbar from "@/components/Topbar";
import Link from "next/link";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };

export const revalidate = 0;

const STEP_LABEL: Record<EmailStep, string> = {
  initial: "Initial outreach",
  followup1: "Follow-up 1",
  followup2: "Follow-up 2",
};

const STEP_ORDER: EmailStep[] = ["initial", "followup1", "followup2"];

const STEP_CADENCE: Record<EmailStep, string> = {
  initial: "Sent as soon as a lead is due",
  followup1: "Sent ~4 days after the initial email if there's no reply",
  followup2: "Sent ~7 days after follow-up 1 if there's still no reply",
};

type QueueItem = { lead: Lead; step: EmailStep; subject: string; html: string };

export default async function SendQueuePage({
  searchParams,
}: {
  searchParams: { segment?: string; lead?: string };
}) {
  const sb = createSupabaseClient();
  const { data: leads } = await sb.from("leads").select("*").order("date_added", { ascending: false });
  const allLeads = (leads || []) as Lead[];

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

  return (
    <div style={{ background: "#f1f5f9", minHeight: "100vh" }}>
      <Topbar title="EMAIL OUTREACH" subtitle="Preview exactly what will be sent before it goes out" />

      <div style={{ padding: "20px 28px 60px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ background: L.surface, border: `1px solid ${L.border}`, padding: "18px 18px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: L.muted }}>Ready to send</span>
            {queue.length > 0 && (
              <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", background: "#fee2e2", color: "#dc2626" }}>{queue.length} due</span>
            )}
          </div>
          <p style={{ fontSize: 12.5, color: L.muted, marginBottom: 14, lineHeight: 1.5 }}>
            {queue.length > 0
              ? `${queue.length} lead${queue.length !== 1 ? "s" : ""} ready for their next email across ${segments.length} campaign${segments.length !== 1 ? "s" : ""} — use the lists below to send each campaign separately.`
              : "All caught up — no emails due right now."}
          </p>
          <SendButton due={queue.length} />
        </div>

        {segments.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: L.dimmed }}>Campaigns</span>
            {[{ key: "all", trade: "", location: "", count: queue.length }, ...segments].map((s) => {
              const active = activeSegment === s.key;
              const label = s.key === "all" ? "All Due" : segmentLabel(s.trade, s.location);
              const href = s.key === "all" ? "/dashboard/send" : `/dashboard/send?segment=${encodeURIComponent(s.key)}`;
              return (
                <Link key={s.key} href={href} style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "5px 12px", fontSize: 11, fontWeight: 600, textDecoration: "none",
                  border: `1px solid ${active ? "#2563eb" : L.border}`,
                  background: active ? "#eff6ff" : L.surface,
                  color: active ? "#2563eb" : L.muted,
                  transition: "all 0.15s",
                }}>
                  {label}
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: "1px 6px",
                    background: active ? "#dbeafe" : "#f1f5f9",
                    color: active ? "#2563eb" : L.dimmed,
                  }}>{s.count}</span>
                </Link>
              );
            })}
          </div>
        )}

        {queue.length === 0 ? (
          <div style={{ background: "#fff", border: `1px solid ${L.border}`, padding: "32px", textAlign: "center", color: L.dimmed, fontSize: 13 }}>
            Nothing in the queue right now.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 420px", gap: 12, alignItems: "start" }}>
            {/* List */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {activeSegment !== "all" && visibleQueue.length > 0 && (
                <div style={{ background: L.surface, border: `1px solid ${L.border}`, padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <span style={{ fontSize: 12.5, color: L.muted }}>
                    {visibleQueue.length} lead{visibleQueue.length !== 1 ? "s" : ""} due in <strong style={{ color: L.text }}>{segmentLabel(visibleQueue[0].lead.trade, visibleQueue[0].lead.location)}</strong>
                  </span>
                  <SendButton due={visibleQueue.length} leadIds={visibleQueue.map((q) => q.lead.lead_id)} label={`Send this campaign (${visibleQueue.length})`} />
                </div>
              )}

              {visibleQueue.length === 0 ? (
                <div style={{ background: "#fff", border: `1px solid ${L.border}`, padding: "32px", textAlign: "center", color: L.dimmed, fontSize: 13 }}>
                  Nothing due in this campaign.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {visibleQueue.map(({ lead, step }) => {
                    const active = selected?.lead.lead_id === lead.lead_id;
                    const params = new URLSearchParams();
                    if (activeSegment !== "all") params.set("segment", activeSegment);
                    params.set("lead", lead.lead_id);
                    return (
                      <Link key={lead.lead_id} href={`/dashboard/send?${params.toString()}`} style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                        background: active ? "#eff6ff" : L.surface,
                        border: `1px solid ${active ? "#2563eb" : L.border}`,
                        padding: "12px 16px", textDecoration: "none",
                      }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 800, fontSize: 14, color: L.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{lead.company}</div>
                          <div style={{ fontSize: 12, color: L.muted, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{lead.email}</div>
                        </div>
                        <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", background: "#fee2e2", color: "#dc2626", flexShrink: 0 }}>
                          {STEP_LABEL[step]}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Preview */}
            <div style={{ position: "sticky", top: 20, display: "flex", flexDirection: "column", gap: 12 }}>
              {selected ? (
                <>
                  <div style={{ background: L.surface, border: `1px solid ${L.border}` }}>
                    <div style={{ padding: "14px 18px", borderBottom: `1px solid ${L.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: 14, color: L.text }}>{selected.lead.company}</div>
                        <div style={{ fontSize: 12, color: L.muted, marginTop: 2 }}>{selected.lead.email}</div>
                      </div>
                      <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", background: "#fee2e2", color: "#dc2626", flexShrink: 0 }}>
                        {STEP_LABEL[selected.step]}
                      </span>
                    </div>
                    <div style={{ padding: 18 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, marginBottom: 4 }}>Subject</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: L.text, marginBottom: 14 }}>{selected.subject}</div>
                      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, marginBottom: 8 }}>Body</div>
                      <div style={{ border: `1px solid ${L.border}`, padding: 16, background: "#f8fafc", maxHeight: 420, overflow: "auto" }} dangerouslySetInnerHTML={{ __html: selected.html }} />
                    </div>
                    <div style={{ padding: "0 18px 18px" }}>
                      <SendButton due={1} leadIds={[selected.lead.lead_id]} label={`Send this email`} />
                    </div>
                  </div>

                  <div style={{ background: L.surface, border: `1px solid ${L.border}`, padding: 18 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, marginBottom: 4 }}>Sequence</div>
                    <p style={{ fontSize: 12, color: L.muted, marginBottom: 12, lineHeight: 1.5 }}>
                      3-step sequence — stops automatically as soon as the lead replies or books.
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {STEP_ORDER.map((step) => {
                        const isCurrent = step === selected.step;
                        return (
                          <div key={step} style={{
                            display: "flex", gap: 10, alignItems: "flex-start",
                            padding: "8px 10px", background: isCurrent ? "#eff6ff" : "transparent",
                            border: `1px solid ${isCurrent ? "#2563eb" : L.border}`,
                          }}>
                            <span style={{
                              fontSize: 10, fontWeight: 700, padding: "2px 6px", flexShrink: 0,
                              background: isCurrent ? "#2563eb" : "#f1f5f9",
                              color: isCurrent ? "#fff" : L.dimmed,
                            }}>{STEP_LABEL[step]}</span>
                            <span style={{ fontSize: 12, color: isCurrent ? L.text : L.muted, lineHeight: 1.4 }}>{STEP_CADENCE[step]}</span>
                          </div>
                        );
                      })}
                    </div>
                    <p style={{ fontSize: 11.5, color: L.dimmed, marginTop: 12, lineHeight: 1.5 }}>
                      Template set: <strong style={{ color: L.muted }}>{INDUSTRY_LABELS[industryKey(selected.lead.trade)]}</strong> (based on trade &quot;{selected.lead.trade || "—"}&quot;).
                      {" "}<Link href={`/dashboard/templates?trade=${encodeURIComponent(selected.lead.trade)}&location=${encodeURIComponent(selected.lead.location)}`} style={{ color: "#2563eb" }}>Edit templates</Link>
                    </p>
                  </div>
                </>
              ) : (
                <div style={{ background: "#fff", border: `1px solid ${L.border}`, padding: "32px", textAlign: "center", color: L.dimmed, fontSize: 13 }}>
                  Select a lead to preview its email.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
