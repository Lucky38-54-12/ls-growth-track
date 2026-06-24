import { createSupabaseClient, fetchAllRows } from "@/lib/supabase";
import { Lead, Campaign } from "@/lib/types";
import Topbar from "@/components/Topbar";
import Link from "next/link";
import { Megaphone, ChevronRight } from "lucide-react";

export const revalidate = 0;

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };

const STATUS_BADGE: Record<string, { bg: string; fg: string; label: string }> = {
  draft: { bg: "#f1f5f9", fg: "#475569", label: "Draft" },
  active: { bg: "#dcfce7", fg: "#166534", label: "Active" },
  paused: { bg: "#fef9c3", fg: "#854d0e", label: "Paused" },
  completed: { bg: "#e2e8f0", fg: "#64748b", label: "Completed" },
};

export default async function CampaignsPage() {
  const sb = createSupabaseClient();

  const [campaigns, campaignLeads, leads] = await Promise.all([
    fetchAllRows<Campaign>((from, to) => sb.from("campaigns").select("*").order("created_at", { ascending: false }).range(from, to)),
    fetchAllRows<{ campaign_id: string; lead_id: string }>((from, to) => sb.from("campaign_leads").select("campaign_id, lead_id").range(from, to)),
    fetchAllRows<Lead>((from, to) => sb.from("leads").select("*").range(from, to)),
  ]);

  const leadsById = new Map(leads.map((l) => [l.lead_id, l]));

  const rows = campaigns.map((c) => {
    const memberIds = campaignLeads.filter((cl) => cl.campaign_id === c.id).map((cl) => cl.lead_id);
    const members = memberIds.map((id) => leadsById.get(id)).filter((l): l is Lead => !!l);
    const sent = members.filter((l) => l.status !== "not_contacted").length;
    const replied = members.filter((l) => l.status === "replied" || l.status === "booked").length;
    const booked = members.filter((l) => l.status === "booked").length;
    return { campaign: c, leadCount: memberIds.length, sent, replied, booked };
  });

  return (
    <div style={{ background: "#f1f5f9", minHeight: "100vh" }}>
      <Topbar title="Campaigns" subtitle={`${rows.length} campaign${rows.length !== 1 ? "s" : ""}`} />

      <div style={{ padding: "20px 28px 60px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{
          position: "relative", height: 100, overflow: "hidden",
          background: "linear-gradient(120deg, #0b1220 0%, #1e293b 60%, #334155 100%)",
          display: "flex", alignItems: "center", gap: 14, padding: "0 24px",
        }}>
          <Megaphone style={{ width: 28, height: 28, color: "#fff" }} />
          <div>
            <div style={{ fontSize: "clamp(18px,3vw,24px)", fontWeight: 900, color: "#fff", textTransform: "uppercase", letterSpacing: "-0.01em", lineHeight: 1 }}>Batch Campaigns</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 5 }}>Test outreach on a list before scaling to the rest of the database</div>
          </div>
        </div>

        {rows.length === 0 ? (
          <div style={{ background: L.surface, border: `1px solid ${L.border}`, padding: 40, textAlign: "center", color: L.dimmed, fontSize: 13 }}>
            No campaigns yet — select leads on the Contacts page and hit &quot;Start Campaign&quot;.
          </div>
        ) : (
          <div style={{ background: L.surface, border: `1px solid ${L.border}`, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: `1px solid ${L.border}` }}>
                  {["Campaign", "Status", "Leads", "Sent", "Replied", "Booked", ""].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "9px 14px", fontSize: 10, fontWeight: 700, color: L.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ campaign, leadCount, sent, replied, booked }, i) => {
                  const badge = STATUS_BADGE[campaign.status] || STATUS_BADGE.draft;
                  return (
                    <tr key={campaign.id} style={{ borderBottom: i === rows.length - 1 ? "none" : `1px solid ${L.border}` }} className="row-hover">
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
                      <td style={{ padding: "10px 14px", fontSize: 12.5, color: L.text }}>{replied}</td>
                      <td style={{ padding: "10px 14px", fontSize: 12.5, color: L.text }}>{booked}</td>
                      <td style={{ padding: "10px 14px", textAlign: "right" }}>
                        <Link href={`/dashboard/campaigns/${campaign.id}`} style={{ color: L.dimmed, display: "inline-flex" }}>
                          <ChevronRight style={{ width: 14, height: 14 }} />
                        </Link>
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
}
