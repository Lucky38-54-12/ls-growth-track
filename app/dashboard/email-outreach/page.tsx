import Link from "next/link";
import { createSupabaseClient, fetchAllRows } from "@/lib/supabase";
import { Lead, Campaign, EmailSend, EmailEvent, EmailCheck, EngagementSummary } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
import { stillHeld, nextStepFor } from "@/lib/leads";
import { stripTrackingForDisplay } from "@/lib/templates";
import Topbar from "@/components/Topbar";
import SectionTabs from "@/components/SectionTabs";
import EmailPipelineBoard, { EmailColumn } from "@/components/EmailPipelineBoard";
import ActivateCampaignButton from "@/components/ActivateCampaignButton";
import CampaignPreviewButton from "@/components/CampaignPreviewButton";
import MailboxView from "@/components/MailboxView";
import { Users, Clock, Mail, TrendingUp, Building2, ChevronRight } from "lucide-react";

export const revalidate = 0;

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };

const STATUS_BADGE: Record<string, { bg: string; fg: string; label: string }> = {
  draft: { bg: "#f1f5f9", fg: "#475569", label: "Draft" },
  active: { bg: "#dcfce7", fg: "#166534", label: "Active" },
  paused: { bg: "#fef9c3", fg: "#854d0e", label: "Paused" },
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

// /api/click stores the real destination on every click event (see
// app/api/click/route.ts), so which specific link someone clicked has
// always been recoverable — it just never surfaced anywhere. Distinguishing
// "clicked to read case studies" from "clicked to book a time" is a real
// intent signal worth showing separately, not collapsing into one generic
// "clicked" count.
function labelForUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.pathname.replace(/\/$/, "").endsWith("/book")) return "Book a time";
    if (u.hostname.replace(/^www\./, "") === "lsgrowth.agency" && (u.pathname === "/" || u.pathname === "")) return "Case studies (lsgrowth.agency)";
    return url.length > 60 ? url.slice(0, 57) + "…" : url;
  } catch {
    return url;
  }
}

interface SendRow extends EmailSend {
  company: string;
  contact_name: string;
  campaign_name: string;
}

interface StatCardProps {
  label: string;
  value: string | number;
}

function StatCard({ label, value }: StatCardProps) {
  return (
    <div style={{ background: L.surface, border: `1px solid ${L.border}`, padding: "14px 16px" }}>
      <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: L.muted, marginBottom: 6 }}>{label}</p>
      <p style={{ fontSize: 24, fontWeight: 800, color: L.text }}>{value}</p>
    </div>
  );
}

