"use client";
import { useEffect, useRef, useState } from "react";
import { StickyNote, Bell, BellRing } from "lucide-react";

const L = { border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dim: "#94a3b8" };

function todayKey(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Pacific/Auckland", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export default function DailyNotes() {
  const key = `today-notes-${todayKey()}`;
  const reminderKey = `today-notes-reminder-${todayKey()}`;
  const [notes, setNotes] = useState("");
  const [reminderTime, setReminderTime] = useState("");
  const [saved, setSaved] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const firedRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setNotes(localStorage.getItem(key) || "");
    setReminderTime(localStorage.getItem(reminderKey) || "");
    setPermission(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  }, [key, reminderKey]);

  useEffect(() => {
    if (!reminderTime || permission !== "granted") return;
    const check = setInterval(() => {
      const now = new Intl.DateTimeFormat("en-NZ", { timeZone: "Pacific/Auckland", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
      if (now === reminderTime && !firedRef.current) {
        firedRef.current = true;
        new Notification("Today's notes", { body: notes || "You set a reminder for now.", icon: "/favicon.ico" });
      }
    }, 15000);
    return () => clearInterval(check);
  }, [reminderTime, permission, notes]);

  function handleNotesChange(v: string) {
    setNotes(v);
    setSaved(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      localStorage.setItem(key, v);
      setSaved(true);
    }, 500);
  }

  function handleReminderChange(v: string) {
    setReminderTime(v);
    firedRef.current = false;
    localStorage.setItem(reminderKey, v);
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
        <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: L.text }}>Notes For Today</span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: L.dim }}>{saved ? "saved" : notes ? "saving…" : ""}</span>
      </div>
      <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
        <textarea
          value={notes}
          onChange={e => handleNotesChange(e.target.value)}
          placeholder="Jot down anything you want to remember today…"
          rows={4}
          style={{ width: "100%", padding: "10px 12px", border: `1px solid ${L.border}`, fontSize: 13, color: L.text, fontFamily: "inherit", outline: "none", resize: "vertical", lineHeight: 1.6, boxSizing: "border-box" }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: L.muted }}>
            {reminderTime ? <BellRing style={{ width: 13, height: 13, color: "#d97706" }} /> : <Bell style={{ width: 13, height: 13 }} />}
            Remind me at
          </label>
          <input
            type="time"
            value={reminderTime}
            onChange={e => handleReminderChange(e.target.value)}
            style={{ padding: "6px 8px", border: `1px solid ${L.border}`, fontSize: 12.5, color: L.text, fontFamily: "inherit", outline: "none" }}
          />
          {reminderTime && (
            <button
              onClick={() => handleReminderChange("")}
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11.5, color: L.dim, textDecoration: "underline" }}
            >
              clear
            </button>
          )}
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
      </div>
    </div>
  );
}
