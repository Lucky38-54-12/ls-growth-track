import { createSupabaseClient, fetchAllRows } from "@/lib/supabase";
import { Lead, EmailEvent, EngagementSummary, Campaign } from "@/lib/types";
import Topbar from "@/components/Topbar";
import ActivateCampaignButton from "@/components/ActivateCampaignButton";
import CampaignPreviewButton from "@/components/CampaignPreviewButton";
import { SegmentSection } from "@/components/LeadTable";
import { notFound } from "next/navigation";

export const revalidate = 0;

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };

const STATUS_BADGE: Record<string, { bg: string; fg: string; label: string }> = {
  draft: { bg: "#f1f5f9", fg: "#475569", label: "Draft" },
  active: { bg: "#dcfce7", fg: "#166534", label: "Active" },
  paused: { bg: "#fef9c3", fg: "#854d0e", label: "Paused" },
  completed: { bg: "#e2e8f0", fg: "#64748b", label: "Completed" },
};

export default async function CampaignDetailPage({ params }: { params: { id: string } }) {
  const sb = createSupabaseClient();

  const { data: campaign } = await sb.from("campaigns").select("*").eq("id", params.id).maybeSingle<Campaign>();
  if (!campaign) notFound();

  const memberLinks = await fetchAllRows<{ lead_id: string }>((from, to) =>
    sb.from("campaign_leads").select("lead_id").eq("campaign_id", params.id).range(from, to)
  );
  const memberIds = memberLinks.map((m) => m.lead_id);

  const [{ data: leads }, { data: events }] = await Promise.all([
    memberIds.length ? sb.from("leads").select("*").in("lead_id", memberIds) : Promise.resolve({ data: [] as Lead[] }),
    sb.from("email_events").select("*"),
  ]);

  const members = (leads || []) as Lead[];
  const memberIdSet = new Set(memberIds);

  const engagement: Record<string, EngagementSummary> = {};
  for (const ev of (events || []) as EmailEvent[]) {
    if (!memberIdSet.has(ev.lead_id)) continue;
    if (!engagement[ev.lead_id]) engagement[ev.lead_id] = { opens: 0, clicks: 0, last_event_at: null };
    if (ev.event_type === "open") engagement[ev.lead_id].opens++;
    if (ev.event_type === "click") engagement[ev.lead_id].clicks++;
  }

  const sent = members.filter((l) => l.status !== "not_contacted").length;
  const replied = members.filter((l) => l.status === "replied" || l.status === "booked").length;
  const booked = members.filter((l) => l.status === "booked").length;
  const badge = STATUS_BADGE[campaign.status] || STATUS_BADGE.draft;

  return (
    <div style={{ background: "#f1f5f9", minHeight: "100vh" }}>
      <Topbar title={campaign.name} subtitle={`${members.length} lead${members.length !== 1 ? "s" : ""} in this campaign`} />

      <div style={{ padding: "20px 28px 60px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ background: L.surface, border: `1px solid ${L.border}`, padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", background: badge.bg, color: badge.fg }}>{badge.label}</span>
            {campaign.status === "draft" && (
              <span style={{ fontSize: 11.5, color: L.muted }}>Staged, not sending yet — review the list below, then activate when ready.</span>
            )}
          </div>
          {campaign.status === "draft" && (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <CampaignPreviewButton campaignId={campaign.id} leadCount={members.length} />
              <ActivateCampaignButton campaignId={campaign.id} leadCount={members.length} />
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 6 }}>
          {[
            { label: "Leads", value: members.length },
            { label: "Sent", value: sent },
            { label: "Replied", value: replied },
            { label: "Booked", value: booked },
          ].map(({ label, value }) => (
            <div key={label} style={{ flex: 1, padding: "14px 18px", background: L.surface, border: `1px solid ${L.border}` }}>
              <p style={{ fontSize: 9, fontWeight: 700, color: L.muted, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>{label}</p>
              <div style={{ fontSize: 30, fontWeight: 900, lineHeight: 1, color: L.text }}>{value}</div>
            </div>
          ))}
        </div>

        {members.length === 0 ? (
          <div style={{ background: L.surface, border: `1px solid ${L.border}`, padding: 40, textAlign: "center", color: L.dimmed, fontSize: 13 }}>
            No leads in this campaign.
          </div>
        ) : (
          <SegmentSection label="Campaign Leads" leads={members} engagement={engagement} />
        )}
      </div>
    </div>
  );
}
