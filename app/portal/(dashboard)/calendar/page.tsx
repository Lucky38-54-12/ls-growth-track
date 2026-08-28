"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePortalLeads } from "@/lib/hooks/usePortalLeads";
import { PORTAL as L, portalCardStyle } from "@/lib/portalTheme";
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface Lead {
  id: string;
  outcome: string;
  booking_status: string | null;
  scheduled_at: string | null;
  lq_conversations: { extracted_fields: Record<string, unknown> } | null;
}

interface BookedJob {
  id: string;
  date: Date;
  jobType: string;
  location: string;
  phone: string;
  notes: string;
}

function toBookedJobs(leads: Lead[]): BookedJob[] {
  return leads
    .filter((l) => l.booking_status === "booked" && l.scheduled_at)
    .map((l) => {
      const fields = l.lq_conversations?.extracted_fields || {};
      return {
        id: l.id,
        date: new Date(l.scheduled_at as string),
        jobType: String(fields.job_type || "Job"),
        location: String(fields.location || "Location TBC"),
        phone: String(fields.phone || ""),
        notes: String(fields.notes || ""),
      };
    });
}

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

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function PortalCalendarPage() {
  const { leads, loading } = usePortalLeads<Lead>();
  const [monthStart, setMonthStart] = useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const today = new Date();
  const todayKey = dateKey(today);
  const [selected, setSelected] = useState(todayKey);

  const jobs = useMemo(() => toBookedJobs(leads), [leads]);
  const grid = useMemo(() => buildMonthGrid(monthStart), [monthStart]);

  const jobsByDay = useMemo(() => {
    const map: Record<string, BookedJob[]> = {};
    for (const j of jobs) (map[dateKey(j.date)] ||= []).push(j);
    for (const key in map) map[key].sort((a, b) => a.date.getTime() - b.date.getTime());
    return map;
  }, [jobs]);

  const selectedJobs = jobsByDay[selected] || [];

  function changeMonth(delta: number) {
    setMonthStart((prev) => {
      const next = new Date(prev);
      next.setMonth(next.getMonth() + delta);
      return next;
    });
  }

  function goToday() {
    const now = new Date();
    now.setDate(1);
    now.setHours(0, 0, 0, 0);
    setMonthStart(now);
    setSelected(todayKey);
  }

  const monthLabel = monthStart.toLocaleDateString("en-NZ", { month: "long", year: "numeric" });

  return (
    <div>
      <div className="portal-header-pad" style={{ background: "linear-gradient(135deg, #eef2ff 0%, #fdf4ff 55%, #fff7ed 100%)", borderBottom: `1px solid ${L.border}`, padding: "22px 28px" }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: L.text }}>Calendar</h1>
        <p style={{ fontSize: 13.5, color: L.muted, marginTop: 4 }}>Every job booked in through your AI chat.</p>
      </div>

      {loading ? (
        <p style={{ padding: 28, color: L.muted, fontSize: 13 }}>Loading…</p>
      ) : (
        <div className="portal-page-pad" style={{ display: "flex", gap: 16, padding: "20px 28px 60px", alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ ...portalCardStyle, flex: 1, minWidth: 480, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${L.border}` }}>
              <h2 style={{ fontSize: 16, fontWeight: 800, color: L.text }}>{monthLabel}</h2>
              <div style={{ display: "flex", gap: 6 }}>
                <button type="button" onClick={goToday} className="pill-hover" style={{ padding: "6px 12px", fontSize: 11.5, fontWeight: 700, borderRadius: 8, border: `1px solid ${L.border}`, background: L.surface, color: L.muted, cursor: "pointer" }}>Today</button>
                <button type="button" onClick={() => changeMonth(-1)} style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${L.border}`, background: L.surface, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <ChevronLeft style={{ width: 14, height: 14, color: L.muted }} />
                </button>
                <button type="button" onClick={() => changeMonth(1)} style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${L.border}`, background: L.surface, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
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
              {grid.map((day, i) => {
                const key = dateKey(day);
                const inMonth = day.getMonth() === monthStart.getMonth();
                const dayJobs = jobsByDay[key] || [];
                const isToday = key === todayKey;
                const isSelected = key === selected;
                return (
                  <div
                    key={i}
                    onClick={() => setSelected(key)}
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
                      {dayJobs.slice(0, 2).map((j) => (
                        <div key={j.id} style={{ fontSize: 10.5, fontWeight: 600, color: "#15803d", background: "#f0fdf4", padding: "2px 5px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {j.date.toLocaleTimeString("en-NZ", { hour: "numeric", minute: "2-digit" })} {j.jobType}
                        </div>
                      ))}
                      {dayJobs.length > 2 && (
                        <div style={{ fontSize: 10, color: L.dimmed, fontWeight: 600, padding: "0 5px" }}>+{dayJobs.length - 2} more</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ ...portalCardStyle, width: 320, flexShrink: 0, overflow: "hidden" }}>
            <div style={{ padding: "14px 16px", borderBottom: `1px solid ${L.border}` }}>
              <h3 style={{ fontSize: 13, fontWeight: 800, color: L.text }}>
                {new Date(`${selected}T00:00:00`).toLocaleDateString("en-NZ", { weekday: "long", day: "numeric", month: "long" })}
              </h3>
              {selected === todayKey && <p style={{ fontSize: 11, color: "var(--accent)", fontWeight: 700, marginTop: 2 }}>Today</p>}
            </div>
            <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
              {selectedJobs.length === 0 ? (
                <p style={{ fontSize: 12, color: L.dimmed }}>No jobs booked this day.</p>
              ) : (
                selectedJobs.map((j) => (
                  <div key={j.id} style={{ ...portalCardStyle, borderLeft: "3px solid #15803d", padding: 10 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: L.text }}>{j.jobType}</p>
                    <p style={{ fontSize: 12, color: L.muted, marginTop: 2 }}>{j.location}</p>
                    <p style={{ fontSize: 11.5, color: "#15803d", fontWeight: 600, marginTop: 6 }}>
                      {j.date.toLocaleTimeString("en-NZ", { hour: "numeric", minute: "2-digit" })}
                    </p>
                    {j.phone && <p style={{ fontSize: 11.5, color: L.muted, marginTop: 4 }}>{j.phone}</p>}
                    {j.notes && (
                      <p style={{ fontSize: 11.5, color: L.text, marginTop: 6, whiteSpace: "pre-line", borderTop: `1px solid ${L.border}`, paddingTop: 6 }}>
                        {j.notes}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
