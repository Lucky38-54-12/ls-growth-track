"use client";
import { useEffect, useRef, useState } from "react";
import { StickyNote, Bell, BellRing, Plus, X } from "lucide-react";
import { NOTES_KEY, Note } from "@/lib/notesStore";

const L = { border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dim: "#94a3b8" };

const STICKY_COLORS = [
  { bg: "#fef9c3", border: "#fde68a" },
  { bg: "#dbeafe", border: "#bfdbfe" },
  { bg: "#dcfce7", border: "#bbf7d0" },
  { bg: "#fce7f3", border: "#fbcfe8" },
  { bg: "#ffedd5", border: "#fed7aa" },
  { bg: "#ede9fe", border: "#ddd6fe" },
];

export default function DailyNotes() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [draft, setDraft] = useState("");
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const firedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    try {
      setNotes(JSON.parse(localStorage.getItem(NOTES_KEY) || "[]"));
    } catch {
      setNotes([]);
    }
    setPermission(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  }, []);

  useEffect(() => {
    const check = setInterval(() => {
      if (permission !== "granted") return;
      const now = new Intl.DateTimeFormat("en-NZ", { timeZone: "Pacific/Auckland", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
      for (const note of notes) {
        if (note.reminderTime && note.reminderTime === now && !firedRef.current.has(note.id)) {
          firedRef.current.add(note.id);
          new Notification("Note reminder", { body: note.text, icon: "/favicon.ico" });
        }
      }
    }, 15000);
    return () => clearInterval(check);
  }, [notes, permission]);

  function persist(next: Note[]) {
    setNotes(next);
    localStorage.setItem(NOTES_KEY, JSON.stringify(next));
  }

  function handleAdd() {
    const text = draft.trim();
    if (!text) return;
    persist([...notes, { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, text, reminderTime: "", createdAt: Date.now() }]);
    setDraft("");
  }

  function handleRemove(id: string) {
    persist(notes.filter(n => n.id !== id));
  }

  function handleReminderChange(id: string, time: string) {
    firedRef.current.delete(id);
    persist(notes.map(n => (n.id === id ? { ...n, reminderTime: time } : n)));
  }

  async function handleEnableNotifications() {
    if (typeof Notification === "undefined") return;
    const result = await Notification.requestPermission();
    setPermission(result);
  }

  return (
    <div className="surface-card" style={{ overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: `1px solid ${L.border}` }}>
        <StickyNote style={{ width: 15, height: 15, color: L.muted }} />
        <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: L.text }}>Notes</span>
        {permission === "default" && (
          <button
            onClick={handleEnableNotifications}
            className="pill-hover"
            style={{ marginLeft: "auto", padding: "5px 10px", fontSize: 11, fontWeight: 700, color: L.muted, border: `1px solid ${L.border}`, background: "#fff", cursor: "pointer" }}
          >
            Enable notifications
          </button>
        )}
        {permission === "denied" && (
          <span style={{ marginLeft: "auto", fontSize: 11, color: L.dim }}>Notifications blocked — enable in browser settings</span>
        )}
      </div>

      <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") { e.preventDefault(); handleAdd(); }
            }}
            placeholder="Type a note and press Enter…"
            style={{ flex: 1, padding: "10px 12px", border: `1px solid ${L.border}`, fontSize: 13, color: L.text, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
          />
          <button
            onClick={handleAdd}
            className="pill-hover"
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 14px", fontSize: 12, fontWeight: 700, color: "#fff", background: "#0f172a", border: "none", cursor: "pointer" }}
          >
            <Plus style={{ width: 14, height: 14 }} /> Add
          </button>
        </div>

        {notes.length === 0 ? (
          <p style={{ fontSize: 12.5, color: L.dim }}>No notes yet — add one above.</p>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
            {notes.map((note, i) => {
              const color = STICKY_COLORS[i % STICKY_COLORS.length];
              return (
                <div
                  key={note.id}
                  style={{
                    width: 190, minHeight: 130, padding: "12px 14px", background: color.bg, border: `1px solid ${color.border}`,
                    boxShadow: "0 2px 6px rgba(15,23,42,0.08)", display: "flex", flexDirection: "column", gap: 8,
                    transform: `rotate(${(i % 2 === 0 ? -1 : 1) * 1.5}deg)`,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button
                      onClick={() => handleRemove(note.id)}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(15,23,42,0.4)", display: "flex", padding: 2 }}
                    >
                      <X style={{ width: 13, height: 13 }} />
                    </button>
                  </div>
                  <p style={{ fontSize: 13, color: L.text, lineHeight: 1.5, flex: 1, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{note.text}</p>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    {note.reminderTime ? <BellRing style={{ width: 12, height: 12, color: "#b45309", flexShrink: 0 }} /> : <Bell style={{ width: 12, height: 12, color: "rgba(15,23,42,0.35)", flexShrink: 0 }} />}
                    <input
                      type="time"
                      value={note.reminderTime}
                      onChange={e => handleReminderChange(note.id, e.target.value)}
                      style={{ flex: 1, padding: "3px 4px", border: `1px solid ${color.border}`, background: "rgba(255,255,255,0.6)", fontSize: 11, color: L.text, fontFamily: "inherit", outline: "none", minWidth: 0 }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
