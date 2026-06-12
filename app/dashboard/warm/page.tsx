import { createSupabaseClient } from "@/lib/supabase";
import { Lead, EmailEvent, EngagementSummary } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
import Link from "next/link";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };
const WARM_STATUSES = new Set(["replied", "booked"]);

export const revalidate = 0;

export default async function WarmLeadsPage() {
  const sb = createSupabaseClient();

  const [{ data: leads }, { data: events }] = await Promise.all([
    sb.from("leads").select("*").order("date_added", { ascending: false }),
    sb.from("email_events").select("*"),
  ]);

  const engagement: Record<string, EngagementSummary> = {};
  for (const ev of (events || []) as EmailEvent[]) {
    if (!engagement[ev.lead_id]) engagement[ev.lead_id] = { opens: 0, clicks: 0, last_event_at: null };
    if (ev.event_type === "open") engagement[ev.lead_id].opens++;
    if (ev.event_type === "click") engagement[ev.lead_id].clicks++;
    if (!engagement[ev.lead_id].last_event_at || ev.created_at > engagement[ev.lead_id].last_event_at!) {
      engagement[ev.lead_id].last_event_at = ev.created_at;
    }
  }

  const warm = ((leads || []) as Lead[]).filter((l) => {
    const ev = engagement[l.lead_id];
    return WARM_STATUSES.has(l.status) || (ev && (ev.opens > 0 || ev.clicks > 0));
  }).sort((a, b) => {
    const aReplied = WARM_STATUSES.has(a.status) ? 1 : 0;
    const bReplied = WARM_STATUSES.has(b.status) ? 1 : 0;
    if (bReplied !== aReplied) return bReplied - aReplied;
    const aClicks = engagement[a.lead_id]?.clicks || 0;
    const bClicks = engagement[b.lead_id]?.clicks || 0;
    return bClicks - aClicks;
  });

  return (
    <div>
      <div style={{ background: "#fff", borderBottom: `1px solid ${L.border}`, padding: "0 28px", height: 68, display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 34, height: 34, borderRadius: 0, background: "var(--green)", flexShrink: 0 }} />
        <div>
          <h1 style={{ fontSize: 17, fontWeight: 900, letterSpacing: "0.04em" }}>WARM LEADS</h1>
          <p style={{ color: L.muted, fontSize: 12, marginTop: 1 }}>Anyone who&apos;s opened, clicked, or replied — worth a call</p>
        </div>
      </div>

      <div style={{ maxWidth: 960, margin: "32px auto", padding: "0 28px" }}>
        <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 0, padding: 24 }}>
          <div style={{ fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, fontWeight: 800, marginBottom: 18 }}>
            Worth a Call — {warm.length} lead{warm.length !== 1 ? "s" : ""}
          </div>
          {warm.length === 0 ? (
            <p style={{ color: L.muted, fontSize: 13 }}>Nobody warm yet — keep sending!</p>
          ) : (
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  {["Company", "Contact", "Email", "Trade", "Activity", "Last Activity"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "10px 12px", borderBottom: `1px solid ${L.border}`, color: L.muted, fontWeight: 700, fontSize: 11, letterSpacing: "0.05em", textTransform: "uppercase" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {warm.map((lead) => {
                  const ev = engagement[lead.lead_id];
                  return (
                    <tr key={lead.lead_id} style={{ cursor: "pointer" }}>
                      <td style={{ padding: "10px 12px", borderBottom: `1px solid ${L.border}`, fontWeight: 700, fontSize: 13.5 }}>
                        <Link href={`/dashboard/leads/${lead.lead_id}`} style={{ color: "var(--red)" }}>{lead.company}</Link>
                      </td>
                      <td style={{ padding: "10px 12px", borderBottom: `1px solid ${L.border}`, fontSize: 13.5 }}>{lead.contact_name}</td>
                      <td style={{ padding: "10px 12px", borderBottom: `1px solid ${L.border}`, fontSize: 13.5, color: L.muted }}>{lead.email}</td>
                      <td style={{ padding: "10px 12px", borderBottom: `1px solid ${L.border}`, fontSize: 13.5, color: L.muted }}>{lead.trade}</td>
                      <td style={{ padding: "10px 12px", borderBottom: `1px solid ${L.border}`, fontSize: 13 }}>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {WARM_STATUSES.has(lead.status) && <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 0, background: "#dcfce7", color: "#166534" }}>{lead.status}</span>}
                          {ev?.clicks > 0 && <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 0, background: "#fce7f3", color: "#9d174d" }}>{ev.clicks} click{ev.clicks !== 1 ? "s" : ""}</span>}
                          {ev?.opens > 0 && <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 0, background: "#dbeafe", color: "#1e40af" }}>{ev.opens} open{ev.opens !== 1 ? "s" : ""}</span>}
                        </div>
                      </td>
                      <td style={{ padding: "10px 12px", borderBottom: `1px solid ${L.border}`, fontSize: 12.5, color: L.muted }}>
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
