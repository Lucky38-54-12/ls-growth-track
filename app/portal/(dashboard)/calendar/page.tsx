"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePortalLeads } from "@/lib/hooks/usePortalLeads";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b" };
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

export default function PortalCalendarPage() {
  const { leads, loading } = usePortalLeads<Lead>();
  const [monthStart, setMonthStart] = useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const jobs = useMemo(() => toBookedJobs(leads), [leads]);
  const grid = useMemo(() => buildMonthGrid(monthStart), [monthStart]);

  const upcoming = useMemo(() => {
    const now = new Date();
    return jobs.filter((j) => j.date.getTime() >= now.getTime() - 24 * 60 * 60000).sort((a, b) => a.date.getTime() - b.date.getTime()).slice(0, 12);
  }, [jobs]);

  function changeMonth(delta: number) {
    setMonthStart((prev) => {
      const next = new Date(prev);
      next.setMonth(next.getMonth() + delta);
      return next;
    });
  }

  const monthLabel = monthStart.toLocaleDateString("en-NZ", { month: "long", year: "numeric" });
  const today = new Date();

  return (
    <div>
      <div className="portal-header-pad" style={{ background: "#fff", borderBottom: `1px solid ${L.border}`, padding: "18px 28px" }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: L.text }}>Calendar</h1>
        <p style={{ fontSize: 13, color: L.muted }}>Every job booked in through your AI chat.</p>
      </div>

      {loading ? (
        <p style={{ padding: 28, color: L.muted, fontSize: 13 }}>Loading…</p>
      ) : (
        <div className="portal-page-pad" style={{ display: "flex", gap: 20, padding: "20px 28px 60px", alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 560px", background: L.surface, border: `1px solid ${L.border}` }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: `1px solid ${L.border}` }}>
              <button type="button" onClick={() => changeMonth(-1)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
                <ChevronLeft style={{ width: 18, height: 18, color: L.muted }} />
              </button>
              <p style={{ fontSize: 15, fontWeight: 800, color: L.text }}>{monthLabel}</p>
              <button type="button" onClick={() => changeMonth(1)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
                <ChevronRight style={{ width: 18, height: 18, color: L.muted }} />
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
              {WEEKDAYS.map((d) => (
                <div key={d} style={{ padding: "8px 6px", fontSize: 10.5, fontWeight: 700, color: L.muted, textTransform: "uppercase", letterSpacing: "0.04em", textAlign: "center", borderBottom: `1px solid ${L.border}` }}>
                  {d}
                </div>
              ))}
              {grid.map((day, i) => {
                const inMonth = day.getMonth() === monthStart.getMonth();
                const dayJobs = jobs.filter((j) => sameDay(j.date, day));
                const isToday = sameDay(day, today);
                return (
                  <div
                    key={i}
                    style={{
                      minHeight: 84, padding: "6px 6px", borderBottom: `1px solid ${L.border}`, borderRight: (i + 1) % 7 === 0 ? "none" : `1px solid ${L.border}`,
                      background: inMonth ? "#fff" : "#f8fafc",
                    }}
                  >
                    <p style={{ fontSize: 11.5, fontWeight: isToday ? 800 : 600, color: isToday ? "var(--red)" : inMonth ? L.text : "#cbd5e1", marginBottom: 4 }}>
                      {day.getDate()}
                    </p>
                    {dayJobs.slice(0, 2).map((j) => (
                      <div key={j.id} style={{ fontSize: 10, fontWeight: 700, color: "#15803d", background: "#f0fdf4", padding: "2px 5px", marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {j.date.toLocaleTimeString("en-NZ", { hour: "numeric", minute: "2-digit" })} {j.jobType}
                      </div>
                    ))}
                    {dayJobs.length > 2 && (
                      <p style={{ fontSize: 10, color: L.muted, fontWeight: 600 }}>+{dayJobs.length - 2} more</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ flex: "1 1 280px", maxWidth: 320 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: L.muted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>Upcoming</p>
            {upcoming.length === 0 ? (
              <div style={{ background: L.surface, border: `1px solid ${L.border}`, padding: 20, textAlign: "center", color: L.muted, fontSize: 12.5 }}>
                Nothing booked yet.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {upcoming.map((j) => (
                  <div key={j.id} style={{ background: L.surface, border: `1px solid ${L.border}`, borderLeft: "3px solid #15803d", padding: "10px 12px" }}>
                    <p style={{ fontSize: 12.5, fontWeight: 700, color: L.text }}>{j.jobType}</p>
                    <p style={{ fontSize: 11.5, color: L.muted }}>{j.location}</p>
                    <p style={{ fontSize: 11.5, color: "#15803d", fontWeight: 600, marginTop: 3 }}>
                      {j.date.toLocaleString("en-NZ", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                    </p>
                    {j.phone && <p style={{ fontSize: 11, color: L.muted, marginTop: 2 }}>{j.phone}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
