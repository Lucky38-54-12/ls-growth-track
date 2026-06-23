import Link from "next/link";
import { Phone } from "lucide-react";
import { createSupabaseClient, fetchAllRows } from "@/lib/supabase";
import { formatDateTime } from "@/lib/format";
import { Lead, EmailEvent, EngagementSummary } from "@/lib/types";
import Topbar from "@/components/Topbar";

export const revalidate = 0;

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };

const STATUS_LABELS: Record<string, string> = {
  called: "Called, not yet emailed",
  emailed: "Follow-up emailed",
  meeting_booked: "Meeting booked",
  contacted: "Email sent",
  followup_1_sent: "Follow-up 1 sent",
  followup_2_sent: "Follow-up 2 sent",
  followup_3_sent: "Follow-up 3 sent",
  followup_4_sent: "Follow-up 4 sent",
  replied: "Replied",
  booked: "Booked",
  not_interested: "Not interested",
  bounced: "Bounced",
  sequence_complete: "Sequence complete",
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  meeting_booked: { bg: "#dcfce7", text: "#166534" },
  booked: { bg: "#dcfce7", text: "#166534" },
  emailed: { bg: "#dbeafe", text: "#1e40af" },
  replied: { bg: "#dbeafe", text: "#1e40af" },
  not_interested: { bg: "#fee2e2", text: "#991b1b" },
  bounced: { bg: "#fee2e2", text: "#991b1b" },
};

export default async function ColdCallPipelinePage() {
  const sb = createSupabaseClient();

  const [leads, { data: events }] = await Promise.all([
    fetchAllRows<Lead>((from, to) => sb.from("leads").select("*").eq("source", "cold_call").order("date_added", { ascending: false }).range(from, to)),
    sb.from("email_events").select("*"),
  ]);

  const engagement: Record<string, EngagementSummary> = {};
  for (const ev of (events || []) as EmailEvent[]) {
    if (!engagement[ev.lead_id]) engagement[ev.lead_id] = { opens: 0, clicks: 0, last_event_at: null };
    if (ev.event_type === "open") engagement[ev.lead_id].opens++;
    if (ev.event_type === "click") engagement[ev.lead_id].clicks++;
    if (!engagement[ev.lead_id].last_event_at) engagement[ev.lead_id].last_event_at = ev.created_at;
  }

  // Uncalled prospects belong in the Call Queue — this page is every
  // cold-call lead you've actually called, all together, no sections.
  const calledLeads = leads.filter(l => l.status !== "not_contacted");
  const queueCount = leads.filter(l => l.status === "not_contacted").length;

  return (
    <div>
      <Topbar title="Cold Call Pipeline" subtitle="Every cold-call lead, all in one place" />

      <div style={{ maxWidth: 1080, margin: "32px auto", padding: "0 28px" }}>
        {queueCount > 0 && (
          <Link href="/dashboard/call-queue" className="card-hover" style={{
            display: "flex", alignItems: "center", gap: 12,
            background: "#fef2f2", border: "1px solid #fecaca", padding: "12px 16px", textDecoration: "none", marginBottom: 16,
          }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "#fee2e2", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Phone style={{ width: 15, height: 15, color: "var(--red)" }} />
            </div>
            <span style={{ fontSize: 13, fontWeight: 800, color: "var(--red)" }}>
              {queueCount} prospect{queueCount !== 1 ? "s" : ""} waiting in the Call Queue
            </span>
          </Link>
        )}

        <div style={{ background: L.surface, border: `1px solid ${L.border}`, padding: 24 }}>
          <div style={{ fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, fontWeight: 800, marginBottom: 18 }}>
            All Cold Call Leads — {calledLeads.length}
          </div>
          {calledLeads.length === 0 ? (
            <p style={{ color: L.muted, fontSize: 13 }}>
              No cold-call leads yet — work through the <Link href="/dashboard/call-queue" style={{ color: "var(--red)" }}>Call Queue</Link> to add some.
            </p>
          ) : (
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  {["Company", "Contact", "Trade", "Status", "Added", "Activity"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "10px 12px", borderBottom: `1px solid ${L.border}`, color: L.muted, fontWeight: 700, fontSize: 11, letterSpacing: "0.05em", textTransform: "uppercase" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {calledLeads.map((lead) => {
                  const ev = engagement[lead.lead_id];
                  const color = STATUS_COLORS[lead.status] || { bg: "#f1f5f9", text: L.muted };
                  return (
                    <tr key={lead.lead_id}>
                      <td style={{ padding: "10px 12px", borderBottom: `1px solid ${L.border}`, fontWeight: 700, fontSize: 13.5 }}>
                        <Link href={`/dashboard/leads/${lead.lead_id}`} style={{ color: "var(--red)" }}>{lead.company}</Link>
                      </td>
                      <td style={{ padding: "10px 12px", borderBottom: `1px solid ${L.border}`, fontSize: 13, color: L.muted }}>{lead.contact_name}</td>
                      <td style={{ padding: "10px 12px", borderBottom: `1px solid ${L.border}`, fontSize: 13, color: L.muted }}>{lead.trade || "—"}</td>
                      <td style={{ padding: "10px 12px", borderBottom: `1px solid ${L.border}` }}>
                        <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", background: color.bg, color: color.text }}>
                          {STATUS_LABELS[lead.status] || lead.status}
                        </span>
                      </td>
                      <td style={{ padding: "10px 12px", borderBottom: `1px solid ${L.border}`, fontSize: 12.5, color: L.muted, whiteSpace: "nowrap" }}>{formatDateTime(lead.date_added)}</td>
                      <td style={{ padding: "10px 12px", borderBottom: `1px solid ${L.border}`, fontSize: 13 }}>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {!ev?.opens && !ev?.clicks && <span style={{ fontSize: 11, color: L.dimmed }}>—</span>}
                          {ev?.opens > 0 && <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", background: "#dbeafe", color: "#1e40af" }}>{ev.opens} open{ev.opens !== 1 ? "s" : ""}</span>}
                          {ev?.clicks > 0 && <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", background: "#fce7f3", color: "#9d174d" }}>{ev.clicks} click{ev.clicks !== 1 ? "s" : ""}</span>}
                        </div>
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
