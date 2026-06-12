import { Suspense } from "react";
import { createSupabaseClient } from "@/lib/supabase";
import { nextStepFor } from "@/lib/leads";
import { Lead, EmailEvent, EngagementSummary } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
import SendButton from "@/components/SendButton";
import SheetSyncButton from "@/components/SheetSyncButton";
import FlashMessage from "./FlashMessage";
import Link from "next/link";

export const revalidate = 0;

const WARM_STATUSES = new Set(["replied", "booked"]);
const SEQUENCE_STATUSES = ["contacted", "followup_1_sent", "followup_2_sent"];
const DONE_STATUSES = new Set(["sequence_complete", "not_interested", "bounced"]);

const STATUS_LABEL: Record<string, string> = {
  not_contacted: "Not contacted",
  contacted: "Contacted",
  followup_1_sent: "Follow-up 1",
  followup_2_sent: "Follow-up 2",
  replied: "Replied",
  booked: "Booked",
  not_interested: "Not interested",
  bounced: "Bounced",
  sequence_complete: "Complete",
};

const STATUS_COLOR: Record<string, string> = {
  not_contacted: "#94a3b8",
  contacted: "#2563eb",
  followup_1_sent: "#7c3aed",
  followup_2_sent: "#7c3aed",
  replied: "#16a34a",
  booked: "#16a34a",
  not_interested: "#94a3b8",
  bounced: "#dc2626",
  sequence_complete: "#94a3b8",
};

function timeAgo(dateStr: string | null) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function initials(name: string) {
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

function LeadRow({ lead, engagement }: { lead: Lead; engagement: Record<string, EngagementSummary> }) {
  const ev = engagement[lead.lead_id];
  const color = STATUS_COLOR[lead.status] || "#94a3b8";
  const isDue = nextStepFor(lead) !== null;
  return (
    <Link href={`/dashboard/leads/${lead.lead_id}`} className="card-hover" style={{
      background: "#fff", border: "1px solid #e2e8f0",
      borderLeft: `3px solid ${color}`,
      borderRadius: 0, padding: "12px 16px",
      display: "flex", alignItems: "center", gap: 14,
    }}>
      {/* Initials badge */}
      <div style={{
        width: 36, height: 36, borderRadius: 0, background: "#f1f5f9",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0, fontWeight: 900, fontSize: 11, color: "#64748b",
        border: "1px solid #e2e8f0",
      }}>
        {initials(lead.company)}
      </div>

      {/* Main info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 800, fontSize: 13.5, color: "#0f172a", marginBottom: 2 }}>{lead.company}</div>
        <div style={{ fontSize: 11.5, color: "#64748b" }}>
          {lead.trade}{lead.location ? ` · ${lead.location}` : ""}
          {lead.date_contacted ? ` · contacted ${lead.date_contacted}` : ""}
        </div>
      </div>

      {/* Engagement pills */}
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        {ev?.opens > 0 && <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 0, background: "#dbeafe", color: "#1e40af" }}>{ev.opens} open{ev.opens !== 1 ? "s" : ""}</span>}
        {ev?.clicks > 0 && <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 0, background: "#fce7f3", color: "#9d174d" }}>{ev.clicks} click{ev.clicks !== 1 ? "s" : ""}</span>}
      </div>

      {/* Status + due */}
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color, marginBottom: 3 }}>{STATUS_LABEL[lead.status] || lead.status}</div>
        {isDue && <div style={{ fontSize: 10.5, fontWeight: 700, color: "#dc2626" }}>Due now</div>}
      </div>

      <span style={{ color: "#94a3b8", fontSize: 16, flexShrink: 0 }}>→</span>
    </Link>
  );
}

