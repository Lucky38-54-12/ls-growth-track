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
  notes: string | null;
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
  { key: "callback_booked", label: "Callback Booked", color: "#0891b2", bg: "#ecfeff" },
  { key: "site_visit", label: "Site Visit", color: "#b45309", bg: "#fffbeb" },
  { key: "booked_job", label: "Booked Job", color: "#15803d", bg: "#f0fdf4" },
  { key: "not_a_fit", label: "Not a Fit", color: "#64748b", bg: "#f1f5f9" },
  { key: "lost", label: "Lost", color: "#b91c1c", bg: "#fef2f2" },
] as const;

const ENROLLMENT_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  active: { bg: "#eff6ff", color: "#1d4ed8", label: "In sequence" },
  booked: { bg: "#f0fdf4", color: "#15803d", label: "Booked" },
  completed: { bg: "#f1f5f9", color: "#64748b", label: "No reply" },
  stopped: { bg: "#f1f5f9", color: "#64748b", label: "Stopped" },
};

// Maps a lead's stored pipeline_stage onto the current board columns —
// including a few legacy values ("booked", "not_ready") from before the
// pipeline was split into Callback Booked/Site Visit/Booked Job, so old
// leads don't disappear.
function stageFor(lead: Lead): string {
  if (lead.pipeline_stage) {
    if (lead.pipeline_stage === "booked") return "callback_booked";
    if (lead.pipeline_stage === "not_ready") return "followed_up";
    return lead.pipeline_stage;
  }
  if (lead.outcome === "disqualified") return "not_a_fit";
  if (lead.outcome === "nurture") return "followed_up";
  if (lead.outcome === "qualified" && lead.booking_status === "booked") return "callback_booked";
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

  function reloadOverview() {
    if (!selectedId) return;
    fetch(`/api/lead-qual/clients/${selectedId}/overview`)
      .then((r) => r.json())
      .then((body) => setOverview(body));
  }

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

  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [stageError, setStageError] = useState<string | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [expandedLeadIds, setExpandedLeadIds] = useState<Set<string>>(new Set());

  function toggleExpanded(leadId: string) {
    setExpandedLeadIds((prev) => {
      const next = new Set(prev);
      if (next.has(leadId)) next.delete(leadId);
      else next.add(leadId);
      return next;
    });
  }

  async function saveNote(leadId: string) {
    const previous = overview;
    setOverview((prev) => (prev ? { ...prev, leads: prev.leads.map((l) => (l.id === leadId ? { ...l, notes: noteDraft } : l)) } : prev));
    setEditingNoteId(null);
    try {
      const res = await fetch(`/api/lead-qual/clients/${selectedId}/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: noteDraft }),
      });
      if (!res.ok) setOverview(previous);
    } catch {
      setOverview(previous);
    }
  }

  async function moveLead(leadId: string, stage: string): Promise<boolean> {
    const previous = overview;
    setStageError(null);
    setOverview((prev) => (prev ? { ...prev, leads: prev.leads.map((l) => (l.id === leadId ? { ...l, pipeline_stage: stage } : l)) } : prev));
    try {
      const res = await fetch(`/api/lead-qual/clients/${selectedId}/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pipeline_stage: stage }),
      });
      const body = await res.json();
      if (!res.ok) {
        setOverview(previous);
        setStageError(body.error || "Could not move this lead");
        return false;
      }
      if (stage === "callback_booked") reloadOverview();
      return true;
    } catch {
      setOverview(previous);
      setStageError("Something went wrong moving this lead.");
      return false;
    }
  }

  interface BookingPreview {
    leadId: string;
    leadName: string;
    leadPhone: string | null;
    leadEmail: string | null;
    notes: string | null;
    scheduledAt: string;
    clientName: string;
    clientEmail: string;
    emailSubject: string;
    emailText: string;
  }
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [bookingPreview, setBookingPreview] = useState<BookingPreview | null>(null);
  const [confirmingBooking, setConfirmingBooking] = useState(false);
  const [scheduleLeadId, setScheduleLeadId] = useState<string | null>(null);
  const [scheduleValue, setScheduleValue] = useState("");
  const [schedulingBusy, setSchedulingBusy] = useState(false);

  async function fetchBookingPreview(leadId: string) {
    setPreviewError(null);
    setPreviewLoading(true);
    try {
      const res = await fetch(`/api/lead-qual/clients/${selectedId}/leads/${leadId}/preview-booking`);
      const body = await res.json();
      if (!res.ok) {
        setPreviewError(body.error || "Could not build a preview for this lead");
        return;
      }
      setBookingPreview({ leadId, ...body });
    } catch {
      setPreviewError("Something went wrong building the preview.");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleDrop(stage: string) {
    setDragOverStage(null);
    const leadId = dragId;
    setDragId(null);
    if (!leadId) return;
    const current = overview?.leads.find((l) => l.id === leadId);
    if (!current || stageFor(current) === stage) return;

    // Booking sends an email + calendar invite to the client, so it gets a
    // preview-and-confirm step instead of moving straight away like the
    // other stages — everything else here is just an internal label change.
    if (stage === "callback_booked") {
      if (!current.scheduled_at) {
        // No callback time on this lead yet — prompt for one instead of
        // erroring, then fall straight into the normal preview flow.
        setScheduleValue("");
        setScheduleLeadId(leadId);
        return;
      }
      await fetchBookingPreview(leadId);
      return;
    }

    moveLead(leadId, stage);
  }

  async function submitSchedule() {
    if (!scheduleLeadId || !scheduleValue) return;
    setSchedulingBusy(true);
    try {
      const iso = new Date(scheduleValue).toISOString();
      const res = await fetch(`/api/lead-qual/clients/${selectedId}/leads/${scheduleLeadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduled_at: iso }),
      });
      const body = await res.json();
      if (!res.ok) {
        setPreviewError(body.error || "Could not save that callback time");
        setScheduleLeadId(null);
        return;
      }
      setOverview((prev) => (prev ? { ...prev, leads: prev.leads.map((l) => (l.id === scheduleLeadId ? { ...l, scheduled_at: iso } : l)) } : prev));
      const leadId = scheduleLeadId;
      setScheduleLeadId(null);
      await fetchBookingPreview(leadId);
    } catch {
      setPreviewError("Something went wrong saving that callback time.");
      setScheduleLeadId(null);
    } finally {
      setSchedulingBusy(false);
    }
  }

  async function confirmBooking() {
    if (!bookingPreview) return;
    setConfirmingBooking(true);
    try {
      const ok = await moveLead(bookingPreview.leadId, "callback_booked");
      if (ok) setBookingPreview(null);
    } finally {
      setConfirmingBooking(false);
    }
  }

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
                            const isOpen = expandedLeadIds.has(lead.id);
                            return (
                              <div key={lead.id} style={{ border: `1px solid ${L.border}`, borderLeft: `3px solid ${isPast ? "#94a3b8" : "#15803d"}`, padding: 10 }}>
                                <div
                                  onClick={() => toggleExpanded(lead.id)}
                                  style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6, cursor: "pointer" }}
                                >
                                  <div style={{ minWidth: 0 }}>
                                    <p style={{ fontSize: 13, fontWeight: 700, color: L.text }}>{String(fields.name || fields.job_type || "Booking")}</p>
                                    {!!(fields.job_type && fields.name) && <p style={{ fontSize: 12, color: L.muted, marginTop: 2 }}>{String(fields.job_type)}</p>}
                                    <p style={{ fontSize: 11.5, color: isPast ? L.dimmed : "#15803d", fontWeight: 600, marginTop: 4 }}>
                                      {new Date(lead.scheduled_at as string).toLocaleTimeString("en-NZ", { hour: "numeric", minute: "2-digit" })}
                                    </p>
                                    {!!lead.notes && (
                                      <p style={{ fontSize: 11.5, color: L.text, marginTop: 6, whiteSpace: "pre-line" }}>{lead.notes}</p>
                                    )}
                                  </div>
                                  {isOpen ? <ChevronDown style={{ width: 15, height: 15, color: L.dimmed, flexShrink: 0, marginTop: 2 }} /> : <ChevronRight style={{ width: 15, height: 15, color: L.dimmed, flexShrink: 0, marginTop: 2 }} />}
                                </div>
                                {isOpen && (
                                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${L.border}` }}>
                                    <p style={{ fontSize: 11.5, color: L.muted, marginTop: 2 }}>{String(fields.location || "Location TBC")}</p>
                                    {(fields.phone || lead.contact_email) && (
                                      <p style={{ fontSize: 11.5, color: L.muted, marginTop: 4 }}>{String(fields.phone || lead.contact_email)}</p>
                                    )}
                                  </div>
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
                  <>
                    {stageError && (
                      <p style={{ color: "#b91c1c", fontSize: 12.5, marginBottom: 10 }}>{stageError}</p>
                    )}
                    {previewError && (
                      <p style={{ color: "#b91c1c", fontSize: 12.5, marginBottom: 10 }}>{previewError}</p>
                    )}
                    <div style={{ display: "flex", gap: 14, overflowX: "auto", alignItems: "flex-start" }}>
                      {STAGES.map((stage) => {
                        const stageLeads = byStage[stage.key] || [];
                        const isDragOver = dragOverStage === stage.key;
                        return (
                          <div
                            key={stage.key}
                            onDragOver={(e) => {
                              e.preventDefault();
                              if (dragOverStage !== stage.key) setDragOverStage(stage.key);
                            }}
                            onDragLeave={() => setDragOverStage((prev) => (prev === stage.key ? null : prev))}
                            onDrop={(e) => {
                              e.preventDefault();
                              handleDrop(stage.key);
                            }}
                            style={{
                              flex: "1 1 220px", minWidth: 220, background: isDragOver ? "#f8fafc" : "transparent",
                              border: isDragOver ? `1px dashed ${stage.color}` : "1px solid transparent",
                              borderRadius: 8, padding: 6, transition: "background 0.1s",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, padding: "0 4px" }}>
                              <p style={{ fontSize: 12.5, fontWeight: 700, color: L.text }}>{stage.label}</p>
                              <span style={{ fontSize: 11.5, fontWeight: 700, color: stage.color, background: stage.bg, padding: "2px 8px", borderRadius: 999 }}>{stageLeads.length}</span>
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 60 }}>
                              {stageLeads.length === 0 ? (
                                <div style={{ border: `1px dashed ${L.border}`, padding: 16, textAlign: "center", color: "#cbd5e1", fontSize: 12, borderRadius: 6 }}>Empty</div>
                              ) : (
                                stageLeads.map((lead) => {
                                  const fields = lead.lq_conversations?.extracted_fields || {};
                                  const isOpen = expandedLeadIds.has(lead.id);
                                  return (
                                    <div
                                      key={lead.id}
                                      draggable
                                      onDragStart={() => setDragId(lead.id)}
                                      onDragEnd={() => {
                                        setDragId(null);
                                        setDragOverStage(null);
                                      }}
                                      style={{
                                        background: L.surface, border: `1px solid ${L.border}`, borderLeft: `3px solid ${stage.color}`,
                                        padding: "10px 12px", borderRadius: 6, cursor: "grab", opacity: dragId === lead.id ? 0.4 : 1,
                                      }}
                                    >
                                      <div
                                        onClick={() => toggleExpanded(lead.id)}
                                        style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6, cursor: "pointer" }}
                                      >
                                        <p style={{ fontSize: 12.5, fontWeight: 700, color: L.text, minWidth: 0 }}>
                                          {fields.name ? `${String(fields.name)} — ${String(fields.job_type || "Job type unknown")}` : String(fields.job_type || "Job type unknown")}
                                        </p>
                                        {isOpen ? <ChevronDown style={{ width: 14, height: 14, color: L.dimmed, flexShrink: 0 }} /> : <ChevronRight style={{ width: 14, height: 14, color: L.dimmed, flexShrink: 0 }} />}
                                      </div>

                                      {editingNoteId === lead.id ? (
                                        <textarea
                                          autoFocus
                                          value={noteDraft}
                                          onChange={(e) => setNoteDraft(e.target.value)}
                                          onBlur={() => saveNote(lead.id)}
                                          onClick={(e) => e.stopPropagation()}
                                          draggable={false}
                                          onDragStart={(e) => e.stopPropagation()}
                                          rows={2}
                                          placeholder="Note — call outcome, context…"
                                          style={{ width: "100%", boxSizing: "border-box", marginTop: 6, padding: "5px 7px", fontSize: 11.5, border: `1px solid ${L.border}`, borderRadius: 4, fontFamily: "inherit", resize: "vertical" }}
                                        />
                                      ) : (
                                        <p
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setNoteDraft(lead.notes || "");
                                            setEditingNoteId(lead.id);
                                          }}
                                          style={{ fontSize: 11.5, color: lead.notes ? L.text : L.dimmed, fontStyle: lead.notes ? "normal" : "italic", marginTop: 6, cursor: "text" }}
                                        >
                                          {lead.notes || "+ add note"}
                                        </p>
                                      )}

                                      {isOpen && (
                                        <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${L.border}` }}>
                                          <p style={{ fontSize: 11.5, color: L.muted }}>{String(fields.location || "Location unknown")}</p>
                                          <p style={{ fontSize: 11, color: L.muted, marginTop: 4 }}>{String(fields.phone || lead.contact_email || "No contact")}</p>
                                          {lead.scheduled_at && (
                                            <p style={{ fontSize: 11, color: stage.key === "callback_booked" ? "#15803d" : L.dimmed, fontWeight: stage.key === "callback_booked" ? 600 : 400, marginTop: 4 }}>
                                              {stage.key === "callback_booked" ? "Booked: " : "Callback agreed: "}
                                              {new Date(lead.scheduled_at).toLocaleString("en-NZ", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                                            </p>
                                          )}
                                          <p style={{ fontSize: 10.5, color: "#94a3b8", marginTop: 6 }}>{new Date(lead.created_at).toLocaleDateString("en-NZ")}</p>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>

      {bookingPreview && (
        <div
          onClick={() => !confirmingBooking && setBookingPreview(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 50 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: L.surface, borderRadius: 12, padding: 24, maxWidth: 480, width: "100%", maxHeight: "85vh", overflowY: "auto" }}
          >
            <p style={{ fontSize: 15, fontWeight: 800, color: L.text, marginBottom: 16 }}>Confirm before sending</p>

            <div style={{ border: `1px solid ${L.border}`, borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 12.5, color: L.muted }}>
              <p><strong style={{ color: L.text }}>Lead:</strong> {bookingPreview.leadName}</p>
              {bookingPreview.leadPhone && <p><strong style={{ color: L.text }}>Phone:</strong> {bookingPreview.leadPhone}</p>}
              {bookingPreview.leadEmail && <p><strong style={{ color: L.text }}>Email:</strong> {bookingPreview.leadEmail}</p>}
              {bookingPreview.notes && <p style={{ whiteSpace: "pre-line" }}><strong style={{ color: L.text }}>Notes:</strong> {bookingPreview.notes}</p>}
              <p><strong style={{ color: L.text }}>Callback time:</strong> {new Date(bookingPreview.scheduledAt).toLocaleString("en-NZ", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</p>
            </div>

            <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", color: L.muted, marginBottom: 6 }}>
              Email going to {bookingPreview.clientEmail}
            </p>
            <div style={{ background: "#f8fafc", border: `1px solid ${L.border}`, borderRadius: 8, padding: 12, marginBottom: 18 }}>
              <p style={{ fontSize: 12.5, fontWeight: 700, color: L.text, marginBottom: 8 }}>{bookingPreview.emailSubject}</p>
              <pre style={{ fontSize: 12.5, color: L.text, whiteSpace: "pre-wrap", fontFamily: "inherit", margin: 0 }}>{bookingPreview.emailText}</pre>
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={() => setBookingPreview(null)}
                disabled={confirmingBooking}
                style={{ background: "none", border: `1px solid ${L.border}`, color: L.muted, padding: "8px 16px", fontSize: 13, fontWeight: 700, borderRadius: 8, cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={confirmBooking}
                disabled={confirmingBooking}
                style={{ background: "var(--accent)", border: "none", color: "#fff", padding: "8px 16px", fontSize: 13, fontWeight: 700, borderRadius: 8, cursor: "pointer" }}
              >
                {confirmingBooking ? "Booking…" : "Confirm & send"}
              </button>
            </div>
          </div>
        </div>
      )}

      {previewLoading && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div style={{ background: L.surface, borderRadius: 10, padding: "16px 22px", fontSize: 13, color: L.muted, fontWeight: 600 }}>Building preview…</div>
        </div>
      )}

      {scheduleLeadId && (
        <div
          onClick={() => !schedulingBusy && setScheduleLeadId(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 50 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: L.surface, borderRadius: 12, padding: 24, maxWidth: 360, width: "100%" }}
          >
            <p style={{ fontSize: 15, fontWeight: 800, color: L.text, marginBottom: 16 }}>Set a callback time</p>
            <input
              type="datetime-local"
              value={scheduleValue}
              onChange={(e) => setScheduleValue(e.target.value)}
              style={{ width: "100%", padding: "8px 10px", fontSize: 13, borderRadius: 8, border: `1px solid ${L.border}`, marginBottom: 18, color: L.text }}
            />
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={() => setScheduleLeadId(null)}
                disabled={schedulingBusy}
                style={{ background: "none", border: `1px solid ${L.border}`, color: L.muted, padding: "8px 16px", fontSize: 13, fontWeight: 700, borderRadius: 8, cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={submitSchedule}
                disabled={schedulingBusy || !scheduleValue}
                style={{ background: "var(--accent)", border: "none", color: "#fff", padding: "8px 16px", fontSize: 13, fontWeight: 700, borderRadius: 8, cursor: "pointer", opacity: scheduleValue ? 1 : 0.6 }}
              >
                {schedulingBusy ? "Saving…" : "Save & preview"}
              </button>
            </div>
          </div>
        </div>
      )}

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
