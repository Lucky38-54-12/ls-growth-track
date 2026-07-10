import Link from "next/link";
import { createSupabaseClient, fetchAllRows } from "@/lib/supabase";
import { nextStepFor } from "@/lib/leads";
import { Lead, EmailEvent, EngagementSummary, Campaign } from "@/lib/types";
import Topbar from "@/components/Topbar";
import EmailPipelineBoard, { EmailColumn } from "@/components/EmailPipelineBoard";
import { Users, Clock, Mail, TrendingUp, Building2 } from "lucide-react";

export const revalidate = 0;

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };

const STATUS_BADGE: Record<string, { bg: string; fg: string; label: string }> = {
  draft: { bg: "#f1f5f9", fg: "#475569", label: "Draft — not sending" },
  active: { bg: "#dcfce7", fg: "#166534", label: "Active" },
  paused: { bg: "#fef9c3", fg: "#854d0e", label: "Paused — not sending" },
  completed: { bg: "#e2e8f0", fg: "#64748b", label: "Completed" },
};

const EMAIL_COLUMNS: EmailColumn[] = [
  { key: "not_contacted", label: "Not Started" },
  { key: "contacted", label: "Initial Sent" },
  { key: "followup_1_sent", label: "Follow-up 1" },
  { key: "followup_2_sent", label: "Follow-up 2" },
  { key: "followup_3_sent", label: "Follow-up 3" },
  { key: "sequence_complete", label: "Nurturing" },
  { key: "replied", label: "Replied" },
  { key: "booked", label: "Booked" },
  { key: "lost", label: "Lost" },
];

function statsFor(leads: Lead[], engagement: Record<string, EngagementSummary>) {
  const dueCount = leads.filter((l) => nextStepFor(l) !== null).length;
  const repliedCount = leads.filter((l) => l.status === "replied" || l.status === "booked").length;
  const totalOpens = leads.reduce((sum, l) => sum + (engagement[l.lead_id]?.opens || 0), 0);
  const contactedCount = leads.filter((l) => l.status !== "not_contacted").length;
  const replyRate = contactedCount > 0 ? Math.round((repliedCount / contactedCount) * 100) : 0;
  return { dueCount, totalOpens, replyRate };
}