function LeadGroup({
  title, hint, accent, leads, engagement, defaultOpen, maxVisible, emptyText, moreHref,
}: {
  title: string;
  hint: string;
  accent: string;
  leads: Lead[];
  engagement: Record<string, EngagementSummary>;
  defaultOpen: boolean;
  maxVisible: number;
  emptyText: string;
  moreHref?: string;
}) {
  const visible = leads.slice(0, maxVisible);
  const remaining = leads.length - visible.length;
  return (
    <details open={defaultOpen} style={{ background: "#fff", border: "1px solid #e2e8f0", borderLeft: `3px solid ${accent}`, borderRadius: 0, marginBottom: 10 }}>
      <summary style={{
        cursor: "pointer", padding: "12px 16px",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
      }}>
        <div>
          <span style={{ fontSize: 13, fontWeight: 800, color: "#0f172a" }}>{title}</span>
          <span style={{ fontSize: 11.5, color: "#94a3b8", marginLeft: 8 }}>{hint}</span>
        </div>
        <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 0, background: "#f1f5f9", color: "#64748b", flexShrink: 0 }}>
          {leads.length}
        </span>
      </summary>
      <div style={{ borderTop: "1px solid #e2e8f0", padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
        {leads.length === 0 ? (
          <div style={{ textAlign: "center", color: "#94a3b8", fontSize: 12.5, padding: "12px 0" }}>{emptyText}</div>
        ) : (
          <>
            {visible.map(lead => <LeadRow key={lead.lead_id} lead={lead} engagement={engagement} />)}
            {remaining > 0 && (
              <div style={{ textAlign: "center", padding: "6px 0", fontSize: 12, color: "#94a3b8" }}>
                +{remaining} more {moreHref ? <Link href={moreHref} style={{ color: "#dc2626", fontWeight: 700 }}>— view all →</Link> : null}
              </div>
            )}
          </>
        )}
      </div>
    </details>
  );
}

