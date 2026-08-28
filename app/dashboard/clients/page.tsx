"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Topbar from "@/components/Topbar";
import { ChevronDown, ChevronRight, Calendar, Mail, Columns3, Settings, CheckCircle2, XCircle } from "lucide-react";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };

interface LqClient {
  id: string;
  name: string;
  trade: string | null;
  logo_url: string | null;
  lq_calendar_connections: { google_account_email: string; connected_at: string } | null;
  lq_channels: { type: string; external_page_id: string }[] | null;
}

interface Lead {
  id: string;
  outcome: string;
  score: string | null;
  booking_status: string | null;
  contact_email: string | null;
  scheduled_at: string | null;
  pipeline_stage: string | null;
  created_at: string;
  lq_conversations: { extracted_fields: Record<string, unknown>; contact: Record<string, unknown> } | null;
}

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

interface EmailSend {
  id: string;
  lead_id: string | null;
  enrollment_id: string | null;
  step: number;
  to_email: string;
  subject: string;
  body: string;
  sent_at: string;
}

interface Overview {
  client: LqClient;
  leads: Lead[];
  enrollments: Enrollment[];
  emailSends: EmailSend[];
}

const STAGES = [
  { key: "new_inquiry", label: "New Inquiry", color: "#1d4ed8", bg: "#eff6ff" },
  { key: "followed_up", label: "Followed Up", color: "#7c3aed", bg: "#f5f3ff" },
  { key: "not_ready", label: "Not Ready Yet", color: "#b45309", bg: "#fffbeb" },
  { key: "booked", label: "Booked", color: "#15803d", bg: "#f0fdf4" },
  { key: "not_a_fit", label: "Not a Fit", color: "#64748b", bg: "#f1f5f9" },
] as const;

const ENROLLMENT_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  active: { bg: "#eff6ff", color: "#1d4ed8", label: "In sequence" },
  booked: { bg: "#f0fdf4", color: "#15803d", label: "Booked" },
  completed: { bg: "#f1f5f9", color: "#64748b", label: "No reply" },
  stopped: { bg: "#f1f5f9", color: "#64748b", label: "Stopped" },
};

function stageFor(lead: Lead): string {
  if (lead.pipeline_stage) return lead.pipeline_stage;
  if (lead.outcome === "disqualified") return "not_a_fit";
  if (lead.outcome === "nurture") return "not_ready";
  if (lead.outcome === "qualified" && lead.booking_status === "booked") return "booked";
  return "new_inquiry";
}

const TABS = [
  { key: "calendar", label: "Calendar", icon: Calendar },
  { key: "emails", label: "Emails", icon: Mail },
  { key: "pipeline", label: "Pipeline", icon: Columns3 },
] as const;
type TabKey = typeof TABS[number]["key"];

