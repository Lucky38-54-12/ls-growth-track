"use client";

import { useMemo } from "react";
import { Mail, CheckCircle2, Clock } from "lucide-react";
import { usePortalLeads } from "@/lib/hooks/usePortalLeads";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b" };

interface NurtureStep {
  delay_hours: number;
  subject: string;
  body_template: string;
}

interface Enrollment {
  id: string;
  current_step: number;
  status: "active" | "booked" | "completed" | "stopped";
  next_send_at: string | null;
  enrolled_at: string;
  contact_email: string | null;
  lq_leads: { id: string; contact_email: string | null; created_at: string; lq_conversations: { extracted_fields: Record<string, unknown> } | null } | null;
  lq_nurture_sequences: { steps: NurtureStep[] } | null;
}

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  active: { bg: "#eff6ff", color: "#1d4ed8", label: "In sequence" },
  booked: { bg: "#f0fdf4", color: "#15803d", label: "Booked" },
  completed: { bg: "#f1f5f9", color: "#64748b", label: "No reply" },
  stopped: { bg: "#f1f5f9", color: "#64748b", label: "Stopped" },
};

export default function PortalEmailSequencePage() {
  const { leads: enrollments, loading, error } = usePortalLeads<Enrollment>({ url: "/api/portal/nurture", key: "enrollments" });

  const stats = useMemo(() => {
    const total = enrollments.length;
    const active = enrollments.filter((e) => e.status === "active").length;
    const booked = enrollments.filter((e) => e.status === "booked").length;
    const emailsSent = enrollments.reduce((sum, e) => sum + e.current_step, 0);
    return { total, active, booked, emailsSent };
  }, [enrollments]);

  return (
    <div>
      <div style={{ background: "#fff", borderBottom: `1px solid ${L.border}`, padding: "18px 28px" }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: L.text }}>Email sequence</h1>
        <p style={{ fontSize: 13, color: L.muted }}>Follow-up emails going out to people who weren't ready to book yet.</p>
      </div>

      <div style={{ padding: "20px 28px 60px" }}>
        {loading ? (
          <p style={{ color: L.muted, fontSize: 13 }}>Loading…</p>
        ) : error ? (
          <p style={{ color: "#b91c1c", fontSize: 13 }}>{error}</p>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 20 }}>
              <StatCard label="Enrolled" value={stats.total} />
              <StatCard label="In sequence" value={stats.active} />
              <StatCard label="Booked from sequence" value={stats.booked} highlight />
              <StatCard label="Emails sent" value={stats.emailsSent} />
            </div>

            {enrollments.length === 0 ? (
              <div style={{ background: L.surface, border: `1px solid ${L.border}`, padding: 32, textAlign: "center", color: L.muted, fontSize: 13 }}>
                No one's in the follow-up sequence right now — leads land here when they're not ready to book yet.
              </div>
            ) : (
              <div style={{ background: L.surface, border: `1px solid ${L.border}`, overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${L.border}`, background: "#f8fafc" }}>
                      {["Job", "Contact", "Progress", "Last email", "Status", "Next send"].map((h) => (
                        <th key={h} style={{ textAlign: "left", padding: "10px 16px", fontSize: 11, fontWeight: 700, color: L.muted, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {enrollments.map((e) => {
                      const fields = e.lq_leads?.lq_conversations?.extracted_fields || {};
                      const steps = e.lq_nurture_sequences?.steps || [];
                      const total = steps.length;
                      const lastSentStep = e.current_step > 0 ? steps[e.current_step - 1] : null;
                      const style = STATUS_STYLE[e.status] || { bg: "#f1f5f9", color: L.muted, label: e.status };
                      return (
                        <tr key={e.id} style={{ borderBottom: `1px solid ${L.border}` }}>
                          <td style={{ padding: "12px 16px" }}>
                            <p style={{ fontSize: 13.5, fontWeight: 700, color: L.text }}>{String(fields.job_type || "Job type unknown")}</p>
                            <p style={{ fontSize: 12, color: L.muted }}>{String(fields.location || "Location unknown")}</p>
                          </td>
                          <td style={{ padding: "12px 16px", fontSize: 12.5, color: L.text }}>
                            {e.contact_email || e.lq_leads?.contact_email || "—"}
                          </td>
                          <td style={{ padding: "12px 16px", fontSize: 12.5, color: L.text }}>
                            {total > 0 ? `${Math.min(e.current_step, total)} of ${total} sent` : "—"}
                          </td>
                          <td style={{ padding: "12px 16px", fontSize: 12.5, color: L.text, maxWidth: 220 }}>
                            {lastSentStep ? (
                              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                <Mail style={{ width: 12, height: 12, color: L.muted, flexShrink: 0 }} />
                                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lastSentStep.subject}</span>
                              </span>
                            ) : (
                              <span style={{ color: L.muted }}>Not sent yet</span>
                            )}
                          </td>
                          <td style={{ padding: "12px 16px" }}>
                            <span style={{ fontSize: 11.5, fontWeight: 700, color: style.color, background: style.bg, padding: "4px 10px", whiteSpace: "nowrap" }}>
                              {style.label}
                            </span>
                          </td>
                          <td style={{ padding: "12px 16px", fontSize: 12.5 }}>
                            {e.status === "active" && e.next_send_at ? (
                              <span style={{ display: "flex", alignItems: "center", gap: 5, color: L.text, fontWeight: 600 }}>
                                <Clock style={{ width: 13, height: 13, color: L.muted }} />
                                {new Date(e.next_send_at).toLocaleString("en-NZ", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                              </span>
                            ) : e.status === "booked" ? (
                              <span style={{ display: "flex", alignItems: "center", gap: 5, color: "#15803d", fontWeight: 600 }}>
                                <CheckCircle2 style={{ width: 13, height: 13 }} /> Pulled out — booked
                              </span>
                            ) : (
                              <span style={{ color: L.muted }}>—</span>
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
