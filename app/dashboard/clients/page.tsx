"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Topbar from "@/components/Topbar";
import { ChevronDown, ChevronRight, ChevronLeft, Calendar, Mail, Columns3, Settings, CheckCircle2, XCircle } from "lucide-react";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Monday-first grid, including the leading/trailing days from adjacent
// months needed to fill whole weeks.
function buildMonthGrid(monthStart: Date): Date[] {
  const firstWeekday = (monthStart.getDay() + 6) % 7; // 0 = Monday
  const gridStart = new Date(monthStart);
  gridStart.setDate(gridStart.getDate() - firstWeekday);

  const days: Date[] = [];
  const cursor = new Date(gridStart);
  for (let i = 0; i < 42; i++) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

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
  audience: "client" | "lead";
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
  return (
    <Suspense fallback={null}>
      <ClientsPageInner />
    </Suspense>
  );
}

const VALID_TABS = new Set<TabKey>(["calendar", "emails", "pipeline"]);

function ClientsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [clients, setClients] = useState<LqClient[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get("client"));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(false);
  const initialTab = searchParams.get("tab");
  const [tab, setTab] = useState<TabKey>(initialTab && VALID_TABS.has(initialTab as TabKey) ? (initialTab as TabKey) : "calendar");
  const [expandedEmailId, setExpandedEmailId] = useState<string | null>(null);
  const [monthStart, setMonthStart] = useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const todayKey = dateKey(new Date());
  const [selectedDay, setSelectedDay] = useState(todayKey);

  // Selecting a client or switching tabs writes into the URL (?client=&tab=)
  // so refreshing — or coming back later — lands back on the same client
  // instead of resetting to the first one in the list.
  function selectClient(id: string) {
    setSelectedId(id);
    setPickerOpen(false);
    const params = new URLSearchParams(searchParams.toString());
    params.set("client", id);
    router.replace(`/dashboard/clients?${params.toString()}`, { scroll: false });
  }

  function selectTab(key: TabKey) {
    setTab(key);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", key);
    router.replace(`/dashboard/clients?${params.toString()}`, { scroll: false });
  }

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/lead-qual/clients");
      const body = await res.json();
      const list: LqClient[] = res.ok ? body.clients : [];
      setClients(list);
      const fromUrl = searchParams.get("client");
      if (fromUrl && list.some((c) => c.id === fromUrl)) {
        setSelectedId(fromUrl);
      } else if (list.length > 0) {
        selectClient(list[0].id);
      }
    })();
    // Only run once on mount — selection changes afterwards go through selectClient/selectTab.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      .sort((a, b) => new Date(a.scheduled_at as string).getTime() - new Date(b.scheduled_at as string).getTime());
  }, [overview]);

  const bookingsByDay = useMemo(() => {
    const map: Record<string, Lead[]> = {};
    for (const lead of bookings) (map[dateKey(new Date(lead.scheduled_at as string))] ||= []).push(lead);
    return map;
  }, [bookings]);

  const monthGrid = useMemo(() => buildMonthGrid(monthStart), [monthStart]);
  const selectedDayBookings = bookingsByDay[selectedDay] || [];

  const leadNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const lead of overview?.leads || []) {
      const fields = lead.lq_conversations?.extracted_fields || {};
      map[lead.id] = String(fields.name || lead.contact_email || "Lead");
    }
    return map;
  }, [overview]);

  const clientEmails = useMemo(() => (overview?.emailSends || []).filter((s) => s.audience === "client"), [overview]);
  const leadEmails = useMemo(() => (overview?.emailSends || []).filter((s) => s.audience !== "client"), [overview]);

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
                      onClick={() => selectClient(c.id)}
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
                  onClick={() => selectTab(t.key)}
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
                  <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 480, background: L.surface, border: `1px solid ${L.border}` }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${L.border}` }}>
                        <h2 style={{ fontSize: 15, fontWeight: 800, color: L.text }}>
                          {monthStart.toLocaleDateString("en-NZ", { month: "long", year: "numeric" })}
                        </h2>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            type="button"
                            onClick={() => {
                              const d = new Date();
                              d.setDate(1);
                              d.setHours(0, 0, 0, 0);
                              setMonthStart(d);
                              setSelectedDay(todayKey);
                            }}
                            style={{ padding: "6px 12px", fontSize: 11.5, fontWeight: 700, border: `1px solid ${L.border}`, background: L.surface, color: L.muted, cursor: "pointer" }}
                          >
                            Today
                          </button>
                          <button
                            type="button"
                            onClick={() => setMonthStart((prev) => { const n = new Date(prev); n.setMonth(n.getMonth() - 1); return n; })}
                            style={{ width: 32, height: 32, border: `1px solid ${L.border}`, background: L.surface, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                          >
                            <ChevronLeft style={{ width: 14, height: 14, color: L.muted }} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setMonthStart((prev) => { const n = new Date(prev); n.setMonth(n.getMonth() + 1); return n; })}
                            style={{ width: 32, height: 32, border: `1px solid ${L.border}`, background: L.surface, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                          >
                            <ChevronRight style={{ width: 14, height: 14, color: L.muted }} />
                          </button>
                        </div>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
                        {WEEKDAYS.map((d) => (
                          <div key={d} style={{ padding: "8px 10px", fontSize: 10, fontWeight: 700, color: L.dimmed, textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: `1px solid ${L.border}` }}>
                            {d}
                          </div>
                        ))}
                        {monthGrid.map((day, i) => {
                          const key = dateKey(day);
                          const inMonth = day.getMonth() === monthStart.getMonth();
                          const dayBookings = bookingsByDay[key] || [];
                          const isToday = key === todayKey;
                          const isSelected = key === selectedDay;
                          return (
                            <div
                              key={i}
                              onClick={() => setSelectedDay(key)}
                              className="row-hover"
                              style={{
                                minHeight: 92, padding: 8, borderBottom: `1px solid ${L.border}`, borderRight: (i + 1) % 7 === 0 ? "none" : `1px solid ${L.border}`,
                                background: isSelected ? "var(--accent-tint)" : L.surface, opacity: inMonth ? 1 : 0.4, cursor: "pointer",
                              }}
                            >
                              <span style={{
                                display: "inline-flex", alignItems: "center", justifyContent: "center",
                                width: 22, height: 22, fontSize: 12, fontWeight: isToday ? 800 : 600,
                                color: isToday ? "#fff" : L.text, background: isToday ? "var(--accent)" : "transparent",
                                borderRadius: isToday ? "50%" : 0,
                              }}>{day.getDate()}</span>
                              <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 2 }}>
                                {dayBookings.slice(0, 2).map((lead) => {
                                  const fields = lead.lq_conversations?.extracted_fields || {};
                                  return (
                                    <div key={lead.id} style={{ fontSize: 10.5, fontWeight: 600, color: "#15803d", background: "#f0fdf4", padding: "2px 5px", whiteSpace: "normal", wordBreak: "break-word", lineHeight: 1.3 }}>
                                      {new Date(lead.scheduled_at as string).toLocaleTimeString("en-NZ", { hour: "numeric", minute: "2-digit" })} {String(fields.name || fields.job_type || "Booking")}
                                    </div>
                                  );
                                })}
                                {dayBookings.length > 2 && (
                                  <div style={{ fontSize: 10, color: L.dimmed, fontWeight: 600, padding: "0 5px" }}>+{dayBookings.length - 2} more</div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div style={{ width: 320, flexShrink: 0, background: L.surface, border: `1px solid ${L.border}` }}>
                      <div style={{ padding: "14px 16px", borderBottom: `1px solid ${L.border}` }}>
                        <h3 style={{ fontSize: 13, fontWeight: 800, color: L.text }}>
                          {new Date(`${selectedDay}T00:00:00`).toLocaleDateString("en-NZ", { weekday: "long", day: "numeric", month: "long" })}
                        </h3>
                        {selectedDay === todayKey && <p style={{ fontSize: 11, color: "var(--accent)", fontWeight: 700, marginTop: 2 }}>Today</p>}
                      </div>
                      <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                        {selectedDayBookings.length === 0 ? (
                          <p style={{ fontSize: 12, color: L.dimmed }}>No jobs booked this day.</p>
                        ) : (
                          selectedDayBookings.map((lead) => {
                            const fields = lead.lq_conversations?.extracted_fields || {};
                            const isPast = new Date(lead.scheduled_at as string).getTime() < Date.now();
                            return (
                              <div key={lead.id} style={{ border: `1px solid ${L.border}`, borderLeft: `3px solid ${isPast ? "#94a3b8" : "#15803d"}`, padding: 10 }}>
                                <p style={{ fontSize: 13, fontWeight: 700, color: L.text }}>{String(fields.name || fields.job_type || "Booking")}</p>
                                {!!(fields.job_type && fields.name) && <p style={{ fontSize: 12, color: L.muted, marginTop: 2 }}>{String(fields.job_type)}</p>}
                                <p style={{ fontSize: 12, color: L.muted, marginTop: 2 }}>{String(fields.location || "Location TBC")}</p>
                                <p style={{ fontSize: 11.5, color: isPast ? L.dimmed : "#15803d", fontWeight: 600, marginTop: 6 }}>
                                  {new Date(lead.scheduled_at as string).toLocaleTimeString("en-NZ", { hour: "numeric", minute: "2-digit" })}
                                </p>
                                {(fields.phone || lead.contact_email) && (
                                  <p style={{ fontSize: 11.5, color: L.muted, marginTop: 4 }}>{String(fields.phone || lead.contact_email)}</p>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
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
                        Emails sent to {selectedClient?.name || "client"} ({clientEmails.length})
                      </p>
                      {clientEmails.length === 0 ? (
                        <p style={{ padding: 24, textAlign: "center", color: L.dimmed, fontSize: 13 }}>No emails sent directly to {selectedClient?.name || "this client"} yet — e.g. lead-callback notifications.</p>
                      ) : (
                        clientEmails.map((send) => (
                          <EmailRow key={send.id} send={send} label={send.to_email} expanded={expandedEmailId === send.id} onToggle={() => setExpandedEmailId(expandedEmailId === send.id ? null : send.id)} />
                        ))
                      )}
                    </div>

                    <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 10, overflow: "hidden" }}>
                      <p style={{ padding: "12px 16px", fontSize: 11.5, fontWeight: 700, color: L.dimmed, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: `1px solid ${L.border}` }}>
                        Emails sent to their leads ({leadEmails.length})
                      </p>
                      {leadEmails.length === 0 ? (
                        <p style={{ padding: 24, textAlign: "center", color: L.dimmed, fontSize: 13 }}>No emails sent to this client&apos;s leads yet.</p>
                      ) : (
                        leadEmails.map((send) => {
                          const leadName = (send.lead_id && leadNameById[send.lead_id]) || send.to_email;
                          return (
                            <EmailRow key={send.id} send={send} label={`${leadName} (${send.to_email}) · step ${send.step + 1}`} expanded={expandedEmailId === send.id} onToggle={() => setExpandedEmailId(expandedEmailId === send.id ? null : send.id)} />
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

function EmailRow({ send, label, expanded, onToggle }: { send: EmailSend; label: string; expanded: boolean; onToggle: () => void }) {
  return (
    <div style={{ borderBottom: `1px solid ${L.border}` }}>
      <button
        onClick={onToggle}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%",
          padding: "14px 16px", border: "none", background: "transparent", cursor: "pointer", textAlign: "left", gap: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          {expanded ? <ChevronDown style={{ width: 13, height: 13, color: L.dimmed, flexShrink: 0 }} /> : <ChevronRight style={{ width: 13, height: 13, color: L.dimmed, flexShrink: 0 }} />}
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 13.5, fontWeight: 700, color: L.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{send.subject}</p>
            <p style={{ fontSize: 12, color: L.muted }}>To {label}</p>
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
}
