"use client";
import { useState } from "react";
import { Mail, Send, X, Check } from "lucide-react";

interface Props {
  to: string;
  defaultSubject: string;
  defaultBody: string;
}

export default function MeetingReminderButton({ to, defaultSubject, defaultBody }: Props) {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  function handleOpen() {
    setSubject(defaultSubject);
    setBody(defaultBody);
    setState("idle");
    setOpen(true);
  }

  async function handleSend() {
    setState("sending");
    try {
      const res = await fetch("/api/send-reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, subject, body }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Send failed");
      setState("done");
      setTimeout(() => setOpen(false), 1400);
    } catch (err: unknown) {
      setState("error");
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  const L = { border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dim: "#94a3b8" };

  return (
    <>
      <button
        onClick={handleOpen}
        className="pill-hover"
        style={{
          display: "flex", alignItems: "center", gap: 5, padding: "5px 10px",
          fontSize: 11.5, fontWeight: 700, border: `1px solid ${L.border}`,
          background: "#fff", color: L.muted, cursor: "pointer", flexShrink: 0,
        }}
      >
        <Mail style={{ width: 12, height: 12 }} /> Remind
      </button>

      {open && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setOpen(false)}
        >
          <div
            style={{ width: "100%", maxWidth: 500, background: "#fff", margin: "0 16px", border: `1px solid ${L.border}`, boxShadow: "0 8px 32px rgba(0,0,0,0.12)" }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: `1px solid ${L.border}` }}>
              <div>
                <p style={{ fontSize: 13, fontWeight: 800, color: L.text }}>Send reminder</p>
                <p style={{ fontSize: 11, color: L.dim, marginTop: 2 }}>To: {to}</p>
              </div>
              <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: L.dim, display: "flex", padding: 4 }}>
                <X style={{ width: 14, height: 14 }} />
              </button>
            </div>

            {/* Form */}
            <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: L.muted, display: "block", marginBottom: 5 }}>Subject</label>
                <input
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", border: `1px solid ${L.border}`, fontSize: 13, color: L.text, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
                />
              </div>
              <div>
                <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: L.muted, display: "block", marginBottom: 5 }}>Message</label>
                <textarea
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  rows={7}
                  style={{ width: "100%", padding: "8px 10px", border: `1px solid ${L.border}`, fontSize: 13, color: L.text, fontFamily: "inherit", outline: "none", resize: "vertical", lineHeight: 1.6, boxSizing: "border-box" }}
                />
              </div>

              {state === "error" && (
                <p style={{ fontSize: 12, color: "var(--red)", background: "#fef2f2", padding: "8px 10px" }}>{errorMsg}</p>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: "12px 18px", borderTop: `1px solid ${L.border}`, display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => setOpen(false)} style={{
                padding: "8px 16px", fontSize: 12, fontWeight: 600, color: L.muted, background: "#fff",
                border: `1px solid ${L.border}`, cursor: "pointer",
              }}>Cancel</button>
              <button
                onClick={handleSend}
                disabled={state === "sending" || state === "done"}
                style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "8px 18px", fontSize: 12, fontWeight: 700,
                  background: state === "done" ? "var(--green, #16a34a)" : "var(--red)", color: "#fff",
                  border: "none", cursor: state === "sending" ? "wait" : "pointer", opacity: state === "sending" ? 0.7 : 1,
                }}
              >
                {state === "done" ? <><Check style={{ width: 13, height: 13 }} /> Sent!</> : state === "sending" ? "Sending..." : <><Send style={{ width: 12, height: 12 }} /> Send Reminder</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
