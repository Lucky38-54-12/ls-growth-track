"use client";
import { useState, useMemo } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { ContentIdea, ContentIdeaStatus, CONTENT_IDEA_STATUS_LABELS, CONTENT_IDEA_STATUS_COLORS } from "@/lib/types";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };
const TZ = "Pacific/Auckland";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const STATUSES: ContentIdeaStatus[] = ["idea", "scheduled", "posted"];

function dateKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export default function ContentCalendarTab({ initialIdeas }: { initialIdeas: ContentIdea[] }) {
  const [ideas, setIdeas] = useState(initialIdeas);
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const todayKey = dateKey(new Date());
  const [selected, setSelected] = useState(todayKey);
  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<ContentIdeaStatus>("idea");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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

  const ideasByDay = useMemo(() => {
    const map: Record<string, ContentIdea[]> = {};
    for (const idea of ideas) {
      if (!idea.post_date) continue;
      (map[idea.post_date] ||= []).push(idea);
    }
    return map;
  }, [ideas]);

  const selectedIdeas = ideasByDay[selected] || [];
  const undated = ideas.filter(i => !i.post_date);

  function shiftMonth(delta: number) {
    setCursor(c => new Date(c.getFullYear(), c.getMonth() + delta, 1));
  }

  function openAddForm() {
    setTitle(""); setNotes(""); setStatus("idea"); setError(""); setFormOpen(true);
  }

  async function handleAdd() {
    setError(""); setBusy(true);
    try {
      const res = await fetch("/api/growth-hub/content-ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, notes, status, post_date: selected }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add idea");
      setIdeas(prev => [...prev, data]);
      setFormOpen(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function handleStatusChange(idea: ContentIdea, next: ContentIdeaStatus) {
    setIdeas(prev => prev.map(i => i.id === idea.id ? { ...i, status: next } : i));
    await fetch(`/api/growth-hub/content-ideas/${idea.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
  }

  async function handleDelete(id: string) {
    setIdeas(prev => prev.filter(i => i.id !== id));
    await fetch(`/api/growth-hub/content-ideas/${id}`, { method: "DELETE" });
  }

  return (
    <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
      {/* Month grid */}
      <div className="surface-card" style={{ flex: 1, minWidth: 480, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${L.border}` }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: L.text }}>{MONTHS[cursor.getMonth()]} {cursor.getFullYear()}</h2>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => { setCursor(new Date(new Date().getFullYear(), new Date().getMonth(), 1)); setSelected(todayKey); }} className="pill-hover" style={{ padding: "6px 12px", fontSize: 11.5, fontWeight: 700, border: `1px solid ${L.border}`, background: L.surface, color: L.muted, cursor: "pointer" }}>Today</button>
            <button onClick={() => shiftMonth(-1)} style={{ width: 32, height: 32, border: `1px solid ${L.border}`, background: L.surface, cursor: "pointer" }}>‹</button>
            <button onClick={() => shiftMonth(1)} style={{ width: 32, height: 32, border: `1px solid ${L.border}`, background: L.surface, cursor: "pointer" }}>›</button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)" }}>
          {WEEKDAYS.map(w => (
            <div key={w} style={{ padding: "8px 10px", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: L.dimmed, borderBottom: `1px solid ${L.border}` }}>{w}</div>
          ))}
          {gridDays.map(d => {
            const key = dateKey(d);
            const inMonth = d.getMonth() === cursor.getMonth();
            const isToday = key === todayKey;
            const isSelected = key === selected;
            const dayIdeas = ideasByDay[key] || [];
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
                  {dayIdeas.slice(0, 2).map(idea => {
                    const c = CONTENT_IDEA_STATUS_COLORS[idea.status];
                    return (
                      <div key={idea.id} style={{ fontSize: 10.5, fontWeight: 600, color: c.text, background: c.bg, padding: "2px 5px", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                        {idea.title}
                      </div>
                    );
                  })}
                  {dayIdeas.length > 2 && (
                    <div style={{ fontSize: 10, color: L.dimmed, fontWeight: 600, padding: "0 5px" }}>+{dayIdeas.length - 2} more</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Day detail panel */}
      <div className="surface-card" style={{ width: 320, flexShrink: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${L.border}` }}>
          <div>
            <h3 style={{ fontSize: 13, fontWeight: 800, color: L.text }}>
              {new Date(`${selected}T00:00:00`).toLocaleDateString("en-NZ", { weekday: "long", day: "numeric", month: "long" })}
            </h3>
            {selected === todayKey && <p style={{ fontSize: 11, color: "var(--red)", fontWeight: 700, marginTop: 2 }}>Today</p>}
          </div>
          <button onClick={openAddForm} className="pill-hover" style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", fontSize: 11.5, fontWeight: 700, color: "var(--blue)", border: `1px solid ${L.border}`, background: "none", cursor: "pointer" }}>
            <Plus style={{ width: 12, height: 12 }} /> Add
          </button>
        </div>

        <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10, maxHeight: 420, overflowY: "auto" }}>
          {selectedIdeas.length === 0 ? (
            <p style={{ fontSize: 12, color: L.dimmed }}>No ideas for this day yet.</p>
          ) : (
            selectedIdeas.map(idea => {
              const c = CONTENT_IDEA_STATUS_COLORS[idea.status];
              return (
                <div key={idea.id} style={{ border: `1px solid ${L.border}`, padding: 10 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: L.text }}>{idea.title}</p>
                    <button onClick={() => handleDelete(idea.id)} style={{ background: "none", border: "none", cursor: "pointer", color: L.dimmed, display: "flex", padding: 2, flexShrink: 0 }}>
                      <Trash2 style={{ width: 12, height: 12 }} />
                    </button>
                  </div>
                  {idea.notes && <p style={{ fontSize: 11.5, color: L.muted, marginTop: 4 }}>{idea.notes}</p>}
                  <select
                    value={idea.status}
                    onChange={e => handleStatusChange(idea, e.target.value as ContentIdeaStatus)}
                    style={{ marginTop: 8, fontSize: 11, fontWeight: 700, color: c.text, background: c.bg, border: "none", padding: "4px 8px", cursor: "pointer" }}
                  >
                    {STATUSES.map(s => (
                      <option key={s} value={s}>{CONTENT_IDEA_STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                </div>
              );
            })
          )}

          {undated.length > 0 && (
            <>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: L.dimmed, marginTop: 8 }}>Undated ideas</p>
              {undated.map(idea => {
                const c = CONTENT_IDEA_STATUS_COLORS[idea.status];
                return (
                  <div key={idea.id} style={{ border: `1px solid ${L.border}`, padding: 10 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: L.text }}>{idea.title}</p>
                    {idea.notes && <p style={{ fontSize: 11.5, color: L.muted, marginTop: 4 }}>{idea.notes}</p>}
                    <span style={{ display: "inline-block", marginTop: 8, fontSize: 11, fontWeight: 700, color: c.text, background: c.bg, padding: "4px 8px" }}>{CONTENT_IDEA_STATUS_LABELS[idea.status]}</span>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>

      {formOpen && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setFormOpen(false)}
        >
          <div
            style={{ width: "100%", maxWidth: 420, background: "#fff", margin: "0 16px", border: `1px solid ${L.border}`, borderRadius: 14, overflow: "hidden", boxShadow: "0 20px 48px rgba(15,23,42,0.22)" }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: `1px solid ${L.border}` }}>
              <p style={{ fontSize: 13, fontWeight: 800, color: L.text }}>New idea — {selected}</p>
              <button onClick={() => setFormOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: L.dimmed, display: "flex", padding: 4 }}>
                <X style={{ width: 14, height: 14 }} />
              </button>
            </div>
            <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: L.muted, display: "block", marginBottom: 5 }}>Title</label>
                <input value={title} onChange={e => setTitle(e.target.value)} style={{ width: "100%", padding: "8px 10px", border: `1px solid ${L.border}`, fontSize: 13, color: L.text, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: L.muted, display: "block", marginBottom: 5 }}>Notes</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} style={{ width: "100%", padding: "8px 10px", border: `1px solid ${L.border}`, fontSize: 13, color: L.text, fontFamily: "inherit", outline: "none", boxSizing: "border-box", resize: "vertical" }} />
              </div>
              <div>
                <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: L.muted, display: "block", marginBottom: 5 }}>Status</label>
                <select value={status} onChange={e => setStatus(e.target.value as ContentIdeaStatus)} style={{ width: "100%", padding: "8px 10px", border: `1px solid ${L.border}`, fontSize: 13, color: L.text, fontFamily: "inherit", outline: "none" }}>
                  {STATUSES.map(s => (
                    <option key={s} value={s}>{CONTENT_IDEA_STATUS_LABELS[s]}</option>
                  ))}
                </select>
              </div>
              {error && <p style={{ fontSize: 12, color: "var(--red)", background: "#fef2f2", padding: "8px 10px" }}>{error}</p>}
            </div>
            <div style={{ padding: "12px 18px", borderTop: `1px solid ${L.border}`, display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => setFormOpen(false)} style={{ padding: "8px 16px", fontSize: 12, fontWeight: 600, color: L.muted, background: "#fff", border: `1px solid ${L.border}`, cursor: "pointer" }}>Cancel</button>
              <button onClick={handleAdd} disabled={busy || !title.trim()} style={{ padding: "8px 18px", fontSize: 12, fontWeight: 700, background: "var(--red)", color: "#fff", border: "none", cursor: busy ? "wait" : "pointer", opacity: busy || !title.trim() ? 0.6 : 1 }}>
                {busy ? "Saving..." : "Add Idea"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
