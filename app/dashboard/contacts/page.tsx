import { createSupabaseClient } from "@/lib/supabase";
import { Lead, EmailEvent, EngagementSummary } from "@/lib/types";
import Topbar from "@/components/Topbar";
import PipelineStats from "@/components/PipelineStats";
import Link from "next/link";

export const revalidate = 0;

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };

const CLOSED_STATUSES = new Set(["sequence_complete", "not_interested", "bounced"]);

const FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "not_contacted", label: "New Lead" },
  { key: "contacted", label: "Contacted" },
  { key: "followup_1_sent", label: "Follow-up 1" },
  { key: "followup_2_sent", label: "Follow-up 2" },
  { key: "replied", label: "Replied" },
  { key: "booked", label: "Booked" },
  { key: "closed", label: "Closed" },
];

const STATUS_LABEL: Record<string, string> = {
  not_contacted: "New Lead",
  contacted: "Contacted",
  followup_1_sent: "Follow-up 1",
  followup_2_sent: "Follow-up 2",
  replied: "Replied",
  booked: "Booked",
  sequence_complete: "Closed",
  not_interested: "Closed",
  bounced: "Closed",
};

const STATUS_COLOR: Record<string, { bg: string; fg: string }> = {
  not_contacted: { bg: "#f1f5f9", fg: "#475569" },
  contacted: { bg: "#dbeafe", fg: "#1e40af" },
  followup_1_sent: { bg: "#ede9fe", fg: "#6d28d9" },
  followup_2_sent: { bg: "#ede9fe", fg: "#6d28d9" },
  replied: { bg: "#dcfce7", fg: "#166534" },
  booked: { bg: "#dcfce7", fg: "#166534" },
  sequence_complete: { bg: "#f1f5f9", fg: "#64748b" },
  not_interested: { bg: "#f1f5f9", fg: "#64748b" },
  bounced: { bg: "#f1f5f9", fg: "#64748b" },
};

