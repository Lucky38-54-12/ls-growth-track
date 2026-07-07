import Link from "next/link";
import { createSupabaseClient, fetchAllRows } from "@/lib/supabase";
import { nextStepFor } from "@/lib/leads";
import { Lead, EmailEvent, EngagementSummary, Campaign } from "@/lib/types";
import Topbar from "@/components/Topbar";
import EmailPipelineBoard, { EmailColumn } from "@/components/EmailPipelineBoard";
import { Users, Clock, Mail, TrendingUp } from "lucide-react";

export const revalidate = 0;

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };

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

  // This board is the email/campaign counterpart to the cold-call Pipeline
  // (/dashboard) — that board is cold-call only (see its own comment), so
  // campaign leads (the ones sendNextStepFor in lib/sendPipeline.ts actually
  // sends to) never had a Kanban view of their own until now.
  const emailLeads = leads.filter((l) => !!l.campaign_id);
  const campaignById = new Map(campaigns.map((c) => [c.id, c]));

  const engagement: Record<string, EngagementSummary> = {};
  for (const ev of (events || []) as EmailEvent[]) {
    if (!engagement[ev.lead_id]) engagement[ev.lead_id] = { opens: 0, clicks: 0, last_event_at: null };
    if (ev.event_type === "open") engagement[ev.lead_id].opens++;
    if (ev.event_type === "click") engagement[ev.lead_id].clicks++;
    if (!engagement[ev.lead_id].last_event_at) engagement[ev.lead_id].last_event_at = ev.created_at;
  }

  const activeCampaign = searchParams?.campaign || "";
  const visibleLeads = activeCampaign ? emailLeads.filter((l) => l.campaign_id === activeCampaign) : emailLeads;

  const campaignPills = campaigns
    .map((c) => ({ id: c.id, name: c.name, count: emailLeads.filter((l) => l.campaign_id === c.id).length }))
    .filter((c) => c.count > 0);

  const dueCount = visibleLeads.filter((l) => nextStepFor(l) !== null).length;
  const repliedCount = visibleLeads.filter((l) => l.status === "replied" || l.status === "booked").length;
  const totalOpens = visibleLeads.reduce((sum, l) => sum + (engagement[l.lead_id]?.opens || 0), 0);
  const contactedCount = visibleLeads.filter((l) => l.status !== "not_contacted").length;
  const replyRate = contactedCount > 0 ? Math.round((repliedCount / contactedCount) * 100) : 0;

  const statCards = [
    { label: "Email Leads", value: String(visibleLeads.length), icon: Users },
    { label: "Due For Send", value: String(dueCount), icon: Clock },
    { label: "Total Opens", value: String(totalOpens), icon: Mail },
    { label: "Reply Rate", value: `${replyRate}%`, icon: TrendingUp },
  ];

  return (
    <div style={{ background: "#f1f5f9", minHeight: "100vh" }}>
      <Topbar title="Email Pipeline" subtitle="Every campaign lead, staged by sequence step" />

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

        {campaignPills.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Link href="/dashboard/email-pipeline" className="btn-lift" style={{
              display: "flex", alignItems: "center", gap: 6,
              background: !activeCampaign ? "var(--blue)" : L.surface,
              color: !activeCampaign ? "#fff" : L.muted,
              border: !activeCampaign ? "none" : `1px solid ${L.border}`,
              padding: "8px 14px", fontSize: 11.5, fontWeight: 700, textDecoration: "none", flexShrink: 0,
            }}>
              All ({emailLeads.length})
            </Link>
            {campaignPills.map((c) => (
              <Link key={c.id} href={`/dashboard/email-pipeline?campaign=${encodeURIComponent(c.id)}`} className="pill-hover" style={{
                padding: "8px 14px",
                background: activeCampaign === c.id ? "var(--blue)" : L.surface,
                color: activeCampaign === c.id ? "#fff" : L.muted,
                border: activeCampaign === c.id ? "none" : `1px solid ${L.border}`,
                fontSize: 11.5, fontWeight: 600, textDecoration: "none", transition: "all 0.15s",
              }}>
                {c.name} ({c.count})
              </Link>
            ))}
          </div>
        )}

        {visibleLeads.length === 0 ? (
          <div className="surface-card" style={{ padding: 32, textAlign: "center", color: L.dimmed, fontSize: 13 }}>
            No campaign leads yet — activate a campaign from{" "}
            <Link href="/dashboard/campaigns" style={{ color: "var(--red)", fontWeight: 700 }}>Campaigns</Link> to see leads here.
          </div>
        ) : (
          <EmailPipelineBoard leads={visibleLeads} columns={EMAIL_COLUMNS} engagement={engagement} campaignById={campaignById} />
        )}
      </div>
    </div>
  );
}
