import { createSupabaseClient, fetchAllRows } from "@/lib/supabase";
import { Lead, EmailEvent, EngagementSummary, Campaign, EmailCheck } from "@/lib/types";
import Topbar from "@/components/Topbar";
import ActivateCampaignButton from "@/components/ActivateCampaignButton";
import CampaignPreviewButton from "@/components/CampaignPreviewButton";
import SendButton from "@/components/SendButton";
import { SegmentSection } from "@/components/LeadTable";
import { nextStepFor } from "@/lib/leads";
import { notFound } from "next/navigation";
import { AlertTriangle, CheckCircle } from "lucide-react";

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

  const [{ data: leads }, { data: events }, { data: checks }] = await Promise.all([
    memberIds.length ? sb.from("leads").select("*").in("lead_id", memberIds) : Promise.resolve({ data: [] as Lead[] }),
    sb.from("email_events").select("*"),
    memberIds.length ? sb.from("email_checks").select("*").in("lead_id", memberIds).order("created_at", { ascending: false }) : Promise.resolve({ data: [] as EmailCheck[] }),
  ]);

  const members = (leads || []) as Lead[];
  const memberIdSet = new Set(memberIds);
  const leadById = new Map(members.map((l) => [l.lead_id, l]));

  // --- AI check health for this campaign only ---
  const allChecks = (checks || []) as EmailCheck[];
  const heldForReview = allChecks.filter((c) => c.verdict === "rejected").slice(0, 30);
  const lastCheckAt = allChecks[0]?.created_at || null;
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const checksToday = allChecks.filter((c) => new Date(c.created_at) >= startOfToday);
  const heldToday = checksToday.filter((c) => c.verdict === "rejected").length;
  const approvedToday = checksToday.filter((c) => c.verdict === "approved").length;
  const hoursSinceLastCheck = lastCheckAt ? (Date.now() - new Date(lastCheckAt).getTime()) / 3_600_000 : null;
  const gateStale = hoursSinceLastCheck !== null && hoursSinceLastCheck > 36;
  const lastCheckLabel = lastCheckAt
    ? hoursSinceLastCheck! < 1 ? "just now"
      : hoursSinceLastCheck! < 24 ? `${Math.round(hoursSinceLastCheck!)}h ago`
      : `${Math.round(hoursSinceLastCheck! / 24)}d ago`
    : campaign.status === "draft" ? "not activated yet" : "never — nothing has run through the AI check yet";

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

  // Only leads actually activated onto this campaign (leads.campaign_id set),
  // not just staged in campaign_leads — lets a campaign be activated in
  // batches (e.g. a small test batch first) without the button firing for
  // leads that aren't live yet.
  const activeMembers = members.filter((l) => l.campaign_id === campaign.id);
  const dueMemberIds = activeMembers.filter((l) => nextStepFor(l) !== null).map((l) => l.lead_id);

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
          {activeMembers.length > 0 && (
            <SendButton due={dueMemberIds.length} leadIds={dueMemberIds} label={`Send due emails (${dueMemberIds.length})`} />
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

        {campaign.status !== "draft" && (
          <div style={{
            background: gateStale ? "#fffbeb" : "#f0fdf4", border: `1px solid ${gateStale ? "#fde68a" : "#bbf7d0"}`,
            padding: "12px 18px", display: "flex", alignItems: "center", gap: 12,
          }}>
            {gateStale
              ? <AlertTriangle style={{ width: 16, height: 16, color: "#b45309", flexShrink: 0 }} />
              : <CheckCircle style={{ width: 16, height: 16, color: "#16a34a", flexShrink: 0 }} />}
            <div style={{ fontSize: 12, color: gateStale ? "#92400e" : "#166534" }}>
              <strong>{gateStale ? "AI check hasn't run in a while" : "AI Quality Gate"}</strong> — last check: {lastCheckLabel} · today: {approvedToday} sent, {heldToday} held
            </div>
          </div>
        )}

        {heldForReview.length > 0 && (
          <div style={{ background: "#fff1f2", border: "1px solid #fecdd3", padding: "16px 18px" }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "#be123c", marginBottom: 4 }}>
              Held For Review ({heldForReview.length})
            </div>
            <p style={{ fontSize: 12.5, color: L.muted, marginBottom: 14 }}>
              These emails failed the AI quality check and were never sent. They&apos;ll be regenerated and re-checked next time each lead is due.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {heldForReview.map((check) => {
                const lead = leadById.get(check.lead_id);
                return (
                  <div key={check.id} style={{ padding: "10px 14px", background: "#fff", border: "1px solid #fecdd3" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: L.text }}>
                        {lead?.company || check.lead_id} <span style={{ fontWeight: 500, color: L.dimmed }}>· {check.step}</span>
                      </div>
                      <span style={{ fontSize: 10.5, color: L.dimmed }}>{new Date(check.created_at).toLocaleString()}</span>
                    </div>
                    <div style={{ fontSize: 12.5, color: L.text, marginTop: 4, fontStyle: "italic" }}>&quot;{check.subject}&quot;</div>
                    {check.reasoning && <div style={{ fontSize: 12, color: L.muted, marginTop: 4 }}>{check.reasoning}</div>}
                    {[...check.mechanical_fails, ...check.judgment_flags].length > 0 && (
                      <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 11.5, color: "#9f1239" }}>
                        {[...check.mechanical_fails, ...check.judgment_flags].map((flag, i) => <li key={i}>{flag}</li>)}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

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