export default async function EmailOutreachPage({
  searchParams,
}: {
  searchParams: { campaign?: string; tab?: string };
}) {
  const sb = createSupabaseClient();

  const [campaigns, campaignLeads, allLeads, { data: allChecks }, { data: allSends }, { data: allEvents }] = await Promise.all([
    fetchAllRows<Campaign>((from, to) => sb.from("campaigns").select("*").order("created_at", { ascending: false }).range(from, to)),
    fetchAllRows<{ campaign_id: string; lead_id: string }>((from, to) => sb.from("campaign_leads").select("campaign_id, lead_id").range(from, to)),
    fetchAllRows<Lead>((from, to) => sb.from("leads").select("*").order("date_added", { ascending: false }).range(from, to)),
    sb.from("email_checks").select("*"),
    sb.from("email_sends").select("*").order("sent_at", { ascending: false }),
    sb.from("email_events").select("*"),
  ]);

  const campaignById = new Map(campaigns.map((c) => [c.id, c]));
  const leadById = new Map(allLeads.map((l) => [l.lead_id, l]));
  const campaignNameByLead = new Map(campaignLeads.map((cl) => [cl.lead_id, campaignById.get(cl.campaign_id)?.name || ""]));

  // Campaign leads = anything staged/activated into a campaign. Personal
  // sends (cold-call source) never carry a campaign_id, so the two email
  // populations stay cleanly separated the same way the old separate pages
  // kept them separated.
  const campaignLeadRecords = allLeads.filter((l) => !!l.campaign_id);
  const campaignLeadIds = new Set(campaignLeadRecords.map((l) => l.lead_id));

  const engagement: Record<string, EngagementSummary> = {};
  const clicksByUrl = new Map<string, { clicks: number; leadIds: Set<string> }>();
  for (const ev of (allEvents || []) as EmailEvent[]) {
    if (!engagement[ev.lead_id]) engagement[ev.lead_id] = { opens: 0, clicks: 0, last_event_at: null };
    if (ev.event_type === "open") engagement[ev.lead_id].opens++;
    if (ev.event_type === "click") {
      engagement[ev.lead_id].clicks++;
      const url = ev.url || "(unknown link)";
      if (!clicksByUrl.has(url)) clicksByUrl.set(url, { clicks: 0, leadIds: new Set() });
      const entry = clicksByUrl.get(url)!;
      entry.clicks++;
      entry.leadIds.add(ev.lead_id);
    }
    if (!engagement[ev.lead_id].last_event_at || ev.created_at > engagement[ev.lead_id].last_event_at!) {
      engagement[ev.lead_id].last_event_at = ev.created_at;
    }
  }
  const linkPerformance = Array.from(clicksByUrl.entries())
    .map(([url, { clicks, leadIds }]) => ({ url, label: labelForUrl(url), clicks, uniqueClickers: leadIds.size }))
    .sort((a, b) => b.clicks - a.clicks);

  const campaignSendRows: SendRow[] = ((allSends || []) as EmailSend[])
    .filter((s) => campaignLeadIds.has(s.lead_id))
    .map((s) => {
      const lead = leadById.get(s.lead_id);
      return {
        ...s,
        company: lead?.company || "(deleted lead)",
        contact_name: lead?.contact_name || "",
        campaign_name: campaignNameByLead.get(s.lead_id) || "",
      };
    });

  const checks = (allChecks || []) as EmailCheck[];
  const campaignChecks = checks.filter((c) => campaignLeadIds.has(c.lead_id));
  const heldChecks = stillHeld(campaignChecks.filter((c) => c.verdict === "rejected"), campaignSendRows);

  const totalSent = campaignSendRows.length;
  const totalOpened = campaignSendRows.filter((r) => (engagement[r.lead_id]?.opens || 0) > 0).length;
  const totalClicked = campaignSendRows.filter((r) => (engagement[r.lead_id]?.clicks || 0) > 0).length;
  const totalReplied = campaignLeadRecords.filter((l) => l.status === "replied" || l.status === "booked").length;
  const totalBooked = campaignLeadRecords.filter((l) => l.status === "booked").length;
  const totalUnsubscribed = campaignLeadRecords.filter((l) => !!l.unsubscribed_at).length;
  const openRate = totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : 0;

  const perCampaign = campaigns.map((c) => {
    const memberIds = campaignLeads.filter((cl) => cl.campaign_id === c.id).map((cl) => cl.lead_id);
    const members = memberIds.map((id) => leadById.get(id)).filter((l): l is Lead => !!l);
    const memberSends = campaignSendRows.filter((r) => memberIds.includes(r.lead_id));
    const opened = memberSends.filter((r) => (engagement[r.lead_id]?.opens || 0) > 0).length;
    const clicked = memberSends.filter((r) => (engagement[r.lead_id]?.clicks || 0) > 0).length;
    const replied = members.filter((l) => l.status === "replied" || l.status === "booked").length;
    const booked = members.filter((l) => l.status === "booked").length;
    const unsubscribed = members.filter((l) => !!l.unsubscribed_at).length;
    const held = heldChecks.filter((c) => memberIds.includes(c.lead_id)).length;
    return { campaign: c, leadCount: memberIds.length, sent: memberSends.length, opened, clicked, replied, booked, unsubscribed, held };
  });

  // --- Personal / cold-call sends (never mixed with campaign sends) ---
  const personalSendRows = ((allSends || []) as EmailSend[])
    .filter((s) => leadById.get(s.lead_id)?.source === "cold_call")
    .map((s) => {
      const lead = leadById.get(s.lead_id);
      return { ...s, company: lead?.company || "(deleted lead)", contact_name: lead?.contact_name || "", status: lead?.status || "" };
    });
  const personalSent = personalSendRows.length;
  const personalOpened = personalSendRows.filter((r) => (engagement[r.lead_id]?.opens || 0) > 0).length;
  const personalClicked = personalSendRows.filter((r) => (engagement[r.lead_id]?.clicks || 0) > 0).length;
  const personalOpenRate = personalSent > 0 ? Math.round((personalOpened / personalSent) * 100) : 0;

  // --- Pipeline board data ---
  const campaignsWithMembers = campaigns
    .map((c) => ({ campaign: c, members: campaignLeadRecords.filter((l) => l.campaign_id === c.id) }))
    .filter((c) => c.members.length > 0);
  const unassignedLeads = allLeads.filter((l) => l.source === "email_outreach" && !l.campaign_id);
  const activeCampaignId = searchParams?.campaign || "";
  const activeCampaign = activeCampaignId ? campaignById.get(activeCampaignId) : null;
  const activeMembers = activeCampaignId ? campaignLeadRecords.filter((l) => l.campaign_id === activeCampaignId) : [];
  const dueCount = campaignLeadRecords.filter((l) => nextStepFor(l) !== null).length;

  // --- Sent sequences grouped by lead ---
  const byLead = new Map<string, SendRow[]>();
  for (const row of campaignSendRows) {
    if (!byLead.has(row.lead_id)) byLead.set(row.lead_id, []);
    byLead.get(row.lead_id)!.push(row);
  }
  const sequenceGroups = Array.from(byLead.entries())
    .map(([leadId, leadRows]) => ({
      leadId,
      leadRows: [...leadRows].sort((a, b) => a.sent_at.localeCompare(b.sent_at)),
      latest: leadRows[0].sent_at,
    }))
    .sort((a, b) => b.latest.localeCompare(a.latest));

  const defaultTab = activeCampaignId ? "pipeline" : (searchParams?.tab || "overview");

  const overviewTab = (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: L.muted, marginBottom: 10 }}>Campaign Emails</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
          <StatCard label="Sent" value={totalSent} />
          <StatCard label="Opened" value={`${totalOpened} (${openRate}%)`} />
          <StatCard label="Clicked" value={totalClicked} />
          <StatCard label="Replied" value={totalReplied} />
          <StatCard label="Booked" value={totalBooked} />
          <StatCard label="Due For Send" value={dueCount} />
          <StatCard label="Held For Review" value={heldChecks.length} />
        </div>
      </div>

      <div>
        <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: L.muted, marginBottom: 10 }}>Personal / Cold-Call Emails</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
          <StatCard label="Sent" value={personalSent} />
          <StatCard label="Opened" value={`${personalOpened} (${personalOpenRate}%)`} />
          <StatCard label="Clicked" value={personalClicked} />
        </div>
      </div>

      <div style={{ background: L.surface, border: `1px solid ${L.border}` }}>
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${L.border}`, fontSize: 11, fontWeight: 700, color: L.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Campaigns
        </div>
        {perCampaign.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: L.dimmed, fontSize: 13 }}>No campaigns yet.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: 700, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  {["Campaign", "Status", "Leads", "Sent", "Opened", "Clicked", "Replied", "Booked", ""].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "9px 14px", fontSize: 10, fontWeight: 700, color: L.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {perCampaign.map(({ campaign, leadCount, sent, opened, clicked, replied, booked }, i) => {
                  const badge = STATUS_BADGE[campaign.status] || STATUS_BADGE.draft;
                  return (
                    <tr key={campaign.id} style={{ borderBottom: i === perCampaign.length - 1 ? "none" : `1px solid ${L.border}` }} className="row-hover">
                      <td style={{ padding: "10px 14px" }}>
                        <Link href={`/dashboard/campaigns/${campaign.id}`} style={{ fontSize: 13, fontWeight: 700, color: L.text, textDecoration: "none" }}>{campaign.name}</Link>
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", background: badge.bg, color: badge.fg }}>{badge.label}</span>
                      </td>
                      <td style={{ padding: "10px 14px", fontSize: 12.5, color: L.text }}>{leadCount}</td>
                      <td style={{ padding: "10px 14px", fontSize: 12.5, color: L.text }}>{sent}</td>
                      <td style={{ padding: "10px 14px", fontSize: 12.5, color: L.text }}>{opened}</td>
                      <td style={{ padding: "10px 14px", fontSize: 12.5, color: L.text }}>{clicked}</td>
                      <td style={{ padding: "10px 14px", fontSize: 12.5, color: L.text }}>{replied}</td>
                      <td style={{ padding: "10px 14px", fontSize: 12.5, color: L.text }}>{booked}</td>
                      <td style={{ padding: "10px 14px", textAlign: "right" }}>
                        <Link href={`/dashboard/campaigns/${campaign.id}`} style={{ color: L.dimmed, display: "inline-flex" }}><ChevronRight style={{ width: 14, height: 14 }} /></Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );

  const pipelineTab = (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
        {[
          { label: "Email Leads", value: String(campaignLeadRecords.length), icon: Users },
          { label: "Due For Send", value: String(dueCount), icon: Clock },
          { label: "Total Opens", value: String(campaignLeadRecords.reduce((sum, l) => sum + (engagement[l.lead_id]?.opens || 0), 0)), icon: Mail },
          { label: "Reply Rate", value: `${campaignLeadRecords.filter(l => l.status !== "not_contacted").length > 0 ? Math.round((totalReplied / campaignLeadRecords.filter(l => l.status !== "not_contacted").length) * 100) : 0}%`, icon: TrendingUp },
        ].map(({ label, value, icon: Icon }) => (
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

      <div style={{ background: L.surface, border: `1px solid ${L.border}`, padding: "14px 18px", display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: L.muted }}>Personal Sends</span>
        <span style={{ fontSize: 13, color: L.text }}><b style={{ fontWeight: 800 }}>{personalSent}</b> sent</span>
        <span style={{ fontSize: 13, color: L.text }}><b style={{ fontWeight: 800 }}>{personalOpened}</b> opened ({personalOpenRate}%)</span>
        <span style={{ fontSize: 13, color: L.text }}><b style={{ fontWeight: 800 }}>{personalClicked}</b> clicked</span>
      </div>

      {campaignsWithMembers.length === 0 && unassignedLeads.length === 0 ? (
        <div className="surface-card" style={{ padding: 32, textAlign: "center", color: L.dimmed, fontSize: 13 }}>
          No campaign leads yet — activate a campaign from the Campaigns tab to see leads here.
        </div>
      ) : activeCampaignId && activeCampaign ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Link href="/dashboard/email-outreach?tab=pipeline" className="btn-lift" style={{
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
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {campaignsWithMembers.map(({ campaign, members }) => {
            const badge = STATUS_BADGE[campaign.status] || STATUS_BADGE.draft;
            return (
              <div key={campaign.id} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Link href={`/dashboard/email-outreach?campaign=${encodeURIComponent(campaign.id)}`} style={{ fontSize: 14, fontWeight: 800, color: L.text, textDecoration: "none" }}>
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
  );

  const campaignsTab = (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {campaigns.length === 0 ? (
        <div style={{ background: L.surface, border: `1px solid ${L.border}`, padding: 40, textAlign: "center", color: L.dimmed, fontSize: 13 }}>
          No campaigns yet — select leads on the Contacts page and hit &quot;Start Campaign&quot;.
        </div>
      ) : (
        <div style={{ background: L.surface, border: `1px solid ${L.border}`, overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 600, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: `1px solid ${L.border}` }}>
                {["Campaign", "Status", "Leads", "Sent", "Replied", "Booked", ""].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "9px 14px", fontSize: 10, fontWeight: 700, color: L.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {perCampaign.map(({ campaign, leadCount, sent, replied, booked }, i) => {
                const badge = STATUS_BADGE[campaign.status] || STATUS_BADGE.draft;
                return (
                  <tr key={campaign.id} style={{ borderBottom: i === perCampaign.length - 1 ? "none" : `1px solid ${L.border}` }} className="row-hover">
                    <td style={{ padding: "10px 14px" }}>
                      <Link href={`/dashboard/campaigns/${campaign.id}`} style={{ fontSize: 13, fontWeight: 700, color: L.text, textDecoration: "none" }}>{campaign.name}</Link>
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", background: badge.bg, color: badge.fg }}>{badge.label}</span>
                    </td>
                    <td style={{ padding: "10px 14px", fontSize: 12.5, color: L.text }}>{leadCount}</td>
                    <td style={{ padding: "10px 14px", fontSize: 12.5, color: L.text }}>{sent}</td>
                    <td style={{ padding: "10px 14px", fontSize: 12.5, color: L.text }}>{replied}</td>
                    <td style={{ padding: "10px 14px", fontSize: 12.5, color: L.text }}>{booked}</td>
                    <td style={{ padding: "10px 14px", textAlign: "right", display: "flex", gap: 8, justifyContent: "flex-end" }}>
                      {campaign.status === "draft" && (
                        <>
                          <CampaignPreviewButton campaignId={campaign.id} leadCount={leadCount} />
                          <ActivateCampaignButton campaignId={campaign.id} leadCount={leadCount} />
                        </>
                      )}
                      <Link href={`/dashboard/campaigns/${campaign.id}`} style={{ color: L.dimmed, display: "inline-flex", alignSelf: "center" }}><ChevronRight style={{ width: 14, height: 14 }} /></Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  const activityTab = (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ background: L.surface, border: `1px solid ${L.border}` }}>
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${L.border}`, fontSize: 11, fontWeight: 700, color: L.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Link Performance — which link people actually click
        </div>
        {linkPerformance.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: L.dimmed, fontSize: 13 }}>No clicks recorded yet.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: 400, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  {["Link", "Unique Clickers", "Total Clicks"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "9px 14px", fontSize: 10, fontWeight: 700, color: L.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {linkPerformance.map(({ url, label, clicks, uniqueClickers }, i) => (
                  <tr key={url} style={{ borderBottom: i === linkPerformance.length - 1 ? "none" : `1px solid ${L.border}` }} className="row-hover">
                    <td style={{ padding: "10px 14px", fontSize: 12.5, color: L.text, fontWeight: 600 }} title={url}>{label}</td>
                    <td style={{ padding: "10px 14px", fontSize: 12.5, color: L.text }}>{uniqueClickers}</td>
                    <td style={{ padding: "10px 14px", fontSize: 12.5, color: L.text }}>{clicks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ background: L.surface, border: `1px solid ${L.border}`, padding: 24 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: L.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>Sent Sequences — click a lead to see every email sent to them</p>
        {sequenceGroups.length === 0 ? (
          <p style={{ color: L.muted, fontSize: 13 }}>No campaign emails sent yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {sequenceGroups.map(({ leadId, leadRows }) => {
              const lead = leadById.get(leadId);
              const ev = engagement[leadId];
              return (
                <details key={leadId} style={{ border: `1px solid ${L.border}` }}>
                  <summary style={{ padding: "12px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", background: "#f8fafc" }}>
                    <span style={{ fontWeight: 700, fontSize: 13.5, color: L.text }}>{leadRows[0].company}</span>
                    <span style={{ fontSize: 12, color: L.muted }}>{leadRows[0].campaign_name}</span>
                    <span style={{ fontSize: 11.5, color: L.dimmed }}>{leadRows.length} email{leadRows.length !== 1 ? "s" : ""} sent</span>
                    <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {ev?.opens > 0 && <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", background: "#dbeafe", color: "#1e40af" }}>{ev.opens} open{ev.opens !== 1 ? "s" : ""}</span>}
                      {ev?.clicks > 0 && <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", background: "#fce7f3", color: "#9d174d" }}>{ev.clicks} click{ev.clicks !== 1 ? "s" : ""}</span>}
                      {(lead?.status === "replied" || lead?.status === "booked") && <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", background: "#dcfce7", color: "#15803d" }}>{lead.status === "booked" ? "Booked" : "Replied"}</span>}
                    </div>
                    <Link href={`/dashboard/leads/${leadId}`} style={{ fontSize: 11, color: "var(--red)", flexShrink: 0 }}>Open lead →</Link>
                  </summary>
                  <div style={{ borderTop: `1px solid ${L.border}` }}>
                    {leadRows.map((send) => (
                      <details key={send.id} style={{ borderBottom: `1px solid ${L.border}` }}>
                        <summary style={{ padding: "10px 14px", cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", background: "#f1f5f9", color: L.muted, textTransform: "uppercase", letterSpacing: "0.04em" }}>{send.step}</span>
                          <span style={{ fontWeight: 600, color: L.text }}>{send.subject}</span>
                          <span style={{ marginLeft: "auto", fontSize: 11.5, color: L.dimmed, whiteSpace: "nowrap" }}>{formatDateTime(send.sent_at)}</span>
                        </summary>
                        <div
                          style={{ padding: "14px 18px", borderTop: `1px solid ${L.border}`, background: "#fafafa", fontFamily: "Arial,Helvetica,sans-serif", fontSize: 14, color: L.text, lineHeight: 1.5 }}
                          dangerouslySetInnerHTML={{ __html: stripTrackingForDisplay(send.body_html) }}
                        />
                      </details>
                    ))}
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  const personalTab = (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
        <StatCard label="Emails Sent" value={personalSent} />
        <StatCard label="Opened" value={`${personalOpened} (${personalOpenRate}%)`} />
        <StatCard label="Clicked" value={personalClicked} />
      </div>

      <div style={{ background: L.surface, border: `1px solid ${L.border}`, padding: 24, overflowX: "auto" }}>
        {personalSendRows.length === 0 ? (
          <p style={{ color: L.muted, fontSize: 13 }}>No emails sent yet.</p>
        ) : (
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 680 }}>
            <thead>
              <tr>
                {["Sent", "Company", "Contact", "Subject", "Activity", "Last Activity"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "10px 12px", borderBottom: `1px solid ${L.border}`, color: L.muted, fontWeight: 700, fontSize: 11, letterSpacing: "0.05em", textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {personalSendRows.map((row) => {
                const ev = engagement[row.lead_id];
                return (
                  <tr key={row.id}>
                    <td style={{ padding: "10px 12px", borderBottom: `1px solid ${L.border}`, fontSize: 12.5, color: L.muted, whiteSpace: "nowrap" }}>{formatDateTime(row.sent_at)}</td>
                    <td style={{ padding: "10px 12px", borderBottom: `1px solid ${L.border}`, fontWeight: 700, fontSize: 13.5 }}>
                      <Link href={`/dashboard/leads/${row.lead_id}`} style={{ color: "var(--red)" }}>{row.company}</Link>
                    </td>
                    <td style={{ padding: "10px 12px", borderBottom: `1px solid ${L.border}`, fontSize: 13, color: L.muted }}>{row.contact_name}</td>
                    <td style={{ padding: "10px 12px", borderBottom: `1px solid ${L.border}`, fontSize: 13.5 }}>{row.subject}</td>
                    <td style={{ padding: "10px 12px", borderBottom: `1px solid ${L.border}`, fontSize: 13 }}>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {!ev?.opens && !ev?.clicks && row.status !== "replied" && row.status !== "booked" && <span style={{ fontSize: 11, color: L.dimmed }}>No activity</span>}
                        {ev?.opens > 0 && <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", background: "#dbeafe", color: "#1e40af" }}>{ev.opens} open{ev.opens !== 1 ? "s" : ""}</span>}
                        {ev?.clicks > 0 && <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", background: "#fce7f3", color: "#9d174d" }}>{ev.clicks} click{ev.clicks !== 1 ? "s" : ""}</span>}
                        {(row.status === "replied" || row.status === "booked") && <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", background: "#dcfce7", color: "#15803d" }}>{row.status === "booked" ? "Booked" : "Replied"}</span>}
                      </div>
                    </td>
                    <td style={{ padding: "10px 12px", borderBottom: `1px solid ${L.border}`, fontSize: 12.5, color: L.muted, whiteSpace: "nowrap" }}>{ev?.last_event_at ? formatDateTime(ev.last_event_at) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );

  const inboxTab = (
    <MailboxView account="zoho" title="Outreach Inbox" subtitle="Outreach (lucky@lsgrowth.agency)" embedded />
  );

  return (
    <div style={{ background: "#f1f5f9", minHeight: "100vh" }}>
      <Topbar title="Email Outreach" subtitle="Campaigns, pipeline, activity, and personal sends — all in one place" />

      <div style={{ padding: "20px 28px 60px" }}>
        <SectionTabs
          defaultTab={defaultTab}
          tabs={[
            { id: "overview", label: "Overview", content: overviewTab },
            { id: "pipeline", label: "Pipeline", badge: dueCount, content: pipelineTab },
            { id: "campaigns", label: "Campaigns", content: campaignsTab },
            { id: "activity", label: "Activity", content: activityTab },
            { id: "personal", label: "Personal Sends", content: personalTab },
            { id: "inbox", label: "Inbox", content: inboxTab },
          ]}
        />
      </div>
    </div>
  );
}
