"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, XCircle, Clock, Search } from "lucide-react";
import { usePortalLeads } from "@/lib/hooks/usePortalLeads";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b" };

interface Lead {
  id: string;
  outcome: string;
  booking_status: string | null;
  calendar_event_id: string | null;
  booked_at: string | null;
  scheduled_at: string | null;
  created_at: string;
  contact_email: string | null;
  lq_conversations: { extracted_fields: Record<string, unknown> } | null;
}

const OUTCOME_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  qualified: { bg: "#f0fdf4", color: "#15803d", label: "Qualified" },
  nurture: { bg: "#fffbeb", color: "#b45309", label: "Not ready yet" },
  disqualified: { bg: "#fef2f2", color: "#b91c1c", label: "Not a fit" },
  needs_human: { bg: "#eff6ff", color: "#1d4ed8", label: "Needs a reply" },
};

const FILTERS = [
  { key: "all", label: "All" },
  { key: "qualified", label: "Qualified" },
  { key: "nurture", label: "Not ready yet" },
  { key: "needs_human", label: "Needs a reply" },
  { key: "disqualified", label: "Not a fit" },
] as const;

export default function PortalLeadsPage() {
  const { leads, loading, error } = usePortalLeads<Lead>();
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const stats = useMemo(() => {
    const total = leads.length;
    const qualified = leads.filter((l) => l.outcome === "qualified").length;
    const booked = leads.filter((l) => l.booking_status === "booked").length;
    const conversionRate = total ? Math.round((booked / total) * 100) : 0;
    return { total, qualified, booked, conversionRate };
  }, [leads]);

  const filtered = useMemo(() => {
    return leads.filter((lead) => {
      if (filter !== "all" && lead.outcome !== filter) return false;
      if (!search.trim()) return true;
      const fields = lead.lq_conversations?.extracted_fields || {};
      const haystack = [fields.job_type, fields.location, fields.phone, lead.contact_email].join(" ").toLowerCase();
      return haystack.includes(search.trim().toLowerCase());
    });
  }, [leads, filter, search]);

  return (
    <div>
      <div style={{ background: "#fff", borderBottom: `1px solid ${L.border}`, padding: "20px 32px", display: "flex", alignItems: "stretch", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "stretch", gap: 14 }}>
          <div style={{ width: 4, borderRadius: 2, background: "var(--red)", alignSelf: "stretch", flexShrink: 0 }} />
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: L.text, textTransform: "uppercase", letterSpacing: "0.02em" }}>Leads</h1>
            <p style={{ fontSize: 14, color: L.muted, marginTop: 3 }}>Everyone who's messaged in and been qualified by your AI chat.</p>
          </div>
        </div>

        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "#15803d", background: "#f0fdf4", padding: "6px 14px", borderRadius: 20, height: "fit-content", alignSelf: "center" }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />
          LIVE
        </span>
      </div>

      <div style={{ padding: "24px 32px 60px" }}>
        {loading ? (
          <p style={{ color: L.muted, fontSize: 13 }}>Loading…</p>
        ) : error ? (
          <p style={{ color: "#b91c1c", fontSize: 13 }}>{error}</p>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 24 }}>
              <StatCard label="Total leads" value={stats.total} accent="#64748b" />
              <StatCard label="Qualified" value={stats.qualified} accent="#15803d" />
              <StatCard label="Booked" value={stats.booked} accent="#1d4ed8" />
              <StatCard label="Booked rate" value={`${stats.conversionRate}%`} highlight />
            </div>

            <div style={{ display: "flex", gap: 14, marginBottom: 16, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ position: "relative", flex: "1 1 240px", maxWidth: 340 }}>
                <Search style={{ width: 15, height: 15, position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: L.muted }} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search…"
                  style={{ width: "100%", padding: "10px 14px 10px 34px", fontSize: 14, border: `1px solid ${L.border}`, boxSizing: "border-box" }}
                />
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {FILTERS.map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    style={{
                      padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", border: "none",
                      background: filter === f.key ? "var(--red)" : "#e2e8f0",
                      color: filter === f.key ? "#fff" : L.muted,
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <p style={{ fontSize: 13, color: L.muted, marginBottom: 10 }}>
              Showing {filtered.length} of {leads.length}
            </p>

            {filtered.length === 0 ? (
              <div style={{ background: L.surface, border: `1px solid ${L.border}`, padding: 32, textAlign: "center", color: L.muted, fontSize: 13 }}>
                {leads.length === 0 ? "No leads yet — they'll show up here as soon as someone messages your connected Page." : "No leads match that filter."}
              </div>
            ) : (
              <div style={{ background: L.surface, border: `1px solid ${L.border}`, overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 680 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${L.border}`, background: "#f8fafc" }}>
                      {["Lead", "Contact", "Status", "Scheduled", "Received"].map((h) => (
                        <th key={h} style={{ textAlign: "left", padding: "12px 18px", fontSize: 12, fontWeight: 700, color: L.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((lead) => {
                      const fields = lead.lq_conversations?.extracted_fields || {};
                      const jobType = String(fields.job_type || "Job type unknown");
                      const style = OUTCOME_STYLE[lead.outcome] || { bg: "#f1f5f9", color: L.muted, label: lead.outcome };
                      const initials = jobType.slice(0, 2).toUpperCase();
                      return (
                        <tr key={lead.id} style={{ borderBottom: `1px solid ${L.border}` }}>
                          <td style={{ padding: "16px 18px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                              <div style={{ width: 38, height: 38, borderRadius: 4, flexShrink: 0, background: style.bg, color: style.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800 }}>
                                {initials}
                              </div>
                              <div>
                                <p style={{ fontSize: 15, fontWeight: 700, color: L.text }}>{jobType}</p>
                                <p style={{ fontSize: 13, color: L.muted }}>{String(fields.location || "Location unknown")}</p>
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: "16px 18px", fontSize: 14, color: L.text }}>
                            {String(fields.phone || lead.contact_email || "—")}
                          </td>
                          <td style={{ padding: "16px 18px" }}>
                            <span style={{ fontSize: 12.5, fontWeight: 700, color: style.color, background: style.bg, padding: "5px 12px", borderRadius: 20, whiteSpace: "nowrap" }}>
                              {style.label}
                            </span>
                          </td>
                          <td style={{ padding: "16px 18px", fontSize: 14 }}>
                            {lead.booking_status === "booked" && lead.scheduled_at ? (
                              <span style={{ display: "flex", alignItems: "center", gap: 6, color: "#15803d", fontWeight: 600 }}>
                                <CheckCircle2 style={{ width: 14, height: 14 }} /> {new Date(lead.scheduled_at).toLocaleString("en-NZ", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                              </span>
                            ) : lead.booking_status === "failed" ? (
                              <span style={{ display: "flex", alignItems: "center", gap: 6, color: "#b91c1c", fontWeight: 600 }}>
                                <XCircle style={{ width: 14, height: 14 }} /> Book manually
                              </span>
                            ) : lead.outcome === "nurture" ? (
                              <span style={{ display: "flex", alignItems: "center", gap: 6, color: "#b45309", fontWeight: 600 }}>
                                <Clock style={{ width: 14, height: 14 }} /> Kept warm
                              </span>
                            ) : (
                              <span style={{ color: L.muted }}>—</span>
                            )}
                          </td>
                          <td style={{ padding: "16px 18px", fontSize: 14, color: L.muted, whiteSpace: "nowrap" }}>
                            {new Date(lead.created_at).toLocaleDateString("en-NZ")}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, accent, highlight }: { label: string; value: string | number; accent?: string; highlight?: boolean }) {
  return (
    <div style={{
      background: highlight ? "var(--red)" : L.surface,
      border: `1px solid ${highlight ? "var(--red)" : L.border}`,
      borderTop: highlight ? undefined : `3px solid ${accent || L.border}`,
      padding: "18px 20px",
    }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: highlight ? "rgba(255,255,255,0.85)" : L.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
        {label}
      </p>
      <p style={{ fontSize: 36, fontWeight: 900, color: highlight ? "#fff" : L.text, lineHeight: 1 }}>{value}</p>
    </div>
  );
}