export default async function DashboardPage() {
  const sb = createSupabaseClient();

  const [{ data: leads }, { data: events }] = await Promise.all([
    sb.from("leads").select("*").order("date_added", { ascending: false }),
    sb.from("email_events").select("*").order("created_at", { ascending: false }),
  ]);

  const allLeads = (leads || []) as Lead[];

  // Build engagement map
  const engagement: Record<string, EngagementSummary> = {};
  for (const ev of (events || []) as EmailEvent[]) {
    if (!engagement[ev.lead_id]) engagement[ev.lead_id] = { opens: 0, clicks: 0, last_event_at: null };
    if (ev.event_type === "open") engagement[ev.lead_id].opens++;
    if (ev.event_type === "click") engagement[ev.lead_id].clicks++;
    if (!engagement[ev.lead_id].last_event_at) engagement[ev.lead_id].last_event_at = ev.created_at;
  }

  // Stats
  const total = allLeads.length;
  const contacted = allLeads.filter(l => l.status !== "not_contacted").length;
  const inSequence = allLeads.filter(l => SEQUENCE_STATUSES.includes(l.status)).length;
  const warmCount = allLeads.filter(l => WARM_STATUSES.has(l.status)).length;
  const due = allLeads.filter(l => nextStepFor(l) !== null).length;
  const emailsSent = allLeads.reduce((acc, l) => acc + (l.status === "not_contacted" ? 0 : 1) + (l.followup_count || 0), 0);
  const responseRate = contacted > 0 ? Math.round((warmCount / contacted) * 100) : 0;

  // Pipeline groups — where does each lead sit, and what needs to happen next?
  const needsFirstEmail = allLeads.filter(l => l.status === "not_contacted");
  const dueFollowup = allLeads.filter(l => l.status !== "not_contacted" && nextStepFor(l) !== null);
  const waiting = allLeads.filter(l => SEQUENCE_STATUSES.includes(l.status) && nextStepFor(l) === null);
  const warmLeadsAll = allLeads.filter(l => WARM_STATUSES.has(l.status));
  const doneLeads = allLeads.filter(l => DONE_STATUSES.has(l.status));

  // Warm leads for right panel (engaged or replied)
  const warmLeads = allLeads
    .filter(l => {
      const ev = engagement[l.lead_id];
      return WARM_STATUSES.has(l.status) || (ev && (ev.opens > 0 || ev.clicks > 0));
    })
    .sort((a, b) => {
      const aWarm = WARM_STATUSES.has(a.status) ? 2 : 0;
      const bWarm = WARM_STATUSES.has(b.status) ? 2 : 0;
      const aClicks = (engagement[a.lead_id]?.clicks || 0);
      const bClicks = (engagement[b.lead_id]?.clicks || 0);
      return (bWarm + bClicks) - (aWarm + aClicks);
    })
    .slice(0, 8);

  return (
    <div style={{ background: "#f1f5f9", minHeight: "100vh" }}>
      <Suspense fallback={null}><FlashMessage /></Suspense>

      <div style={{ padding: "28px 28px 60px" }}>

        {/* Section label */}
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: "#dc2626", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13 }}>📈</span> Outreach Pipeline This Week
        </div>

        {/* Stat cards */}
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
          background: "#fff", border: "1px solid #e2e8f0", borderRadius: 0,
          overflow: "hidden", marginBottom: 16,
        }}>
          {[
            { icon: "↗", value: total, label: "Total Leads", sub: "In pipeline", accent: false },
            { icon: "💬", value: `${responseRate}%`, label: "Response Rate", sub: "Replies & bookings", accent: false },
            { icon: "⚡", value: emailsSent, label: "Emails Sent", sub: "Across all sequences", accent: false },
            { icon: "$", value: warmCount, label: "Warm Leads", sub: "Worth a call now", accent: true },
          ].map(({ icon, value, label, sub, accent }, i, arr) => (
            <div key={label} style={{
              padding: "22px 22px 20px",
              borderRight: i < arr.length - 1 ? "1px solid #e2e8f0" : undefined,
              borderLeft: accent ? "3px solid #16a34a" : undefined,
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 0,
                background: accent ? "#dcfce7" : "#f1f5f9",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 14, fontWeight: 900, color: accent ? "#16a34a" : "#64748b",
                marginBottom: 12,
              }}>{icon}</div>
              <div style={{ fontSize: 38, fontWeight: 900, lineHeight: 1, color: accent ? "#16a34a" : "#0f172a", marginBottom: 6 }}>{value}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", marginBottom: 3 }}>{label}</div>
              <div style={{ fontSize: 12, color: "#94a3b8" }}>{sub}</div>
            </div>
          ))}
        </div>

        {/* Impact bar */}
        <div style={{
          background: "#fff", border: "1px solid #e2e8f0", borderRadius: 0,
          padding: "12px 22px", display: "flex", alignItems: "center", gap: 32,
          marginBottom: 24, flexWrap: "wrap",
        }}>
          <span style={{ fontSize: 10.5, color: "#94a3b8", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", flexShrink: 0 }}>Outreach Impact</span>
          {[
            { value: contacted, label: "Leads Contacted" },
            { value: inSequence, label: "In Sequence" },
            { value: due, label: "Due Today" },
            { value: `${responseRate}%`, label: "Response Rate" },
            { value: emailsSent, label: "Total Emails" },
          ].map(({ value, label }) => (
            <div key={label} style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontSize: 15, fontWeight: 900, color: "#0f172a" }}>{value}</span>
              <span style={{ fontSize: 12, color: "#64748b" }}>{label}</span>
            </div>
          ))}
        </div>

        {/* Main grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 288px", gap: 20, alignItems: "flex-start" }}>

          {/* Pipeline groups */}
          <div>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              marginBottom: 14,
            }}>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "#64748b" }}>Pipeline — where every lead sits</span>
              <Link href="/dashboard/new" className="btn-lift" style={{
                padding: "8px 16px", background: "#dc2626", color: "#fff",
                borderRadius: 0, fontSize: 13, fontWeight: 700, textDecoration: "none",
                display: "inline-flex", alignItems: "center", gap: 6,
              }}>+ Add Lead</Link>
            </div>

            {total === 0 ? (
              <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 0, padding: "32px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
                No leads yet — <Link href="/dashboard/new" style={{ color: "#dc2626", fontWeight: 700 }}>add your first lead</Link> or <Link href="/dashboard/import" style={{ color: "#dc2626", fontWeight: 700 }}>import a batch</Link>.
              </div>
            ) : (
              <>
                <LeadGroup
                  title="Needs first email"
                  hint="never contacted yet"
                  accent="#dc2626"
                  leads={needsFirstEmail}
                  engagement={engagement}
                  defaultOpen={true}
                  maxVisible={8}
                  emptyText="Nobody waiting on a first email."
                  moreHref="/dashboard/send"
                />
                <LeadGroup
                  title="Due for follow-up"
                  hint="in sequence, ready for the next email"
                  accent="#dc2626"
                  leads={dueFollowup}
                  engagement={engagement}
                  defaultOpen={true}
                  maxVisible={8}
                  emptyText="No follow-ups due right now."
                  moreHref="/dashboard/send"
                />
                <LeadGroup
                  title="Waiting"
                  hint="in sequence, not due yet"
                  accent="#7c3aed"
                  leads={waiting}
                  engagement={engagement}
                  defaultOpen={false}
                  maxVisible={6}
                  emptyText="Nothing waiting."
                />
                <LeadGroup
                  title="Warm / replied"
                  hint="opened, clicked, replied or booked — worth a call"
                  accent="#16a34a"
                  leads={warmLeadsAll}
                  engagement={engagement}
                  defaultOpen={false}
                  maxVisible={6}
                  emptyText="Nobody warm yet."
                  moreHref="/dashboard/warm"
                />
                <LeadGroup
                  title="Done"
                  hint="sequence complete, not interested, or bounced"
                  accent="#94a3b8"
                  leads={doneLeads}
                  engagement={engagement}
                  defaultOpen={false}
                  maxVisible={6}
                  emptyText="Nothing closed out yet."
                />
              </>
            )}
          </div>

          {/* Right panel: warm leads + send */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

            {/* Send card */}
            <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 0, padding: "18px 18px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "#64748b" }}>Send Outreach</span>
                {due > 0 && (
                  <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 0, background: "#fee2e2", color: "#dc2626" }}>{due} due</span>
                )}
              </div>
              <p style={{ fontSize: 12.5, color: "#64748b", marginBottom: 14, lineHeight: 1.5 }}>
                {due > 0 ? `${due} lead${due !== 1 ? "s" : ""} ready for their next email.` : "All caught up — no emails due right now."}
              </p>
              <SendButton due={due} />
              {due > 0 && (
                <Link href="/dashboard/send" style={{ display: "block", marginTop: 10, fontSize: 12.5, fontWeight: 700, color: "#dc2626" }}>
                  Preview what&apos;s about to be sent →
                </Link>
              )}
            </div>

            {/* Warm leads panel */}
            <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderLeft: "3px solid #16a34a", borderRadius: 0, overflow: "hidden" }}>
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "14px 18px 12px", borderBottom: "1px solid #e2e8f0",
                background: "#dcfce7",
              }}>
                <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "#16a34a" }}>Warm Leads</span>
                <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: "#16a34a" }}>
                  <span style={{ width: 6, height: 6, borderRadius: 0, background: "#16a34a", display: "inline-block" }} />
                  LIVE
                </span>
              </div>

              {warmLeads.length === 0 ? (
                <div style={{ padding: "24px 18px", textAlign: "center", color: "#94a3b8", fontSize: 12.5 }}>Nobody warm yet — keep sending!</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 10 }}>
                  {warmLeads.map(lead => {
                    const ev = engagement[lead.lead_id];
                    const isReplied = WARM_STATUSES.has(lead.status);
                    const statusText = isReplied ? lead.status.toUpperCase() : ev?.clicks > 0 ? "CLICKED" : "OPENED";
                    const statusColor = isReplied ? "#16a34a" : ev?.clicks > 0 ? "#9d174d" : "#1e40af";
                    const lastDate = ev?.last_event_at || lead.last_followup || lead.date_contacted;
                    return (
                      <div key={lead.lead_id} className="card-hover" style={{
                        display: "flex", alignItems: "center", gap: 12,
                        padding: "10px 12px", border: "1px solid #f1f5f9", background: "#f8fafc",
                      }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: 0, background: "#dcfce7",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          flexShrink: 0, fontWeight: 900, fontSize: 10.5, color: "#16a34a",
                          border: "1px solid #e2e8f0",
                        }}>
                          {initials(lead.company)}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 12.5, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{lead.company}</div>
                          <div style={{ fontSize: 11, color: "#94a3b8" }}>{lead.trade || "—"}</div>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div style={{ fontSize: 10.5, fontWeight: 800, color: statusColor }}>{statusText}</div>
                          <div style={{ fontSize: 10.5, color: "#94a3b8" }} title={lastDate ? formatDateTime(lastDate) : undefined}>{timeAgo(lastDate)}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {warmLeads.length > 0 && (
                <div style={{ padding: "10px 18px", borderTop: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#64748b" }}>{warmCount} warm total</span>
                  <Link href="/dashboard/warm" style={{ fontSize: 12, fontWeight: 700, color: "#dc2626" }}>View all →</Link>
                </div>
              )}
            </div>

            {/* Quick links */}
            <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 0, padding: "14px 18px" }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "#64748b", marginBottom: 12 }}>Quick Actions</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <SheetSyncButton />
                {[
                  { href: "/dashboard/import", label: "Import leads from CSV" },
                  { href: "/dashboard/warm", label: "View all warm leads" },
                  { href: "/dashboard/new", label: "Add a single lead" },
                ].map(({ href, label }) => (
                  <Link key={href} href={href} className="btn-lift" style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "9px 12px", background: "#f8fafc", borderRadius: 0,
                    fontSize: 12.5, fontWeight: 600, color: "#0f172a", textDecoration: "none",
                    border: "1px solid #e2e8f0",
                  }}>
                    {label} <span style={{ color: "#94a3b8" }}>→</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