export default function ClientsPage() {
  const [clients, setClients] = useState<LqClient[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [tab, setTab] = useState<TabKey>("calendar");
  const [expandedEmailId, setExpandedEmailId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/lead-qual/clients");
      const body = await res.json();
      const list: LqClient[] = res.ok ? body.clients : [];
      setClients(list);
      if (list.length > 0) setSelectedId(list[0].id);
    })();
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setLoadingOverview(true);
    fetch(`/api/lead-qual/clients/${selectedId}/overview`)
      .then((r) => r.json())
      .then((body) => setOverview(body))
      .finally(() => setLoadingOverview(false));
  }, [selectedId]);

  const selectedClient = clients.find((c) => c.id === selectedId) || null;

  const bookings = useMemo(() => {
    if (!overview) return [];
    return overview.leads
      .filter((l) => l.scheduled_at)
      .sort((a, b) => new Date(b.scheduled_at as string).getTime() - new Date(a.scheduled_at as string).getTime());
  }, [overview]);

  const leadNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const lead of overview?.leads || []) {
      const fields = lead.lq_conversations?.extracted_fields || {};
      map[lead.id] = String(fields.name || lead.contact_email || "Lead");
    }
    return map;
  }, [overview]);

  const byStage = useMemo(() => {
    const map: Record<string, Lead[]> = {};
    for (const s of STAGES) map[s.key] = [];
    for (const lead of overview?.leads || []) map[stageFor(lead)].push(lead);
    return map;
  }, [overview]);

  return (
    <div style={{ background: "#f1f5f9", minHeight: "100vh" }}>
      <Topbar title="Clients" subtitle="Pick a client to see their calendar, email sequence and pipeline" />

      <div style={{ padding: "20px 28px 60px", display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Client dropdown */}
        <div style={{ position: "relative", width: "fit-content" }}>
          <button
            onClick={() => setPickerOpen((v) => !v)}
            style={{
              display: "flex", alignItems: "center", gap: 10, background: L.surface, border: `1px solid ${L.border}`,
              borderRadius: 10, padding: "10px 14px", cursor: "pointer", minWidth: 260,
            }}
          >
            <div style={{ width: 28, height: 28, borderRadius: 8, background: "#f1f5f9", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: L.text, overflow: "hidden" }}>
              {selectedClient?.logo_url ? (
                <img src={selectedClient.logo_url} alt={selectedClient.name} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
              ) : (
                (selectedClient?.name || "?").slice(0, 2).toUpperCase()
              )}
            </div>
            <div style={{ textAlign: "left", flex: 1 }}>
              <p style={{ fontSize: 13.5, fontWeight: 700, color: L.text }}>{selectedClient?.name || "Select a client"}</p>
              <p style={{ fontSize: 11, color: L.muted }}>{selectedClient?.trade || ""}</p>
            </div>
            <ChevronDown style={{ width: 15, height: 15, color: L.dimmed }} />
          </button>

          {pickerOpen && (
            <>
              <div style={{ position: "fixed", inset: 0, zIndex: 20 }} onClick={() => setPickerOpen(false)} />
              <div style={{
                position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 21, width: 320, maxHeight: 360, overflowY: "auto",
                background: L.surface, border: `1px solid ${L.border}`, borderRadius: 10, boxShadow: "0 12px 32px rgba(15,23,42,0.14)",
              }}>
                {clients.map((c) => {
                  const calendarConnected = !!c.lq_calendar_connections;
                  const fbConnected = !!c.lq_channels?.some((ch) => ch.type === "messenger");
                  return (
                    <button
                      key={c.id}
                      onClick={() => {
                        setSelectedId(c.id);
                        setPickerOpen(false);
                      }}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%",
                        padding: "10px 14px", border: "none", background: c.id === selectedId ? "var(--accent-tint)" : "transparent",
                        cursor: "pointer", textAlign: "left", borderBottom: `1px solid ${L.border}`,
                      }}
                    >
                      <div>
                        <p style={{ fontSize: 13, fontWeight: 700, color: L.text }}>{c.name}</p>
                        <p style={{ fontSize: 11, color: L.muted }}>{c.trade || "No trade set"}</p>
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        {calendarConnected ? <CheckCircle2 style={{ width: 13, height: 13, color: "#15803d" }} /> : <XCircle style={{ width: 13, height: 13, color: "#e2e8f0" }} />}
                        {fbConnected ? <CheckCircle2 style={{ width: 13, height: 13, color: "#15803d" }} /> : <XCircle style={{ width: 13, height: 13, color: "#e2e8f0" }} />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {!selectedId ? (
          <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 10, padding: 32, textAlign: "center", color: L.dimmed, fontSize: 13 }}>
            No clients yet — add one under Onboarding first.
          </div>
        ) : (
          <>
            {/* Status strip */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: 16, fontSize: 12, color: L.muted }}>
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  {overview?.client.lq_calendar_connections ? <CheckCircle2 style={{ width: 13, height: 13, color: "#15803d" }} /> : <XCircle style={{ width: 13, height: 13, color: "#cbd5e1" }} />}
                  Calendar {overview?.client.lq_calendar_connections ? `connected (${overview.client.lq_calendar_connections.google_account_email})` : "not connected"}
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  {overview?.client.lq_channels?.some((c) => c.type === "messenger") ? <CheckCircle2 style={{ width: 13, height: 13, color: "#15803d" }} /> : <XCircle style={{ width: 13, height: 13, color: "#cbd5e1" }} />}
                  Facebook connected
                </span>
              </div>
              <Link href={`/dashboard/lead-qual/${selectedId}`} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 700, color: "var(--accent)", textDecoration: "none" }}>
                <Settings style={{ width: 13, height: 13 }} /> Manage setup
              </Link>
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", gap: 4 }}>
              {TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  style={{
                    display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", border: "none",
                    background: tab === t.key ? "var(--accent)" : "#e2e8f0",
                    color: tab === t.key ? "#fff" : L.muted,
                  }}
                >
                  <t.icon style={{ width: 13, height: 13 }} /> {t.label}
                </button>
              ))}
            </div>

            {loadingOverview ? (
              <p style={{ color: L.dimmed, fontSize: 13 }}>Loading…</p>
            ) : (
              <>
                {tab === "calendar" && (
                  <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 10, overflow: "hidden" }}>
                    {bookings.length === 0 ? (
                      <p style={{ padding: 24, textAlign: "center", color: L.dimmed, fontSize: 13 }}>No bookings yet.</p>
                    ) : (
                      bookings.map((lead) => {
                        const fields = lead.lq_conversations?.extracted_fields || {};
                        const isPast = new Date(lead.scheduled_at as string).getTime() < Date.now();
                        return (
                          <div key={lead.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${L.border}`, opacity: isPast ? 0.55 : 1, flexWrap: "wrap", gap: 8 }}>
                            <div>
                              <p style={{ fontSize: 13.5, fontWeight: 700, color: L.text }}>
                                {String(fields.name || fields.job_type || "Booking")}
                              </p>
                              <p style={{ fontSize: 12, color: L.muted }}>
                                {String(fields.job_type || "")}{fields.location ? ` · ${String(fields.location)}` : ""}{fields.phone ? ` · ${String(fields.phone)}` : lead.contact_email ? ` · ${lead.contact_email}` : ""}
                              </p>
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 700, color: isPast ? L.dimmed : "#15803d" }}>
                              {new Date(lead.scheduled_at as string).toLocaleString("en-NZ", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}

                {tab === "emails" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 10, overflow: "hidden" }}>
                      <p style={{ padding: "12px 16px", fontSize: 11.5, fontWeight: 700, color: L.dimmed, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: `1px solid ${L.border}` }}>Sequences</p>
                      {(overview?.enrollments.length ?? 0) === 0 ? (
                        <p style={{ padding: 24, textAlign: "center", color: L.dimmed, fontSize: 13 }}>No email sequences running.</p>
                      ) : (
                        overview!.enrollments.map((e) => {
                          const style = ENROLLMENT_STYLE[e.status] || { bg: "#f1f5f9", color: L.muted, label: e.status };
                          const fields = e.lq_leads?.lq_conversations?.extracted_fields || {};
                          const totalSteps = e.lq_nurture_sequences?.steps?.length || 0;
                          return (
                            <div key={e.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${L.border}`, flexWrap: "wrap", gap: 8 }}>
                              <div>
                                <p style={{ fontSize: 13.5, fontWeight: 700, color: L.text }}>
                                  {String(fields.name || e.contact_email || e.lq_leads?.contact_email || "Lead")}
                                </p>
                                <p style={{ fontSize: 12, color: L.muted }}>
                                  Step {e.current_step}{totalSteps ? ` of ${totalSteps}` : ""}{e.next_send_at ? ` · next email ${new Date(e.next_send_at).toLocaleString("en-NZ", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}` : ""}
                                </p>
                              </div>
                              <span style={{ fontSize: 11, fontWeight: 700, color: style.color, background: style.bg, padding: "3px 10px", borderRadius: 20 }}>{style.label}</span>
                            </div>
                          );
                        })
                      )}
                    </div>

                    <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 10, overflow: "hidden" }}>
                      <p style={{ padding: "12px 16px", fontSize: 11.5, fontWeight: 700, color: L.dimmed, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: `1px solid ${L.border}` }}>
                        Emails sent ({overview?.emailSends.length ?? 0})
                      </p>
                      {(overview?.emailSends.length ?? 0) === 0 ? (
                        <p style={{ padding: 24, textAlign: "center", color: L.dimmed, fontSize: 13 }}>No emails sent to this client&apos;s leads yet.</p>
                      ) : (
                        overview!.emailSends.map((send) => {
                          const expanded = expandedEmailId === send.id;
                          const leadName = (send.lead_id && leadNameById[send.lead_id]) || send.to_email;
                          return (
                            <div key={send.id} style={{ borderBottom: `1px solid ${L.border}` }}>
                              <button
                                onClick={() => setExpandedEmailId(expanded ? null : send.id)}
                                style={{
                                  display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%",
                                  padding: "14px 16px", border: "none", background: "transparent", cursor: "pointer", textAlign: "left", gap: 10,
                                }}
                              >
                                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                                  {expanded ? <ChevronDown style={{ width: 13, height: 13, color: L.dimmed, flexShrink: 0 }} /> : <ChevronRight style={{ width: 13, height: 13, color: L.dimmed, flexShrink: 0 }} />}
                                  <div style={{ minWidth: 0 }}>
                                    <p style={{ fontSize: 13.5, fontWeight: 700, color: L.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{send.subject}</p>
                                    <p style={{ fontSize: 12, color: L.muted }}>To {leadName} ({send.to_email}) · step {send.step + 1}</p>
                                  </div>
                                </div>
                                <span style={{ fontSize: 11.5, color: L.dimmed, flexShrink: 0 }}>
                                  {new Date(send.sent_at).toLocaleString("en-NZ", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                                </span>
                              </button>
                              {expanded && (
                                <div style={{ padding: "0 16px 16px 39px", fontSize: 13, color: L.text, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                                  {send.body}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}

                {tab === "pipeline" && (
                  <div style={{ display: "flex", gap: 14, overflowX: "auto", alignItems: "flex-start" }}>
                    {STAGES.map((stage) => {
                      const stageLeads = byStage[stage.key] || [];
                      return (
                        <div key={stage.key} style={{ flex: "1 1 220px", minWidth: 220 }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, padding: "0 2px" }}>
                            <p style={{ fontSize: 12.5, fontWeight: 700, color: L.text }}>{stage.label}</p>
                            <span style={{ fontSize: 11.5, fontWeight: 700, color: stage.color, background: stage.bg, padding: "2px 8px" }}>{stageLeads.length}</span>
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {stageLeads.length === 0 ? (
                              <div style={{ border: `1px dashed ${L.border}`, padding: 16, textAlign: "center", color: "#cbd5e1", fontSize: 12, borderRadius: 6 }}>Empty</div>
                            ) : (
                              stageLeads.map((lead) => {
                                const fields = lead.lq_conversations?.extracted_fields || {};
                                return (
                                  <div key={lead.id} style={{ background: L.surface, border: `1px solid ${L.border}`, borderLeft: `3px solid ${stage.color}`, padding: "10px 12px", borderRadius: 6 }}>
                                    <p style={{ fontSize: 12.5, fontWeight: 700, color: L.text }}>
                                      {fields.name ? `${String(fields.name)} — ${String(fields.job_type || "Job type unknown")}` : String(fields.job_type || "Job type unknown")}
                                    </p>
                                    <p style={{ fontSize: 11.5, color: L.muted }}>{String(fields.location || "Location unknown")}</p>
                                    <p style={{ fontSize: 10.5, color: "#94a3b8", marginTop: 4 }}>{new Date(lead.created_at).toLocaleDateString("en-NZ")}</p>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
