"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, XCircle, Clock } from "lucide-react";

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
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/portal/leads")
      .then((r) => r.json())
      .then((body) => {
        if (body.error) setError(body.error);
        else setLeads(body.leads || []);
        setLoading(false);
      })
      .catch(() => {
        setError("Something went wrong loading your leads.");
        setLoading(false);
      });
  }, []);

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
      <div style={{ background: "#fff", borderBottom: `1px solid ${L.border}`, padding: "18px 28px" }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: L.text }}>Leads</h1>
        <p style={{ fontSize: 13, color: L.muted }}>Everyone who's messaged in and been qualified by your AI chat.</p>
      </div>

      <div style={{ padding: "20px 28px 60px" }}>
        {loading ? (
          <p style={{ color: L.muted, fontSize: 13 }}>Loading…</p>
        ) : error ? (
          <p style={{ color: "#b91c1c", fontSize: 13 }}>{error}</p>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 20 }}>
              <StatCard label="Total leads" value={stats.total} />
              <StatCard label="Qualified" value={stats.qualified} />
              <StatCard label="Booked" value={stats.booked} />
              <StatCard label="Booked rate" value={`${stats.conversionRate}%`} highlight />
            </div>

            <div style={{ display: "flex", gap: 12, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {FILTERS.map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    style={{
                      padding: "6px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", border: "none",
                      background: filter === f.key ? "var(--red)" : "#e2e8f0",
                      color: filter === f.key ? "#fff" : L.muted,
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search job, location, phone…"
                style={{ flex: "1 1 220px", padding: "7px 12px", fontSize: 13, border: `1px solid ${L.border}` }}
              />
            </div>

            {filtered.length === 0 ? (
              <div style={{ background: L.surface, border: `1px solid ${L.border}`, padding: 32, textAlign: "center", color: L.muted, fontSize: 13 }}>
                {leads.length === 0 ? "No leads yet — they'll show up here as soon as someone messages your connected Page." : "No leads match that filter."}
              </div>
            ) : (
              <div style={{ background: L.surface, border: `1px solid ${L.border}`, overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${L.border}`, background: "#f8fafc" }}>
                      {["Job", "Contact", "Status", "Scheduled", "Received"].map((h) => (
                        <th key={h} style={{ textAlign: "left", padding: "10px 16px", fontSize: 11, fontWeight: 700, color: L.muted, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((lead) => {
                      const fields = lead.lq_conversations?.extracted_fields || {};
                      const style = OUTCOME_STYLE[lead.outcome] || { bg: "#f1f5f9", color: L.muted, label: lead.outcome };
                      return (
                        <tr key={lead.id} style={{ borderBottom: `1px solid ${L.border}` }}>
                          <td style={{ padding: "12px 16px" }}>
                            <p style={{ fontSize: 13.5, fontWeight: 700, color: L.text }}>{String(fields.job_type || "Job type unknown")}</p>
                            <p style={{ fontSize: 12, color: L.muted }}>{String(fields.location || "Location unknown")}</p>
                          </td>
                          <td style={{ padding: "12px 16px", fontSize: 12.5, color: L.text }}>
                            {String(fields.phone || lead.contact_email || "—")}
                          </td>
                          <td style={{ padding: "12px 16px" }}>
                            <span style={{ fontSize: 11.5, fontWeight: 700, color: style.color, background: style.bg, padding: "4px 10px", whiteSpace: "nowrap" }}>
                              {style.label}
                            </span>
                          </td>
                          <td style={{ padding: "12px 16px", fontSize: 12.5 }}>
                            {lead.booking_status === "booked" && lead.scheduled_at ? (
                              <span style={{ display: "flex", alignItems: "center", gap: 5, color: "#15803d", fontWeight: 600 }}>
                                <CheckCircle2 style={{ width: 13, height: 13 }} /> {new Date(lead.scheduled_at).toLocaleString("en-NZ", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                              </span>
                            ) : lead.booking_status === "failed" ? (
                              <span style={{ display: "flex", alignItems: "center", gap: 5, color: "#b91c1c", fontWeight: 600 }}>
                                <XCircle style={{ width: 13, height: 13 }} /> Book manually
                              </span>
                            ) : lead.outcome === "nurture" ? (
                              <span style={{ display: "flex", alignItems: "center", gap: 5, color: "#b45309", fontWeight: 600 }}>
                                <Clock style={{ width: 13, height: 13 }} /> Kept warm
                              </span>
                            ) : (
                              <span style={{ color: L.muted }}>—</span>
                            )}
                          </td>
                          <td style={{ padding: "12px 16px", fontSize: 12.5, color: L.muted, whiteSpace: "nowrap" }}>
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

function StatCard({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div style={{ background: highlight ? "var(--red)" : L.surface, border: `1px solid ${highlight ? "var(--red)" : L.border}`, padding: "14px 16px" }}>
      <p style={{ fontSize: 10.5, fontWeight: 700, color: highlight ? "rgba(255,255,255,0.85)" : L.muted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
        {label}
      </p>
      <p style={{ fontSize: 26, fontWeight: 800, color: highlight ? "#fff" : L.text }}>{value}</p>
    </div>
  );
}
