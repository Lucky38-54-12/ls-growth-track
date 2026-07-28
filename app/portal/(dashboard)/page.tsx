"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, XCircle, Clock, Search, Mail, Phone, MoreHorizontal } from "lucide-react";
import { usePortalLeads } from "@/lib/hooks/usePortalLeads";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b" };

interface Lead {
  id: string;
  outcome: string;
  booking_status: string | null;
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

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export default function PortalLeadsPage() {
  const { leads, loading, error } = usePortalLeads<Lead>();
  const [clientName, setClientName] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/portal/me")
      .then((r) => r.json())
      .then((body) => setClientName(body.client?.name || ""))
      .catch(() => {});
  }, []);

  useEffect(() => {
    function closeMenu() {
      setOpenMenu(null);
    }
    window.addEventListener("click", closeMenu);
    return () => window.removeEventListener("click", closeMenu);
  }, []);

  const stats = useMemo(() => {
    const total = leads.length;
    const now = Date.now();
    return {
      total,
      qualified: leads.filter((l) => l.outcome === "qualified").length,
      nurture: leads.filter((l) => l.outcome === "nurture").length,
      needsHuman: leads.filter((l) => l.outcome === "needs_human").length,
      disqualified: leads.filter((l) => l.outcome === "disqualified").length,
      newThisWeek: leads.filter((l) => now - new Date(l.created_at).getTime() < WEEK_MS).length,
    };
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

  const allSelected = filtered.length > 0 && filtered.every((l) => selected.has(l.id));

  function toggleAll() {
    setSelected((prev) => {
      if (allSelected) return new Set();
      return new Set(filtered.map((l) => l.id));
    });
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div>
      <div
        style={{
          position: "relative",
          overflow: "hidden",
          background: "linear-gradient(120deg, #0f172a 0%, var(--red) 160%)",
          color: "#fff",
          padding: "28px 32px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 20,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 52, height: 52, borderRadius: 8, background: "rgba(255,255,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 800, flexShrink: 0 }}>
            {(clientName || "LS").slice(0, 2).toUpperCase()}
          </div>
          <div>
            <p style={{ fontSize: 22, fontWeight: 900, letterSpacing: "0.02em" }}>LEADS</p>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.75)" }}>{clientName || "Your dashboard"}</p>
          </div>
        </div>

        <div style={{ display: "flex", gap: 32 }}>
          <BannerStat value={stats.total} label="Total" />
          <BannerStat value={stats.qualified} label="Qualified" />
          <BannerStat value={stats.needsHuman} label="Need reply" />
        </div>
      </div>

      <div style={{ padding: "24px 32px 60px" }}>
        {loading ? (
          <p style={{ color: L.muted, fontSize: 13 }}>Loading…</p>
        ) : error ? (
          <p style={{ color: "#b91c1c", fontSize: 13 }}>{error}</p>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 24 }}>
              <StatCard label="Total leads" value={stats.total} accent="#64748b" />
              <StatCard label="Qualified" value={stats.qualified} accent="#15803d" />
              <StatCard label="Not ready yet" value={stats.nurture} accent="#b45309" />
              <StatCard label="Needs a reply" value={stats.needsHuman} accent="#1d4ed8" />
              <StatCard label="Not a fit" value={stats.disqualified} accent="#64748b" />
              <StatCard label="New this week" value={stats.newThisWeek} highlight />
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
                      padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer",
                      background: filter === f.key ? "#fff" : "#f1f5f9",
                      color: filter === f.key ? "var(--red)" : L.muted,
                      border: filter === f.key ? "1px solid var(--red)" : "1px solid transparent",
                      borderRadius: 4,
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <p style={{ fontSize: 13, color: L.muted, marginBottom: 10 }}>
              {selected.size > 0 ? (
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {selected.size} selected
                  <button
                    onClick={() => setSelected(new Set())}
                    style={{ background: "none", border: "none", color: "var(--red)", fontWeight: 700, cursor: "pointer", fontSize: 13, padding: 0 }}
                  >
                    Clear
                  </button>
                </span>
              ) : (
                `Showing ${filtered.length} of ${leads.length}`
              )}
            </p>

            {filtered.length === 0 ? (
              <div style={{ background: L.surface, border: `1px solid ${L.border}`, padding: 32, textAlign: "center", color: L.muted, fontSize: 13 }}>
                {leads.length === 0 ? "No leads yet — they'll show up here as soon as someone messages your connected Page." : "No leads match that filter."}
              </div>
            ) : (
              <div style={{ background: L.surface, border: `1px solid ${L.border}`, overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${L.border}`, background: "#f8fafc" }}>
                      <th style={{ padding: "12px 18px", width: 36 }}>
                        <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                      </th>
                      {["Contact", "Details", "Status", "Scheduled", "Received", ""].map((h) => (
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
                      const phone = fields.phone ? String(fields.phone) : null;
                      const style = OUTCOME_STYLE[lead.outcome] || { bg: "#f1f5f9", color: L.muted, label: lead.outcome };
                      const initials = jobType.slice(0, 2).toUpperCase();
                      const isSelected = selected.has(lead.id);
                      return (
                        <tr key={lead.id} style={{ borderBottom: `1px solid ${L.border}`, background: isSelected ? "#f8fafc" : undefined }}>
                          <td style={{ padding: "16px 18px" }}>
                            <input type="checkbox" checked={isSelected} onChange={() => toggleOne(lead.id)} />
                          </td>
                          <td style={{ padding: "16px 18px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                              <div style={{ width: 38, height: 38, borderRadius: "50%", flexShrink: 0, background: style.bg, color: style.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800 }}>
                                {initials}
                              </div>
                              <div>
                                <p style={{ fontSize: 15, fontWeight: 700, color: L.text }}>{jobType}</p>
                                <p style={{ fontSize: 13, color: L.muted }}>{phone || lead.contact_email || "No contact"}</p>
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: "16px 18px", fontSize: 14, color: L.text }}>
                            {String(fields.location || "Location unknown")}
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
                          <td style={{ padding: "16px 18px", position: "relative" }}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenMenu((prev) => (prev === lead.id ? null : lead.id));
                              }}
                              style={{ background: "none", border: "none", cursor: "pointer", color: L.muted, padding: 4, display: "flex" }}
                            >
                              <MoreHorizontal style={{ width: 18, height: 18 }} />
                            </button>
                            {openMenu === lead.id && (
                              <div
                                onClick={(e) => e.stopPropagation()}
                                style={{ position: "absolute", right: 18, top: 40, zIndex: 10, background: "#fff", border: `1px solid ${L.border}`, minWidth: 160, boxShadow: "0 8px 20px rgba(15,23,42,0.12)" }}
                              >
                                {lead.contact_email && (
                                  <a href={`mailto:${lead.contact_email}`} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", fontSize: 13, color: L.text, textDecoration: "none" }}>
                                    <Mail style={{ width: 14, height: 14 }} /> Email
                                  </a>
                                )}
                                {phone && (
                                  <a href={`tel:${phone}`} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", fontSize: 13, color: L.text, textDecoration: "none" }}>
                                    <Phone style={{ width: 14, height: 14 }} /> Call
                                  </a>
                                )}
                                {!lead.contact_email && !phone && (
                                  <p style={{ padding: "10px 14px", fontSize: 13, color: L.muted }}>No contact info</p>
                                )}
                              </div>
                            )}
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

function BannerStat({ value, label }: { value: number; label: string }) {
  return (
    <div style={{ textAlign: "right" }}>
      <p style={{ fontSize: 28, fontWeight: 900, lineHeight: 1 }}>{value}</p>
      <p style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.7)", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 4 }}>{label}</p>
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
