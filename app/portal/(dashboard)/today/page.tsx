"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, MessageCircle, Zap } from "lucide-react";
import { usePortalLeads } from "@/lib/hooks/usePortalLeads";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b" };

interface ImpactStats {
  messagesAutomated: number;
  adminTimeSavedMinutes: number;
  avgResponseSeconds: number | null;
  leadsHandled: number;
}

function formatTimeSaved(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = minutes / 60;
  return hours >= 10 ? `${Math.round(hours)}h` : `${hours.toFixed(1)}h`;
}

function formatResponseTime(seconds: number | null): string {
  if (seconds === null) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  return `${(seconds / 60).toFixed(1)}m`;
}

function useImpactStats(): { stats: ImpactStats | null } {
  const [stats, setStats] = useState<ImpactStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    function load() {
      fetch("/api/portal/impact")
        .then((r) => r.json())
        .then((body) => { if (!cancelled && !body.error) setStats(body); })
        .catch(() => {});
    }
    load();
    const interval = setInterval(load, 15000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  return { stats };
}

interface Lead {
  id: string;
  outcome: string;
  booking_status: string | null;
  scheduled_at: string | null;
  created_at: string;
  contact_email: string | null;
  lq_conversations: { extracted_fields: Record<string, unknown> } | null;
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

export default function PortalTodayPage() {
  const { leads, loading, error } = usePortalLeads<Lead>();
  const { stats: impact } = useImpactStats();

  const newToday = useMemo(
    () => leads.filter((l) => isToday(l.created_at)).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [leads]
  );

  const bookingsToday = useMemo(
    () =>
      leads
        .filter((l) => l.booking_status === "booked" && l.scheduled_at && isToday(l.scheduled_at))
        .sort((a, b) => new Date(a.scheduled_at as string).getTime() - new Date(b.scheduled_at as string).getTime()),
    [leads]
  );

  const stats = useMemo(() => {
    const qualifiedToday = newToday.filter((l) => l.outcome === "qualified").length;
    const needsReplyToday = newToday.filter((l) => l.outcome === "needs_human").length;
    return { newCount: newToday.length, qualifiedToday, needsReplyToday, bookingsCount: bookingsToday.length };
  }, [newToday, bookingsToday]);

  const todayLabel = new Date().toLocaleDateString("en-NZ", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div>
      <div className="portal-header-pad" style={{ background: "#fff", borderBottom: `1px solid ${L.border}`, padding: "18px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: L.text, textTransform: "uppercase", letterSpacing: "0.02em" }}>Today</h1>
          <p style={{ fontSize: 13, color: L.muted }}>{todayLabel}</p>
        </div>
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 700, color: "#15803d" }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />
          LIVE
        </span>
      </div>

      <div className="portal-page-pad" style={{ padding: "20px 28px 60px" }}>
        {loading ? (
          <p style={{ color: L.muted, fontSize: 13 }}>Loading…</p>
        ) : error ? (
          <p style={{ color: "#b91c1c", fontSize: 13 }}>{error}</p>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 24 }}>
              <StatCard label="New leads today" value={stats.newCount} />
              <StatCard label="Qualified today" value={stats.qualifiedToday} />
              <StatCard label="Needs a reply" value={stats.needsReplyToday} />
              <StatCard label="Bookings today" value={stats.bookingsCount} highlight />
            </div>

            {impact && (
              <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderTop: "3px solid #22c55e", padding: "14px 20px", marginBottom: 24, display: "flex", alignItems: "center", gap: 28, flexWrap: "wrap" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 800, color: L.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  <Zap style={{ width: 13, height: 13, color: "#22c55e" }} /> Operational impact
                </span>
                <ImpactStat value={impact.messagesAutomated} label="Messages automated" />
                <ImpactStat value={formatTimeSaved(impact.adminTimeSavedMinutes)} label="Admin time saved" />
                <ImpactStat value={formatResponseTime(impact.avgResponseSeconds)} label="Avg response time" />
                <ImpactStat value={impact.leadsHandled} label="Leads handled by AI" />
              </div>
            )}

            <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start" }}>
              <div style={{ flex: "1 1 360px" }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: L.muted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
                  New leads today
                </p>
                {newToday.length === 0 ? (
                  <div style={{ background: L.surface, border: `1px solid ${L.border}`, padding: 20, textAlign: "center", color: L.muted, fontSize: 12.5 }}>
                    Nothing has come in yet today.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {newToday.map((lead) => {
                      const fields = lead.lq_conversations?.extracted_fields || {};
                      return (
                        <div key={lead.id} style={{ background: L.surface, border: `1px solid ${L.border}`, borderLeft: "3px solid #1d4ed8", padding: "10px 12px", display: "flex", alignItems: "flex-start", gap: 10 }}>
                          <MessageCircle style={{ width: 14, height: 14, color: "#1d4ed8", marginTop: 2, flexShrink: 0 }} />
                          <div>
                            <p style={{ fontSize: 12.5, fontWeight: 700, color: L.text }}>{String(fields.job_type || "Job type unknown")}</p>
                            <p style={{ fontSize: 11.5, color: L.muted }}>{String(fields.location || "Location unknown")}</p>
                            <p style={{ fontSize: 11, color: L.muted, marginTop: 2 }}>
                              {new Date(lead.created_at).toLocaleTimeString("en-NZ", { hour: "numeric", minute: "2-digit" })}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div style={{ flex: "1 1 300px", maxWidth: 340 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: L.muted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
                  Today's bookings
                </p>
                {bookingsToday.length === 0 ? (
                  <div style={{ background: L.surface, border: `1px solid ${L.border}`, padding: 20, textAlign: "center", color: L.muted, fontSize: 12.5 }}>
                    Nothing booked in for today.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {bookingsToday.map((lead) => {
                      const fields = lead.lq_conversations?.extracted_fields || {};
                      return (
                        <div key={lead.id} style={{ background: L.surface, border: `1px solid ${L.border}`, borderLeft: "3px solid #15803d", padding: "10px 12px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <CheckCircle2 style={{ width: 13, height: 13, color: "#15803d", flexShrink: 0 }} />
                            <p style={{ fontSize: 12.5, fontWeight: 700, color: L.text }}>{String(fields.job_type || "Job")}</p>
                          </div>
                          <p style={{ fontSize: 11.5, color: L.muted, marginTop: 2 }}>{String(fields.location || "Location TBC")}</p>
                          <p style={{ fontSize: 11.5, color: "#15803d", fontWeight: 600, marginTop: 3 }}>
                            {new Date(lead.scheduled_at as string).toLocaleTimeString("en-NZ", { hour: "numeric", minute: "2-digit" })}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ImpactStat({ value, label }: { value: string | number; label: string }) {
  return (
    <span style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
      <span style={{ fontSize: 18, fontWeight: 800, color: L.text }}>{value}</span>
      <span style={{ fontSize: 12, color: L.muted }}>{label}</span>
    </span>
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
