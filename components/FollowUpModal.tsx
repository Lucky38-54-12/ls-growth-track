"use client";

import { useState, useEffect } from "react";
import { X, Send, Loader2 } from "lucide-react";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };

interface FollowUpData {
  subject: string;
  bodyHtml: string;
  lastTouchSummary: string;
  to: string;
  contactName: string;
  company: string;
}

export default function FollowUpModal({
  leadId,
  company,
  onClose,
}: {
  leadId: string;
  company: string;
  onClose: () => void;
}) {
  const [state, setState] = useState<"loading" | "ready" | "sending" | "sent" | "error">("loading");
  const [data, setData] = useState<FollowUpData | null>(null);
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    fetch(`/api/leads/${leadId}/followup-email`, { method: "POST" })
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error || "Failed");
        setData(json);
        setSubject(json.subject);
        setBodyText(
          json.bodyHtml
            .replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
            .replace(/<br\s*\/?>/gi, "\n")
            .replace(/<[^>]+>/g, "")
            .trim()
        );
        setState("ready");
      })
      .catch((e) => {
        setErrorMsg(e.message);
        setState("error");
      });
  }, [leadId]);

  async function send() {
    if (!data) return;
    setState("sending");
    try {
      const bodyHtml = `<p>${bodyText.trim().replace(/\n\n+/g, "</p><p>").replace(/\n/g, "<br/>")}</p>`;
      const res = await fetch("/api/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: data.to, subject, body: bodyHtml }),
      });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error || "Send failed");
      }
      setState("sent");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Send failed");
      setState("error");
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: L.surface, border: `1px solid ${L.border}`, width: "100%", maxWidth: 560,
          maxHeight: "90vh", overflowY: "auto", display: "flex", flexDirection: "column",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${L.border}` }}>
          <div>
            <p style={{ fontSize: 13, fontWeight: 800, color: L.text }}>Re-engage {company}</p>
            {data?.lastTouchSummary && (
              <p style={{ fontSize: 11, color: L.muted, marginTop: 2 }}>{data.lastTouchSummary}</p>
            )}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
            <X style={{ width: 16, height: 16, color: L.muted }} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 16, flex: 1 }}>
          {state === "loading" && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: L.muted, fontSize: 13 }}>
              <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} />
              Loading inbox history and drafting email…
            </div>
          )}

          {state === "error" && (
            <p style={{ fontSize: 13, color: "#dc2626" }}>Error: {errorMsg}</p>
          )}

          {state === "sent" && (
            <p style={{ fontSize: 13, fontWeight: 700, color: "#16a34a" }}>Email sent to {data?.to}</p>
          )}

          {(state === "ready" || state === "sending") && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: L.muted, display: "block", marginBottom: 4 }}>TO</label>
                <p style={{ fontSize: 12, color: L.text }}>{data?.to}</p>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: L.muted, display: "block", marginBottom: 4 }}>SUBJECT</label>
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  style={{ width: "100%", fontSize: 13, padding: "8px 10px", border: `1px solid ${L.border}`, outline: "none", color: L.text, boxSizing: "border-box" }}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: L.muted, display: "block", marginBottom: 4 }}>EMAIL</label>
                <textarea
                  value={bodyText}
                  onChange={(e) => setBodyText(e.target.value)}
                  rows={8}
                  style={{ width: "100%", fontSize: 12.5, padding: "8px 10px", border: `1px solid ${L.border}`, outline: "none", color: L.text, resize: "vertical", lineHeight: 1.6, boxSizing: "border-box", fontFamily: "inherit" }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {(state === "ready" || state === "sending") && (
          <div style={{ padding: "12px 16px", borderTop: `1px solid ${L.border}`, display: "flex", justifyContent: "flex-end" }}>
            <button
              onClick={send}
              disabled={state === "sending"}
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "8px 16px",
                background: state === "sending" ? L.border : "var(--red)", color: "#fff",
                border: "none", cursor: state === "sending" ? "default" : "pointer",
                fontSize: 13, fontWeight: 700,
              }}
            >
              {state === "sending"
                ? <><Loader2 style={{ width: 13, height: 13, animation: "spin 1s linear infinite" }} /> Sending…</>
                : <><Send style={{ width: 13, height: 13 }} /> Send Email</>
              }
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