function initials(name: string) {
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: { status?: string; q?: string };
}) {
  const sb = createSupabaseClient();

  const [{ data: leads }, { data: events }] = await Promise.all([
    sb.from("leads").select("*").order("date_added", { ascending: false }),
    sb.from("email_events").select("*"),
  ]);

  const allLeads = (leads || []) as Lead[];

  const engagement: Record<string, EngagementSummary> = {};
  for (const ev of (events || []) as EmailEvent[]) {
    if (!engagement[ev.lead_id]) engagement[ev.lead_id] = { opens: 0, clicks: 0, last_event_at: null };
    if (ev.event_type === "open") engagement[ev.lead_id].opens++;
    if (ev.event_type === "click") engagement[ev.lead_id].clicks++;
    if (!engagement[ev.lead_id].last_event_at) engagement[ev.lead_id].last_event_at = ev.created_at;
  }

  const activeFilter = searchParams?.status || "all";
  const q = (searchParams?.q || "").trim().toLowerCase();

  let filtered = allLeads;
  if (activeFilter === "closed") {
    filtered = filtered.filter(l => CLOSED_STATUSES.has(l.status));
  } else if (activeFilter !== "all") {
    filtered = filtered.filter(l => l.status === activeFilter);
  }
  if (q) {
    filtered = filtered.filter(l =>
      l.company.toLowerCase().includes(q) ||
      (l.trade || "").toLowerCase().includes(q) ||
      (l.location || "").toLowerCase().includes(q) ||
      (l.contact_name || "").toLowerCase().includes(q) ||
      (l.email || "").toLowerCase().includes(q)
    );
  }

  return (
    <div style={{ background: "#f1f5f9", minHeight: "100vh" }}>
      <Topbar title="CONTACTS" subtitle="Every business in your outreach pipeline" />

      <div style={{ padding: "24px 28px 60px" }}>
        <PipelineStats allLeads={allLeads} />

        {/* Filter bar */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 12, flexWrap: "wrap", marginBottom: 16,
        }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {FILTERS.map(f => {
              const active = activeFilter === f.key;
              const count = f.key === "all"
                ? allLeads.length
                : f.key === "closed"
                  ? allLeads.filter(l => CLOSED_STATUSES.has(l.status)).length
                  : allLeads.filter(l => l.status === f.key).length;
              return (
                <Link key={f.key} href={`/dashboard/contacts${f.key === "all" ? "" : `?status=${f.key}`}`} className="btn-lift" style={{
                  padding: "8px 14px", fontSize: 12.5, fontWeight: 700, textDecoration: "none",
                  background: active ? "#0f172a" : "#fff",
                  color: active ? "#fff" : "#0f172a",
                  border: "1px solid " + (active ? "#0f172a" : L.border),
                }}>
                  {f.label} <span style={{ opacity: 0.6, fontWeight: 700 }}>{count}</span>
                </Link>
              );
            })}
          </div>
          <Link href="/dashboard/new" className="btn-lift" style={{
            padding: "9px 18px", background: "var(--red)", color: "#fff",
            fontSize: 13, fontWeight: 700, textDecoration: "none", flexShrink: 0,
          }}>
            + Add Lead
          </Link>
        </div>

        {/* Search */}
        <form method="get" style={{ marginBottom: 16 }}>
          {activeFilter !== "all" && <input type="hidden" name="status" value={activeFilter} />}
          <input
            type="text"
            name="q"
            defaultValue={searchParams?.q || ""}
            placeholder="Search by company, trade, location, contact or email…"
            style={{
              width: "100%", maxWidth: 420, padding: "10px 14px", fontSize: 13,
              border: `1px solid ${L.border}`, borderRadius: 0, background: "#fff",
            }}
          />
        </form>

        {/* Table */}
        <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 0, overflow: "hidden" }}>
          <div style={{ padding: "14px 18px", borderBottom: `1px solid ${L.border}`, fontSize: 12, color: L.muted, fontWeight: 700 }}>
            Showing {filtered.length} of {allLeads.length} contact{allLeads.length !== 1 ? "s" : ""}
          </div>
          {filtered.length === 0 ? (
            <div style={{ padding: "40px", textAlign: "center", color: L.dimmed, fontSize: 13 }}>
              No contacts match this view.
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  {["Name", "Trade", "Location", "Status", "Contact", "Engagement"].map(h => (
                    <th key={h} style={{
                      textAlign: "left", padding: "10px 18px", borderBottom: `1px solid ${L.border}`,
                      color: L.muted, fontWeight: 700, fontSize: 11, letterSpacing: "0.05em", textTransform: "uppercase",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(lead => {
                  const ev = engagement[lead.lead_id];
                  const statusKey = lead.status;
                  const color = STATUS_COLOR[statusKey] || STATUS_COLOR.not_contacted;
                  return (
                    <tr key={lead.lead_id} className="row-hover" style={{ borderBottom: `1px solid ${L.border}` }}>
                      <td style={{ padding: "12px 18px" }}>
                        <Link href={`/dashboard/leads/${lead.lead_id}`} style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
                          <div style={{
                            width: 32, height: 32, borderRadius: 0, background: "#f1f5f9",
                            border: `1px solid ${L.border}`, display: "flex", alignItems: "center", justifyContent: "center",
                            fontWeight: 900, fontSize: 11, color: L.muted, flexShrink: 0,
                          }}>
                            {initials(lead.company)}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 800, fontSize: 13.5, color: L.text }}>{lead.company}</div>
                            <div style={{ fontSize: 11.5, color: L.dimmed }}>{lead.contact_name || "—"}</div>
                          </div>
                        </Link>
                      </td>
                      <td style={{ padding: "12px 18px", fontSize: 13, color: L.text }}>{lead.trade || "—"}</td>
                      <td style={{ padding: "12px 18px", fontSize: 13, color: L.text }}>{lead.location || "—"}</td>
                      <td style={{ padding: "12px 18px" }}>
                        <span style={{
                          fontSize: 11, fontWeight: 800, padding: "3px 10px", borderRadius: 0,
                          background: color.bg, color: color.fg,
                        }}>{STATUS_LABEL[statusKey] || statusKey}</span>
                      </td>
                      <td style={{ padding: "12px 18px", fontSize: 12.5, color: L.muted }}>{lead.email}</td>
                      <td style={{ padding: "12px 18px" }}>
                        {(ev?.opens || ev?.clicks) ? (
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {ev?.opens > 0 && <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 0, background: "#dbeafe", color: "#1e40af" }}>{ev.opens} open{ev.opens !== 1 ? "s" : ""}</span>}
                            {ev?.clicks > 0 && <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 0, background: "#fce7f3", color: "#9d174d" }}>{ev.clicks} click{ev.clicks !== 1 ? "s" : ""}</span>}
                          </div>
                        ) : (
                          <span style={{ fontSize: 12, color: L.dimmed }}>—</span>
                        )}
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
