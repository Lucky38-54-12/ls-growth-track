import { createSupabaseClient, fetchAllRows } from "@/lib/supabase";
import { Lead, EmailEvent, EngagementSummary } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
import { groupBySegment, segmentKey, segmentLabel } from "@/lib/leads";
import Topbar from "@/components/Topbar";
import { Search, Plus, Mail, ChevronRight } from "lucide-react";
import Link from "next/link";

function LeadRow({ lead, engagement, isLast }: { lead: Lead; engagement: Record<string, EngagementSummary>; isLast: boolean }) {
  const ss = STATUS_COLOR[lead.status] || STATUS_COLOR.not_contacted;
  const ev = engagement[lead.lead_id];
  return (
    <tr className="row-hover" style={{ borderBottom: isLast ? "none" : `1px solid ${L.border}`, cursor: "pointer" }}>
      <td style={{ padding: "8px 14px" }}>
        <Link href={`/dashboard/leads/${lead.lead_id}`} style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <div style={{ width: 26, height: 26, background: ss.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9.5, fontWeight: 700, color: ss.fg, flexShrink: 0 }}>
            {initials(lead.company)}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: L.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{lead.company}</div>
            <div style={{ fontSize: 10.5, color: L.dimmed }}>{lead.contact_name || "—"}</div>
          </div>
        </Link>
      </td>
      <td style={{ padding: "8px 14px" }}>
        <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", background: ss.bg, color: ss.fg }}>{STATUS_LABEL[lead.status] || lead.status}</span>
      </td>
      <td style={{ padding: "8px 14px" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: L.muted }}>
          <Mail style={{ width: 11, height: 11 }} />{lead.email || "—"}
        </span>
      </td>
      <td style={{ padding: "8px 14px" }}>
        {ev && (ev.opens > 0 || ev.clicks > 0) ? (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {ev.opens > 0 && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", background: "#dbeafe", color: "#1e40af" }}>{ev.opens} open{ev.opens !== 1 ? "s" : ""}</span>}
            {ev.clicks > 0 && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", background: "#fce7f3", color: "#9d174d" }}>{ev.clicks} click{ev.clicks !== 1 ? "s" : ""}</span>}
          </div>
        ) : (
          <span style={{ fontSize: 11, color: L.dimmed }}>—</span>
        )}
      </td>
      <td style={{ padding: "8px 14px", textAlign: "right" }}>
        <Link href={`/dashboard/leads/${lead.lead_id}`} style={{ color: L.dimmed, display: "inline-flex" }}>
          <ChevronRight style={{ width: 14, height: 14 }} />
        </Link>
      </td>
    </tr>
  );
}

function SegmentSection({ label, leads, engagement }: { label: string; leads: Lead[]; engagement: Record<string, EngagementSummary> }) {
  const warm = leads.filter(l => l.status === "replied" || l.status === "booked").length;
  return (
    <div style={{ background: L.surface, border: `1px solid ${L.border}`, overflow: "hidden" }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8, padding: "9px 14px",
        borderBottom: `1px solid ${L.border}`, background: "#f8fafc",
      }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: L.text }}>{label}</span>
        <span style={{ fontSize: 10.5, fontWeight: 700, padding: "1px 7px", background: "#e2e8f0", color: L.muted }}>{leads.length}</span>
        {warm > 0 && <span style={{ fontSize: 10.5, fontWeight: 700, padding: "1px 7px", background: "#dcfce7", color: "#166534" }}>{warm} warm</span>}
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          {leads.map((lead, i) => (
            <LeadRow key={lead.lead_id} lead={lead} engagement={engagement} isLast={i === leads.length - 1} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const revalidate = 0;

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };

const SEQUENCE_STATUSES = new Set(["contacted", "followup_1_sent", "followup_2_sent"]);
const WARM_STATUSES = new Set(["replied", "booked"]);
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

  const [leads, { data: events }] = await Promise.all([
    fetchAllRows<Lead>((from, to) => sb.from("leads").select("*").order("date_added", { ascending: false }).range(from, to)),
    sb.from("email_events").select("*"),
  ]);

  const allLeads = leads;

  const engagement: Record<string, EngagementSummary> = {};
  for (const ev of (events || []) as EmailEvent[]) {
    if (!engagement[ev.lead_id]) engagement[ev.lead_id] = { opens: 0, clicks: 0, last_event_at: null };
    if (ev.event_type === "open") engagement[ev.lead_id].opens++;
    if (ev.event_type === "click") engagement[ev.lead_id].clicks++;
    if (!engagement[ev.lead_id].last_event_at || ev.created_at > engagement[ev.lead_id].last_event_at!) {
      engagement[ev.lead_id].last_event_at = ev.created_at;
    }
  }

  const total = allLeads.length;
  const notContacted = allLeads.filter(l => l.status === "not_contacted").length;
  const inSequence = allLeads.filter(l => SEQUENCE_STATUSES.has(l.status)).length;
  const warm = allLeads.filter(l => WARM_STATUSES.has(l.status)).length;
  const closed = allLeads.filter(l => CLOSED_STATUSES.has(l.status)).length;
  const contacted = total - notContacted;

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const newThisWeek = allLeads.filter(l => l.date_added >= sevenDaysAgo).length;

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

  // Section the filtered leads by trade/city segment, ordered by total segment size.
  const segments = groupBySegment(allLeads);
  const sections = segments
    .map(s => ({
      key: s.key,
      label: segmentLabel(s.trade, s.location),
      leads: filtered.filter(l => segmentKey(l.trade, l.location) === s.key),
    }))
    .filter(s => s.leads.length > 0);

  return (
    <div style={{ background: "#f1f5f9", minHeight: "100vh" }}>
      <Topbar title="Contacts" subtitle={`${total} lead${total !== 1 ? "s" : ""} · ${contacted} contacted · ${warm} warm`} />

      <div style={{ padding: "20px 28px 60px", display: "flex", flexDirection: "column", gap: 12 }}>

        {/* Hero banner */}
        <div style={{
          position: "relative", height: 140, overflow: "hidden",
          background: "linear-gradient(120deg, #0b1220 0%, #1e293b 60%, #334155 100%)",
        }}>
          <div style={{ position: "absolute", inset: 0, padding: "20px 24px", display: "flex", alignItems: "center", gap: 16 }}>
            <img src="/logo.png" alt="LS Growth" style={{ width: 56, height: 56, objectFit: "contain", background: "#fff", padding: 4, boxShadow: "0 2px 12px rgba(0,0,0,0.4)", flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: "clamp(22px,4vw,32px)", fontWeight: 900, color: "#fff", textTransform: "uppercase", letterSpacing: "-0.01em", lineHeight: 1 }}>Lead Database</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 5 }}>LS Growth Agency</div>
            </div>
            <div style={{ marginLeft: "auto", display: "flex", gap: 24 }}>
              {[{ v: String(total), l: "Total" }, { v: String(contacted), l: "Contacted" }, { v: String(warm), l: "Warm" }].map(({ v, l }) => (
                <div key={l} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 32, fontWeight: 900, color: "#fff", lineHeight: 1 }}>{v}</div>
                  <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.4)", marginTop: 3 }}>{l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Stat cards */}
        <div style={{ display: "flex", gap: 6 }}>
          <div style={{ flex: 1, padding: "14px 18px", background: L.surface, border: `1px solid ${L.border}` }}>
            <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: L.muted, marginBottom: 6 }}>Total Leads</p>
            <div style={{ fontSize: 36, fontWeight: 900, color: L.text, lineHeight: 1 }}>{total}</div>
            <p style={{ fontSize: 10, color: L.dimmed, marginTop: 3 }}>in pipeline</p>
          </div>
          {[
            { label: "Not Contacted", value: notContacted, color: "#64748b", sub: "awaiting first email" },
            { label: "In Sequence", value: inSequence, color: "#2563eb", sub: "follow-ups running" },
            { label: "Warm / Replied", value: warm, color: "#16a34a", sub: "worth a call now" },
            { label: "Closed", value: closed, color: "#475569", sub: "complete or dead" },
          ].map(({ label, value, color, sub }) => (
            <div key={label} style={{ flex: 1, padding: "14px 18px", background: L.surface, border: `1px solid ${L.border}`, borderTop: `3px solid ${color}` }}>
              <p style={{ fontSize: 9, fontWeight: 700, color: L.muted, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>{label}</p>
              <div style={{ fontSize: 36, fontWeight: 900, lineHeight: 1, color: L.text }}>{value}</div>
              <p style={{ fontSize: 10, color: L.dimmed, marginTop: 3 }}>{sub}</p>
            </div>
          ))}
          <div style={{ flex: 1, padding: "14px 18px", background: "var(--green)", border: "1px solid var(--green)", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", bottom: -12, right: -12, width: 60, height: 60, borderRadius: "50%", background: "rgba(0,0,0,0.1)" }} />
            <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.75)", marginBottom: 6 }}>New This Week</p>
            <div style={{ fontSize: 36, fontWeight: 900, color: "#fff", lineHeight: 1 }}>{newThisWeek}</div>
            <p style={{ fontSize: 10, color: "rgba(255,255,255,0.7)", marginTop: 3 }}>added in last 7 days</p>
          </div>
        </div>

        {/* Filters */}
        <form method="get" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 160 }}>
            <Search style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: L.dimmed }} />
            {activeFilter !== "all" && <input type="hidden" name="status" value={activeFilter} />}
            <input
              type="text" name="q" defaultValue={searchParams?.q || ""}
              placeholder="Search…"
              style={{ width: "100%", paddingLeft: 32, paddingRight: 12, paddingTop: 9, paddingBottom: 9, background: L.surface, border: `1px solid ${L.border}`, fontSize: 12.5 }}
            />
          </div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {FILTERS.map(f => {
              const active = activeFilter === f.key;
              const params = new URLSearchParams();
              if (f.key !== "all") params.set("status", f.key);
              if (q) params.set("q", q);
              const qs = params.toString();
              return (
                <Link key={f.key} href={`/dashboard/contacts${qs ? `?${qs}` : ""}`} style={{
                  padding: "5px 12px", fontSize: 11, fontWeight: 600, textDecoration: "none",
                  border: `1px solid ${active ? "var(--red)" : L.border}`,
                  background: active ? "#fef2f2" : L.surface,
                  color: active ? "var(--red)" : L.muted,
                  transition: "all 0.15s",
                }}>{f.label}</Link>
              );
            })}
          </div>
          <Link href="/dashboard/new" className="btn-lift" style={{
            display: "flex", alignItems: "center", gap: 6, background: "var(--red)", color: "#fff",
            border: "none", padding: "8px 16px", fontSize: 12, fontWeight: 700, textDecoration: "none", flexShrink: 0,
          }}>
            <Plus style={{ width: 13, height: 13 }} /> Add Lead
          </Link>
        </form>

        <p style={{ fontSize: 11, color: L.muted }}>
          Showing {filtered.length} of {allLeads.length} across {sections.length} list{sections.length !== 1 ? "s" : ""}
        </p>

        {/* Sectioned lists, one per trade/city */}
        {sections.length === 0 ? (
          <div style={{ background: L.surface, border: `1px solid ${L.border}`, padding: 40, textAlign: "center", color: L.dimmed, fontSize: 13 }}>
            No contacts match this view.
          </div>
        ) : (
          sections.map(s => (
            <SegmentSection key={s.key} label={s.label} leads={s.leads} engagement={engagement} />
          ))
        )}
      </div>
    </div>
  );
}
