import { createSupabaseClient, fetchAllRows } from "@/lib/supabase";
import { EmailEvent, EmailSend, EngagementSummary } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
import Topbar from "@/components/Topbar";
import Link from "next/link";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };

export const revalidate = 0;

interface SendRow extends EmailSend {
  company: string;
  contact_name: string;
  email: string;
}

export default async function EmailTrackingPage() {
  const sb = createSupabaseClient();

  const [{ data: sends }, leads, { data: events }] = await Promise.all([
    sb.from("email_sends").select("*").order("sent_at", { ascending: false }),
    fetchAllRows<{ lead_id: string; company: string; contact_name: string; email: string }>(
      (from, to) => sb.from("leads").select("lead_id,company,contact_name,email").range(from, to)
    ),
    sb.from("email_events").select("*"),
  ]);

  const leadById = new Map(leads.map((l) => [l.lead_id, l]));

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
      email: lead?.email || "",
    };
  });

  const totalSent = rows.length;
  const totalOpened = rows.filter((r) => (engagement[r.lead_id]?.opens || 0) > 0).length;
  const totalClicked = rows.filter((r) => (engagement[r.lead_id]?.clicks || 0) > 0).length;
  const openRate = totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : 0;

  return (
    <div>
      <Topbar title="EMAIL TRACKING" subtitle="Every email sent, and who's opening or clicking" />

      <div style={{ maxWidth: 1080, margin: "32px auto", padding: "0 28px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 20 }}>
          {[
            { label: "Emails Sent", value: totalSent },
            { label: "Opened", value: `${totalOpened} (${openRate}%)` },
            { label: "Clicked", value: totalClicked },
          ].map((c) => (
            <div key={c.label} style={{ background: L.surface, border: `1px solid ${L.border}`, padding: "16px 18px" }}>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: L.muted, marginBottom: 6 }}>{c.label}</p>
              <p style={{ fontSize: 28, fontWeight: 800, color: L.text }}>{c.value}</p>
            </div>
          ))}
        </div>

        <div style={{ background: L.surface, border: `1px solid ${L.border}`, padding: 24 }}>
          {rows.length === 0 ? (
            <p style={{ color: L.muted, fontSize: 13 }}>No emails sent yet.</p>
          ) : (
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  {["Sent", "Company", "Contact", "Subject", "Activity", "Last Activity"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "10px 12px", borderBottom: `1px solid ${L.border}`, color: L.muted, fontWeight: 700, fontSize: 11, letterSpacing: "0.05em", textTransform: "uppercase" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const ev = engagement[row.lead_id];
                  return (
                    <tr key={row.id}>
                      <td style={{ padding: "10px 12px", borderBottom: `1px solid ${L.border}`, fontSize: 12.5, color: L.muted, whiteSpace: "nowrap" }}>
                        {formatDateTime(row.sent_at)}
                      </td>
                      <td style={{ padding: "10px 12px", borderBottom: `1px solid ${L.border}`, fontWeight: 700, fontSize: 13.5 }}>
                        <Link href={`/dashboard/leads/${row.lead_id}`} style={{ color: "var(--red)" }}>{row.company}</Link>
                      </td>
                      <td style={{ padding: "10px 12px", borderBottom: `1px solid ${L.border}`, fontSize: 13, color: L.muted }}>{row.contact_name}</td>
                      <td style={{ padding: "10px 12px", borderBottom: `1px solid ${L.border}`, fontSize: 13.5 }}>{row.subject}</td>
                      <td style={{ padding: "10px 12px", borderBottom: `1px solid ${L.border}`, fontSize: 13 }}>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {!ev?.opens && !ev?.clicks && <span style={{ fontSize: 11, color: L.dimmed }}>No activity</span>}
                          {ev?.opens > 0 && <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", background: "#dbeafe", color: "#1e40af" }}>{ev.opens} open{ev.opens !== 1 ? "s" : ""}</span>}
                          {ev?.clicks > 0 && <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", background: "#fce7f3", color: "#9d174d" }}>{ev.clicks} click{ev.clicks !== 1 ? "s" : ""}</span>}
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