export default async function EmailPipelinePage({
  searchParams,
}: {
  searchParams: { campaign?: string };
}) {
  const sb = createSupabaseClient();

  const [leads, { data: events }, campaigns] = await Promise.all([
    fetchAllRows<Lead>((from, to) => sb.from("leads").select("*").order("date_added", { ascending: false }).range(from, to)),
    sb.from("email_events").select("*"),
    fetchAllRows<Campaign>((from, to) => sb.from("campaigns").select("*").order("created_at", { ascending: false }).range(from, to)),
  ]);

  const campaignById = new Map(campaigns.map((c) => [c.id, c]));

  const engagement: Record<string, EngagementSummary> = {};
  for (const ev of (events || []) as EmailEvent[]) {
    if (!engagement[ev.lead_id]) engagement[ev.lead_id] = { opens: 0, clicks: 0, last_event_at: null };
    if (ev.event_type === "open") engagement[ev.lead_id].opens++;
    if (ev.event_type === "click") engagement[ev.lead_id].clicks++;
    if (!engagement[ev.lead_id].last_event_at) engagement[ev.lead_id].last_event_at = ev.created_at;
  }

  // Every campaign gets its own separate board — no merged "everything at
  // once" view. A lead only shows up here once it's actually in a campaign;
  // sending only ever happens once that campaign is switched to Active
  // (see lib/sendPipeline.ts), so a board full of cards here never implies
  // anything is going out that hasn't been deliberately turned on.
  const campaignLeads = leads.filter((l) => !!l.campaign_id);
  const campaignsWithMembers = campaigns
    .map((c) => ({ campaign: c, members: campaignLeads.filter((l) => l.campaign_id === c.id) }))
    .filter((c) => c.members.length > 0);

  // Leads sitting outside any campaign never enter the send pipeline at all
  // (sendNextStepFor bails out immediately with no campaign_id) — shown
  // separately, read-only, so it's obvious nothing here is being emailed.
  const unassignedLeads = leads.filter((l) => l.source === "email_outreach" && !l.campaign_id);

  const activeCampaignId = searchParams?.campaign || "";
  const activeCampaign = activeCampaignId ? campaignById.get(activeCampaignId) : null;
  const activeMembers = activeCampaignId ? campaignLeads.filter((l) => l.campaign_id === activeCampaignId) : [];

  const overallStats = statsFor(campaignLeads, engagement);
  const statCards = [
    { label: "Email Leads", value: String(campaignLeads.length), icon: Users },
    { label: "Due For Send", value: String(overallStats.dueCount), icon: Clock },
    { label: "Total Opens", value: String(overallStats.totalOpens), icon: Mail },
    { label: "Reply Rate", value: `${overallStats.replyRate}%`, icon: TrendingUp },
  ];

  return (
    <div style={{ background: "#f1f5f9", minHeight: "100vh" }}>
      <Topbar title="Email Pipeline" subtitle="Each campaign, kept separate — nothing sends until it's Active on Campaigns" />

      <div style={{ padding: "20px 28px 60px", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {statCards.map(({ label, value, icon: Icon }) => (
            <div key={label} className="stat-card" style={{ padding: "16px 18px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: L.muted }}>{label}</p>
                <div style={{ width: 26, height: 26, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, background: "#f1f5f9" }}>
                  <Icon style={{ width: 13, height: 13, color: L.dimmed }} />
                </div>
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: L.text, lineHeight: 1, letterSpacing: "-0.01em" }}>{value}</div>
            </div>
          ))}
        </div>

        {campaignsWithMembers.length === 0 && unassignedLeads.length === 0 ? (
          <div className="surface-card" style={{ padding: 32, textAlign: "center", color: L.dimmed, fontSize: 13 }}>
            No campaign leads yet — activate a campaign from{" "}
            <Link href="/dashboard/campaigns" style={{ color: "var(--red)", fontWeight: 700 }}>Campaigns</Link> to see leads here.
          </div>
        ) : activeCampaignId && activeCampaign ? (
          // A single campaign selected — full-width board, plus a way back out.
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Link href="/dashboard/email-pipeline" className="btn-lift" style={{
                padding: "7px 12px", background: L.surface, color: L.muted, border: `1px solid ${L.border}`,
                fontSize: 11.5, fontWeight: 700, textDecoration: "none",
              }}>
                ← All campaigns
              </Link>
              <span style={{ fontSize: 14, fontWeight: 800, color: L.text }}>{activeCampaign.name}</span>
              <span style={{
                fontSize: 10.5, fontWeight: 700, padding: "3px 9px",
                background: (STATUS_BADGE[activeCampaign.status] || STATUS_BADGE.draft).bg,
                color: (STATUS_BADGE[activeCampaign.status] || STATUS_BADGE.draft).fg,
              }}>
                {(STATUS_BADGE[activeCampaign.status] || STATUS_BADGE.draft).label}
              </span>
            </div>
            {activeMembers.length === 0 ? (
              <div className="surface-card" style={{ padding: 32, textAlign: "center", color: L.dimmed, fontSize: 13 }}>No leads in this campaign.</div>
            ) : (
              <EmailPipelineBoard leads={activeMembers} columns={EMAIL_COLUMNS} engagement={engagement} campaignById={campaignById} />
            )}
          </div>
        ) : (
          // No campaign selected — every campaign gets its own stacked,
          // clearly-labeled section instead of one merged pool of cards.
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {campaignsWithMembers.map(({ campaign, members }) => {
              const badge = STATUS_BADGE[campaign.status] || STATUS_BADGE.draft;
              return (
                <div key={campaign.id} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Link href={`/dashboard/email-pipeline?campaign=${encodeURIComponent(campaign.id)}`} style={{
                      fontSize: 14, fontWeight: 800, color: L.text, textDecoration: "none",
                    }}>
                      {campaign.name}
                    </Link>
                    <span style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 9px", background: badge.bg, color: badge.fg }}>{badge.label}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: L.dimmed }}>{members.length} lead{members.length !== 1 ? "s" : ""}</span>
                  </div>
                  <EmailPipelineBoard leads={members} columns={EMAIL_COLUMNS} engagement={engagement} campaignById={campaignById} />
                </div>
              );
            })}

            {unassignedLeads.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: L.text }}>Not in a campaign yet</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: L.dimmed }}>{unassignedLeads.length} lead{unassignedLeads.length !== 1 ? "s" : ""} · not being emailed</span>
                </div>
                <div className="surface-card" style={{ padding: "8px 4px" }}>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {unassignedLeads.map((lead) => (
                      <Link key={lead.lead_id} href={`/dashboard/leads/${lead.lead_id}`} className="row-hover" style={{
                        display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", textDecoration: "none", borderBottom: `1px solid ${L.border}`,
                      }}>
                        <Building2 style={{ width: 13, height: 13, color: L.dimmed, flexShrink: 0 }} />
                        <span style={{ fontSize: 13, fontWeight: 700, color: L.text }}>{lead.company}</span>
                        <span style={{ fontSize: 11.5, color: L.dimmed }}>{lead.trade}{lead.location ? ` · ${lead.location}` : ""}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
