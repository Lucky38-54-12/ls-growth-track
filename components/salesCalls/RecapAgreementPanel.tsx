"use client";
import { useState } from "react";
import { SalesCall } from "@/lib/types";

const L = { border: "#e2e8f0", text: "#0f172a", muted: "#64748b" };

// Shared between the Sales Calls list (compact, inline in a call row) and the
// Client Onboarding pages (the "review everything for this client" surface)
// so recap/agreement review and sending only exists in one place.
export default function RecapAgreementPanel({ call, onUpdated }: { call: SalesCall; onUpdated: (call: SalesCall) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ subject: call.recap_subject || "", html: call.recap_html || "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function saveEdit() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/sales-calls/${call.id}/recap`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Couldn't save that edit.");
        return;
      }
      onUpdated(data.call);
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
      const res = await fetch(`/api/sales-calls/${call.id}/recap`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Couldn't send that recap.");
        return;
      }
      onUpdated(data.call);
    } catch {
      setError("Couldn't send that recap.");
    } finally {
      setBusy(false);
    }
  }

  const hasDeal = call.deal_agreed && call.deal_terms;
  const hasRecap = call.recap_status === "pending" || call.recap_status === "sent";
  if (!hasDeal && !hasRecap) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {hasDeal && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: L.muted, marginBottom: 3 }}>Deal agreed</div>
          <div style={{ fontSize: 13, color: L.text, whiteSpace: "pre-wrap" }}>{call.deal_terms}</div>
          {call.agreement_status === "generated" && call.agreement_doc_url && (
            <a href={call.agreement_doc_url} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 6, fontSize: 12.5, fontWeight: 700 }}>
              Open drafted agreement →
            </a>
          )}
          {call.agreement_status === "failed" && (
            <div style={{ fontSize: 12.5, color: "#991b1b", marginTop: 6 }}>Agreement doc generation failed — use the agreement maker manually.</div>
          )}
        </div>
      )}

      {hasRecap && !editing && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: L.muted, marginBottom: 3 }}>
            {call.recap_status === "sent" ? `Recap sent to ${call.recap_recipient}` : `Recap draft, to: ${call.recap_recipient}`}
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: L.text, marginBottom: 6 }}>{call.recap_subject}</div>
          <div
            style={{ fontSize: 12.5, color: L.text, background: "#f8fafc", border: `1px solid ${L.border}`, padding: 12, maxHeight: 260, overflowY: "auto" }}
            dangerouslySetInnerHTML={{ __html: call.recap_html || "" }}
          />
          {call.recap_status === "pending" && (
            <>
              {error && <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", color: "#991b1b", padding: "8px 12px", fontSize: 13, marginTop: 8 }}>{error}</div>}
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={send}
                  disabled={busy}
                  style={{ padding: "6px 14px", background: busy ? "#fca5a5" : "var(--accent)", color: "#fff", border: "none", fontSize: 12, fontWeight: 700, cursor: busy ? "default" : "pointer" }}
                >
                  {busy ? "Sending…" : "Send recap"}
                </button>
                <button
                  type="button"
                  onClick={() => { setDraft({ subject: call.recap_subject || "", html: call.recap_html || "" }); setEditing(true); setError(""); }}
                  style={{ padding: "6px 14px", background: "#fff", color: L.text, border: `1px solid ${L.border}`, fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                >
                  Edit recap
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {hasRecap && editing && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: L.muted, marginBottom: 3 }}>Edit recap (to: {call.recap_recipient})</div>
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
