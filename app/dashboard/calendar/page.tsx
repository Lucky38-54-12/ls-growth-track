"use client";
import { useState, useEffect, useMemo } from "react";
import Topbar from "@/components/Topbar";
import { ChevronLeft, ChevronRight, Video, MapPin, Clock } from "lucide-react";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };
const TZ = "Pacific/Auckland";

interface CalendarEvent {
  eventId: string;
  summary: string;
  startISO: string;
  endISO: string;
  allDay: boolean;
  attendeeEmail: string;
  attendeeName: string;
  hangoutLink: string;
  location: string;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function dateKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function fmtTime(iso: string): string {
  return new Intl.DateTimeFormat("en-NZ", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso)).replace(" ", "").toLowerCase();
}

export default function CalendarPage() {
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const todayKey = dateKey(new Date());
  const [selected, setSelected] = useState(todayKey);

  // Build a 6-week (Mon–Sun) grid covering the visible month
  const gridDays = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const firstWeekday = (firstOfMonth.getDay() + 6) % 7; // Mon=0..Sun=6
    const start = new Date(year, month, 1 - firstWeekday);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [cursor]);

  useEffect(() => {
    const from = dateKey(gridDays[0]);
    const to = dateKey(gridDays[gridDays.length - 1]);
    setLoading(true);
    fetch(`/api/calendar?from=${from}&to=${to}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setError(data.error); setEvents([]); }
        else { setEvents(data.events || []); setError(""); }
      })
      .catch(() => setError("Could not load calendar"))
      .finally(() => setLoading(false));
  }, [gridDays]);

  const eventsByDay = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    for (const ev of events) {
      const key = ev.allDay ? ev.startISO.slice(0, 10) : dateKey(new Date(ev.startISO));
      (map[key] ||= []).push(ev);
    }
    return map;
  }, [events]);

  const selectedEvents = eventsByDay[selected] || [];

  function shiftMonth(delta: number) {
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1));
  }

  function goToday() {
    const now = new Date();
    setCursor(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelected(todayKey);
  }

  return (
    <div>
      <Topbar title="Calendar" subtitle="Meetings and bookings" />

      <div style={{ padding: "20px 28px 60px", display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        {/* Month grid */}
        <div style={{ flex: 1, minWidth: 480, background: L.surface, border: `1px solid ${L.border}` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${L.border}` }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: L.text }}>{MONTHS[cursor.getMonth()]} {cursor.getFullYear()}</h2>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={goToday} className="pill-hover" style={{ padding: "6px 12px", fontSize: 11.5, fontWeight: 700, border: `1px solid ${L.border}`, background: L.surface, color: L.muted, cursor: "pointer" }}>Today</button>
              <button onClick={() => shiftMonth(-1)} style={{ width: 32, height: 32, border: `1px solid ${L.border}`, background: L.surface, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><ChevronLeft style={{ width: 14, height: 14 }} /></button>
              <button onClick={() => shiftMonth(1)} style={{ width: 32, height: 32, border: `1px solid ${L.border}`, background: L.surface, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><ChevronRight style={{ width: 14, height: 14 }} /></button>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)" }}>
            {WEEKDAYS.map((w) => (
              <div key={w} style={{ padding: "8px 10px", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: L.dimmed, borderBottom: `1px solid ${L.border}` }}>{w}</div>
            ))}
            {gridDays.map((d) => {
              const key = dateKey(d);
              const inMonth = d.getMonth() === cursor.getMonth();
              const isToday = key === todayKey;
              const isSelected = key === selected;
              const dayEvents = eventsByDay[key] || [];
              return (
                <div
                  key={key}
                  onClick={() => setSelected(key)}
                  className="row-hover"
                  style={{
                    minHeight: 92, padding: 8, borderBottom: `1px solid ${L.border}`, borderRight: `1px solid ${L.border}`,
                    background: isSelected ? "#fef2f2" : L.surface, opacity: inMonth ? 1 : 0.4, cursor: "pointer",
                  }}
                >
                  <span style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    width: 22, height: 22, fontSize: 12, fontWeight: isToday ? 800 : 600,
                    color: isToday ? "#fff" : L.text, background: isToday ? "var(--red)" : "transparent",
                    borderRadius: isToday ? "50%" : 0,
                  }}>{d.getDate()}</span>
                  <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 2 }}>
                    {dayEvents.slice(0, 2).map((ev) => (
                      <div key={ev.eventId} style={{ fontSize: 10.5, fontWeight: 600, color: "#1e40af", background: "#dbeafe", padding: "2px 5px", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                        {!ev.allDay && `${fmtTime(ev.startISO)} `}{ev.summary}
                      </div>
                    ))}
                    {dayEvents.length > 2 && (
                      <div style={{ fontSize: 10, color: L.dimmed, fontWeight: 600, padding: "0 5px" }}>+{dayEvents.length - 2} more</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Day detail panel */}
        <div style={{ width: 320, flexShrink: 0, background: L.surface, border: `1px solid ${L.border}` }}>
          <div style={{ padding: "14px 16px", borderBottom: `1px solid ${L.border}` }}>
            <h3 style={{ fontSize: 13, fontWeight: 800, color: L.text }}>
              {new Date(`${selected}T00:00:00`).toLocaleDateString("en-NZ", { weekday: "long", day: "numeric", month: "long" })}
            </h3>
            {selected === todayKey && <p style={{ fontSize: 11, color: "var(--red)", fontWeight: 700, marginTop: 2 }}>Today</p>}
          </div>
          <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
            {loading ? (
              <p style={{ fontSize: 12, color: L.dimmed }}>Loading…</p>
            ) : error ? (
              <p style={{ fontSize: 12, color: "var(--red)" }}>{error}</p>
            ) : selectedEvents.length === 0 ? (
              <p style={{ fontSize: 12, color: L.dimmed }}>No meetings this day.</p>
            ) : (
              selectedEvents.map((ev) => (
                <div key={ev.eventId} style={{ border: `1px solid ${L.border}`, padding: 10 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: L.text }}>{ev.summary}</p>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, color: L.muted, fontSize: 11.5 }}>
                    <Clock style={{ width: 12, height: 12 }} />
                    {ev.allDay ? "All day" : `${fmtTime(ev.startISO)} – ${fmtTime(ev.endISO)}`}
                  </div>
                  {(ev.attendeeName || ev.attendeeEmail) && (
                    <p style={{ fontSize: 11.5, color: L.muted, marginTop: 4 }}>{ev.attendeeName || ev.attendeeEmail}</p>
                  )}
                  {ev.location && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, color: L.muted, fontSize: 11.5 }}>
                      <MapPin style={{ width: 12, height: 12 }} />
                      {ev.location}
                    </div>
                  )}
                  {ev.hangoutLink && (
                    <a href={ev.hangoutLink} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, color: "var(--blue)", fontSize: 11.5, fontWeight: 700 }}>
                      <Video style={{ width: 12, height: 12 }} /> Join Google Meet
                    </a>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
