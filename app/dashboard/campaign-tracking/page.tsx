import { createSupabaseClient, fetchAllRows } from "@/lib/supabase";
import { Lead, Campaign, EmailSend, EmailEvent, EmailCheck, EngagementSummary } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
import Topbar from "@/components/Topbar";
import Link from "next/link";

export const revalidate = 0;

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };

const STATUS_BADGE: Record<string, { bg: string; fg: string; label: string }> = {
  draft: { bg: "#f1f5f9", fg: "#475569", label: "Draft" },
  active: { bg: "#dcfce7", fg: "#166534", label: "Active" },
  paused: { bg: "#fef9c3", fg: "#854d0e", label: "Paused" },
  completed: { bg: "#e2e8f0", fg: "#64748b", label: "Completed" },
};

interface SendRow extends EmailSend {
  company: string;
  contact_name: string;
  campaign_name: string;
}

// Campaign emails go out via Resend on outreach@lsgrowth.agency (see
// lib/email.ts sendBulkMail), never Lucky's personal Gmail — this page only
// ever looks at leads with a campaign_id set, so cold-call/personal-account
// sends (tracked on /dashboard/warm) never mix in here.
export default async function CampaignTrackingPage() {
  const sb = createSupabaseClient();

  const [campaigns, campaignLeads, allLeads, { data: allChecks }] = await Promise.all([
    fetchAllRows<Campaign>((from, to) => sb.from("campaigns").select("*").order("created_at", { ascending: false }).range(from, to)),
    fetchAllRows<{ campaign_id: string; lead_id: string }>((from, to) => sb.from("campaign_leads").select("campaign_id, lead_id").range(from, to)),
    fetchAllRows<Lead>((from, to) => sb.from("leads").select("*").range(from, to)),
    sb.from("email_checks").select("*"),
  ]);

  const leads = allLeads.filter((l) => !!l.campaign_id);
  const leadIds = new Set(leads.map((l) => l.lead_id));
  const leadById = new Map(leads.map((l) => [l.lead_id, l]));
  const campaignById = new Map(campaigns.map((c) => [c.id, c]));
  // A lead can only ever be truly "in" the campaign it's activated onto
  // (leads.campaign_id), but campaign_leads also carries the staged roster
  // for campaigns still in draft — use it just to resolve a display name.
  const campaignNameByLead = new Map(campaignLeads.map((cl) => [cl.lead_id, campaignById.get(cl.campaign_id)?.name || ""]));

  const [{ data: sends }, { data: events }] = await Promise.all([
    leadIds.size ? sb.from("email_sends").select("*").in("lead_id", Array.from(leadIds)).order("sent_at", { ascending: false }) : Promise.resolve({ data: [] as EmailSend[] }),
    leadIds.size ? sb.from("email_events").select("*").in("lead_id", Array.from(leadIds)) : Promise.resolve({ data: [] as EmailEvent[] }),
  ]);

  const checks = (allChecks || []).filter((c: EmailCheck) => leadIds.has(c.lead_id));
  const heldChecks = checks.filter((c) => c.verdict === "rejected");

  const engagement: Record<string, EngagementSummary> = {};
  for (const ev of (events || []) as EmailEvent[]) {
    if (!engagement[ev.lead_id]) engagement[ev.lead_id] = { opens: 0, clicks: 0, last_event_at: null };
    if (ev.event_type === "open") engagement[ev.lead_id].opens++;
    if (ev.event_type === "click") engagement[ev.lead_id].clicks++;
    if (!engagement[ev.lead_id].last_event_at || ev.created_at > engagement[ev.lead_id].last_event_at!) {
      engagement[ev.lead_id].last_event_at = ev.created_at;
    }
  }

  const rows: SendRow[] = ((sends || []) as EmailSend[]).map((s) => {
    const lead = leadById.get(s.lead_id);
    return {
      ...s,
      company: lead?.company || "(deleted lead)",
      contact_name: lead?.contact_name || "",
      campaign_name: campaignNameByLead.get(s.lead_id) || "",
    };
  });

  const totalSent = rows.length;
  const totalOpened = rows.filter((r) => (engagement[r.lead_id]?.opens || 0) > 0).length;
  const totalClicked = rows.filter((r) => (engagement[r.lead_id]?.clicks || 0) > 0).length;
  const totalReplied = leads.filter((l) => l.status === "replied" || l.status === "booked").length;
  const totalBooked = leads.filter((l) => l.status === "booked").length;
  const openRate = totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : 0;

  const perCampaign = campaigns.map((c) => {
    const memberIds = campaignLeads.filter((cl) => cl.campaign_id === c.id).map((cl) => cl.lead_id);
    const members = memberIds.map((id) => leadById.get(id)).filter((l): l is Lead => !!l);
    const memberSends = rows.filter((r) => memberIds.includes(r.lead_id));
    const opened = memberSends.filter((r) => (engagement[r.lead_id]?.opens || 0) > 0).length;
    const clicked = memberSends.filter((r) => (engagement[r.lead_id]?.clicks || 0) > 0).length;
    const replied = members.filter((l) => l.status === "replied" || l.status === "booked").length;
    const booked = members.filter((l) => l.status === "booked").length;
    const held = heldChecks.filter((c) => memberIds.includes(c.lead_id)).length;
    return { campaign: c, leadCount: memberIds.length, sent: memberSends.length, opened, clicked, replied, booked, held };
  });

  return (
    <div style={{ background: "#f1f5f9", minHeight: "100vh" }}>
      <Topbar title="CAMPAIGN TRACKING" subtitle="Outreach campaign emails only — sent via outreach@lsgrowth.agency, separate from Lucky's personal Gmail" />

      <div style={{ padding: "20px 28px 60px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10 }}>
          {[
            { label: "Sent", value: totalSent },
            { label: "Opened", value: `${totalOpened} (${openRate}%)` },
            { label: "Clicked", value: totalClicked },
            { label: "Replied", value: totalReplied },
            { label: "Booked", value: totalBooked },
            { label: "Held For Review", value: heldChecks.length },
          ].map((c) => (
            <div key={c.label} style={{ background: L.surface, border: `1px solid ${L.border}`, padding: "14px 16px" }}>
              <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: L.muted, marginBottom: 6 }}>{c.label}</p>
              <p style={{ fontSize: 24, fontWeight: 800, color: L.text }}>{c.value}</p>
            </div>
          ))}
        </div>

        <div style={{ background: L.surface, border: `1px solid ${L.border}`, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${L.border}`, fontSize: 11, fontWeight: 700, color: L.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            By Campaign
          </div>
          {perCampaign.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: L.dimmed, fontSize: 13 }}>No campaigns yet.</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  {["Campaign", "Status", "Leads", "Sent", "Opened", "Clicked", "Replied", "Booked", "Held"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "9px 14px", fontSize: 10, fontWeight: 700, color: L.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {perCampaign.map(({ campaign, leadCount, sent, opened, clicked, replied, booked, held }, i) => {
                  const badge = STATUS_BADGE[campaign.status] || STATUS_BADGE.draft;
                  return (
                    <tr key={campaign.id} style={{ borderBottom: i === perCampaign.length - 1 ? "none" : `1px solid ${L.border}` }} className="row-hover">
                      <td style={{ padding: "10px 14px" }}>
                        <Link href={`/dashboard/campaigns/${campaign.id}`} style={{ fontSize: 13, fontWeight: 700, color: L.text, textDecoration: "none" }}>
                          {campaign.name}
                        </Link>
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
                      <td style={{ padding: "10px 14px", fontSize: 12.5, color: held > 0 ? "var(--red)" : L.text, fontWeight: held > 0 ? 700 : 400 }}>{held}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ background: L.surface, border: `1px solid ${L.border}`, padding: 24 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: L.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>Every Send</p>
          {rows.length === 0 ? (
            <p style={{ color: L.muted, fontSize: 13 }}>No campaign emails sent yet.</p>
          ) : (
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  {["Sent", "Campaign", "Company", "Contact", "Subject", "Activity", "Last Activity"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "10px 12px", borderBottom: `1px solid ${L.border}`, color: L.muted, fontWeight: 700, fontSize: 11, letterSpacing: "0.05em", textTransform: "uppercase" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const ev = engagement[row.lead_id];
                  const lead = leadById.get(row.lead_id);
                  return (
                    <tr key={row.id}>
                      <td style={{ padding: "10px 12px", borderBottom: `1px solid ${L.border}`, fontSize: 12.5, color: L.muted, whiteSpace: "nowrap" }}>
                        {formatDateTime(row.sent_at)}
                      </td>
                      <td style={{ padding: "10px 12px", borderBottom: `1px solid ${L.border}`, fontSize: 12.5, color: L.muted }}>{row.campaign_name}</td>
                      <td style={{ padding: "10px 12px", borderBottom: `1px solid ${L.border}`, fontWeight: 700, fontSize: 13.5 }}>
                        <Link href={`/dashboard/leads/${row.lead_id}`} style={{ color: "var(--red)" }}>{row.company}</Link>
                      </td>
                      <td style={{ padding: "10px 12px", borderBottom: `1px solid ${L.border}`, fontSize: 13, color: L.muted }}>{row.contact_name}</td>
                      <td style={{ padding: "10px 12px", borderBottom: `1px solid ${L.border}`, fontSize: 13.5 }}>{row.subject}</td>
                      <td style={{ padding: "10px 12px", borderBottom: `1px solid ${L.border}`, fontSize: 13 }}>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {!ev?.opens && !ev?.clicks && lead?.status !== "replied" && lead?.status !== "booked" && <span style={{ fontSize: 11, color: L.dimmed }}>No activity</span>}
                          {ev?.opens > 0 && <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", background: "#dbeafe", color: "#1e40af" }}>{ev.opens} open{ev.opens !== 1 ? "s" : ""}</span>}
                          {ev?.clicks > 0 && <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", background: "#fce7f3", color: "#9d174d" }}>{ev.clicks} click{ev.clicks !== 1 ? "s" : ""}</span>}
                          {(lead?.status === "replied" || lead?.status === "booked") && <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", background: "#dcfce7", color: "#15803d" }}>{lead.status === "booked" ? "Booked" : "Replied"}</span>}
                        </div>
                      </td>
                      <td style={{ padding: "10px 12px", borderBottom: `1px solid ${L.border}`, fontSize: 12.5, color: L.muted, whiteSpace: "nowrap" }}>
                        {ev?.last_event_at ? formatDateTime(ev.last_event_at) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
