"use client";
import { useState } from "react";
import { OnboardingClient } from "@/lib/types";

const L = { border: "#e2e8f0", text: "#0f172a", muted: "#64748b" };

export default function KickoffEmailPanel({ client, onUpdated }: { client: OnboardingClient; onUpdated: (client: OnboardingClient) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ subject: client.kickoff_email_subject || "", html: client.kickoff_email_html || "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (client.kickoff_email_status === "none") return null;

  async function saveEdit() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/onboarding/${client.id}/kickoff-email`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Couldn't save that edit.");
        return;
      }
      onUpdated(data.client);
      setEditing(false);
    } catch {
      setError("Couldn't save that edit.");
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/onboarding/${client.id}/kickoff-email`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Couldn't send that email.");
        return;
      }
      onUpdated(data.client);
    } catch {
      setError("Couldn't send that email.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: L.muted, marginBottom: 3 }}>
        {client.kickoff_email_status === "sent" ? `Kickoff email sent to ${client.email}` : `Kickoff email draft, to: ${client.email}`}
      </div>

      {!editing && (
        <>
          <div style={{ fontSize: 13, fontWeight: 700, color: L.text, marginBottom: 6 }}>{client.kickoff_email_subject}</div>
          <div
            style={{ fontSize: 12.5, color: L.text, background: "#f8fafc", border: `1px solid ${L.border}`, padding: 12, maxHeight: 260, overflowY: "auto" }}
            dangerouslySetInnerHTML={{ __html: client.kickoff_email_html || "" }}
          />
          {client.kickoff_email_status === "pending" && (
            <>
              {error && <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", color: "#991b1b", padding: "8px 12px", fontSize: 13, marginTop: 8 }}>{error}</div>}
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={send}
                  disabled={busy}
                  style={{ padding: "6px 14px", background: busy ? "#fca5a5" : "var(--accent)", color: "#fff", border: "none", fontSize: 12, fontWeight: 700, cursor: busy ? "default" : "pointer" }}
                >
                  {busy ? "Sending…" : "Send kickoff email"}
                </button>
                <button
                  type="button"
                  onClick={() => { setDraft({ subject: client.kickoff_email_subject || "", html: client.kickoff_email_html || "" }); setEditing(true); setError(""); }}
                  style={{ padding: "6px 14px", background: "#fff", color: L.text, border: `1px solid ${L.border}`, fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                >
                  Edit
                </button>
              </div>
            </>
          )}
        </>
      )}

      {editing && (
        <div>
          {error && <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", color: "#991b1b", padding: "8px 12px", fontSize: 13, marginBottom: 8 }}>{error}</div>}
          <label>Subject</label>
          <input value={draft.subject} onChange={(e) => setDraft((d) => ({ ...d, subject: e.target.value }))} style={{ marginBottom: 8 }} />
          <label>Body (HTML)</label>
          <textarea
            rows={8}
            value={draft.html}
            onChange={(e) => setDraft((d) => ({ ...d, html: e.target.value }))}
            style={{ display: "block", width: "100%", boxSizing: "border-box", resize: "vertical", fontFamily: "monospace", fontSize: 12 }}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button
              type="button"
              onClick={saveEdit}
              disabled={busy}
              style={{ padding: "6px 14px", background: busy ? "#fca5a5" : "var(--accent)", color: "#fff", border: "none", fontSize: 12, fontWeight: 700, cursor: busy ? "default" : "pointer" }}
            >
              {busy ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => { setEditing(false); setError(""); }}
              style={{ padding: "6px 14px", background: "#fff", color: L.text, border: `1px solid ${L.border}`, fontSize: 12, fontWeight: 700, cursor: "pointer" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
