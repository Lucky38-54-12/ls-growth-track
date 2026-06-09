import { Suspense } from "react";
import { createSupabaseClient } from "@/lib/supabase";
import { nextStepFor } from "@/lib/leads";
import { Lead, EmailEvent, EngagementSummary } from "@/lib/types";
import SendButton from "@/components/SendButton";
import FlashMessage from "./FlashMessage";
import Link from "next/link";

const L = { bg: "#f1f5f9", surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };

const COLUMNS = [
  { key: "not_contacted", label: "Not Contacted", color: "#94a3b8" },
  { key: "contacted", label: "Contacted", color: "#2563eb" },
  { key: "followup_1_sent", label: "Follow-up 1", color: "#2563eb" },
  { key: "followup_2_sent", label: "Follow-up 2", color: "#2563eb" },
  { key: "warm", label: "Replied / Booked", color: "#16a34a" },
] as const;

const WARM_STATUSES = new Set(["replied", "booked"]);

export const revalidate = 0;

export default async function DashboardPage() {
  const sb = createSupabaseClient();

  const [{ data: leads }, { data: events }] = await Promise.all([
    sb.from("leads").select("*").order("date_added", { ascending: false }),
    sb.from("email_events").select("*"),
  ]);

  const allLeads = (leads || []) as Lead[];

  const engagement: Record<string, EngagementSummary> = {};
  for (const ev of (events || []) as EmailEvent[]) {
    if (!engagement[ev.lead_id]) engagement[ev.lead_id] = { opens: 0, clicks: 0, last_event_at: null };
    if (ev.event_type === "open") engagement[ev.lead_id].opens++;
    if (ev.event_type === "click") engagement[ev.lead_id].clicks++;
    if (!engagement[ev.lead_id].last_event_at || ev.created_at > engagement[ev.lead_id].last_event_at!) {
      engagement[ev.lead_id].last_event_at = ev.created_at;
    }
  }

  const total = allLeads.length;
  const notContacted = allLeads.filter((l) => l.status === "not_contacted").length;
  const inSequence = allLeads.filter((l) => ["contacted", "followup_1_sent", "followup_2_sent"].includes(l.status)).length;
  const warmCount = allLeads.filter((l) => WARM_STATUSES.has(l.status)).length;
  const due = allLeads.filter((l) => nextStepFor(l) !== null).length;
  const emailsSent = allLeads.reduce((acc, l) => acc + (l.status === "not_contacted" ? 0 : 1) + (l.followup_count || 0), 0);

  const tradeCounts: Record<string, number> = {};
  for (const l of allLeads) {
    const t = l.trade?.trim() || "Unspecified";
    tradeCounts[t] = (tradeCounts[t] || 0) + 1;
  }
  const maxTrade = Math.max(1, ...Object.values(tradeCounts));

  return (
    <div>
      {/* Header */}
      <div style={{
        background: "#fff", borderBottom: `1px solid ${L.border}`, padding: "0 28px",
        height: 68, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: "var(--red)", flexShrink: 0 }} />
          <div>
            <h1 style={{ fontSize: 17, fontWeight: 900, letterSpacing: "0.04em", lineHeight: 1.15 }}>PIPELINE</h1>
            <p style={{ color: L.muted, fontSize: 12, marginTop: 1 }}>Outreach pipeline — leads you&apos;ve contacted</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "var(--green)" }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--green)", display: "inline-block" }} />
            LIVE
          </span>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--red)", color: "#fff", fontWeight: 800, fontSize: 12.5, display: "flex", alignItems: "center", justifyContent: "center" }}>LS</div>
        </div>
      </div>

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "26px 28px 60px" }}>

        <Suspense fallback={null}><FlashMessage /></Suspense>

        {/* Stats */}
        <div style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--red)", fontWeight: 800, marginBottom: 12 }}>Overview</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 14, marginBottom: 28 }}>
          {[
            { label: "Total Leads", value: total, sub: "in pipeline", pct: 100 },
            { label: "Contacted", value: total - notContacted, sub: `${total ? Math.round(100*(total-notContacted)/total) : 0}% of pipeline`, pct: total ? (total-notContacted)/total*100 : 0 },
            { label: "In Sequence", value: inSequence, sub: "follow-ups running", pct: total ? inSequence/total*100 : 0 },
            { label: "Warm Leads", value: warmCount, sub: "replied / booked", pct: total ? warmCount/total*100 : 0, green: true },
            { label: "Due Now", value: due, sub: `${emailsSent} emails sent total`, pct: total ? due/total*100 : 0, accent: true },
          ].map(({ label, value, sub, pct, green, accent }) => (
            <div key={label} style={{
              background: L.surface, border: `1px solid ${L.border}`,
              borderTop: `3px solid ${green ? "var(--green)" : accent ? "var(--red)" : L.border}`,
              borderRadius: 10, padding: "16px 18px",
            }}>
              <div style={{ fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, fontWeight: 700 }}>{label}</div>
              <div style={{ fontSize: 32, fontWeight: 900, marginTop: 6, lineHeight: 1, color: green ? "var(--green)" : accent ? "var(--red)" : L.text }}>{value}</div>
              <div style={{ fontSize: 12, color: L.dimmed, marginTop: 4 }}>{sub}</div>
              <div style={{ marginTop: 10, background: "#f1f5f9", borderRadius: 6, height: 5, overflow: "hidden" }}>
                <div style={{ height: "100%", background: green ? "var(--green)" : "var(--red)", borderRadius: 6, width: `${Math.min(100, pct)}%` }} />
              </div>
            </div>
          ))}
        </div>

        {/* Trade breakdown + send */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 20, marginBottom: 28 }}>
          <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 10, padding: 20 }}>
            <div style={{ fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, fontWeight: 800, marginBottom: 14 }}>Leads by Trade</div>
            {Object.keys(tradeCounts).length === 0 ? (
              <p style={{ color: L.muted, fontSize: 13 }}>No leads yet.</p>
            ) : (
              Object.entries(tradeCounts).sort((a, b) => b[1] - a[1]).map(([trade, count]) => (
                <div key={trade} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10, fontSize: 13 }}>
                  <div style={{ width: 130, flexShrink: 0, fontWeight: 600 }}>{trade}</div>
                  <div style={{ flex: 1, background: "#f1f5f9", borderRadius: 6, height: 9, overflow: "hidden" }}>
                    <div style={{ background: "var(--red)", height: "100%", borderRadius: 6, width: `${Math.round(count/maxTrade*100)}%` }} />
                  </div>
                  <div style={{ width: 64, textAlign: "right", color: L.muted, flexShrink: 0 }}>
                    {count} ({total ? Math.round(count/total*100) : 0}%)
                  </div>
                </div>
              ))
            )}
          </div>

          <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 10, padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, fontWeight: 800 }}>Send Outreach</div>
            <p style={{ fontSize: 13, color: L.muted }}>
              {due > 0 ? `${due} lead${due !== 1 ? "s" : ""} are due for their next email.` : "No emails due right now."}
            </p>
            <SendButton due={due} />
            <Link href="/dashboard/new" style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              padding: "11px 20px", background: L.surface, color: L.text,
              border: `1px solid ${L.border}`, borderRadius: 8, fontSize: 14, fontWeight: 700,
            }}>
              + Add Lead
            </Link>
          </div>
        </div>

        {/* Kanban */}
        <div style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--red)", fontWeight: 800, marginBottom: 12 }}>Pipeline</div>
        <div style={{ display: "flex", gap: 18, overflowX: "auto", paddingBottom: 8, alignItems: "flex-start" }}>
          {COLUMNS.map(({ key, label, color }) => {
            const colLeads = key === "warm"
              ? allLeads.filter((l) => WARM_STATUSES.has(l.status))
              : allLeads.filter((l) => l.status === key);
            return (
              <div key={key} style={{ minWidth: 270, flex: 1, borderTop: `2px solid ${color}`, paddingTop: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 2px", marginBottom: 14 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0, display: "inline-block" }} />
                  <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase" }}>{label}</span>
                  <span style={{ color: L.dimmed, fontWeight: 700, fontSize: 12, marginLeft: "auto" }}>{colLeads.length}</span>
                </div>
                {colLeads.length === 0 ? (
                  <div style={{ color: L.dimmed, fontSize: 12.5, padding: "14px 0", textAlign: "center" }}>Nothing here</div>
                ) : colLeads.map((lead) => {
                  const ev = engagement[lead.lead_id];
                  const isWarm = WARM_STATUSES.has(lead.status);
                  const leftColor = isWarm ? "var(--green)" : key === "not_contacted" ? "#94a3b8" : "var(--blue)";
                  return (
                    <div key={lead.lead_id} style={{
                      background: "#fff", border: `1px solid ${L.border}`,
                      borderLeft: `3px solid ${leftColor}`, borderRadius: 8,
                      padding: "12px 14px", marginBottom: 10,
                    }}>
                      <div style={{ fontWeight: 800, fontSize: 13.5 }}>{lead.company}</div>
                      <div style={{ fontSize: 12, color: L.muted, marginTop: 2 }}>{lead.contact_name} · {lead.email}</div>
                      <div style={{ fontSize: 11.5, color: L.dimmed, marginTop: 6 }}>
                        {[lead.trade, lead.location, lead.date_contacted && `contacted ${lead.date_contacted}`].filter(Boolean).join(" · ")}
                      </div>
                      {(isWarm || ev) && (
                        <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {isWarm && <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 100, background: "#dcfce7", color: "#166534" }}>{lead.status}</span>}
                          {ev?.opens > 0 && <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 100, background: "#dbeafe", color: "#1e40af" }}>{ev.opens} open{ev.opens !== 1 ? "s" : ""}</span>}
                          {ev?.clicks > 0 && <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 100, background: "#fce7f3", color: "#9d174d" }}>{ev.clicks} click{ev.clicks !== 1 ? "s" : ""}</span>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
