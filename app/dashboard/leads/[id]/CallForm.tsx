"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lead } from "@/lib/types";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "" },
  { value: "booked", label: "Booked" },
  { value: "replied", label: "Replied / interested" },
  { value: "not_interested", label: "Not interested" },
  { value: "sequence_complete", label: "Sequence complete" },
];

export default function CallForm({ lead }: { lead: Lead }) {
  const router = useRouter();
  const [callNotes, setCallNotes] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!callNotes.trim() && !(subject.trim() && bodyHtml.trim()) && !status) {
      setError("Add call notes, an email to send, or a status change first.");
      return;
    }
    setLoading(true);
    setError("");

    const res = await fetch(`/api/leads/${lead.lead_id}/followup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callNotes, subject, bodyHtml, status }),
    });
    const data = await res.json();
    setLoading(false);
    if (data.error) { setError(data.error); return; }

    const parts: string[] = [];
    if (callNotes.trim()) parts.push("Saved call notes.");
    if (data.sent) parts.push(`Sent follow-up to ${lead.company}.`);
    if (data.sendError) parts.push(`Email failed to send — ${data.sendError}`);
    if (status) parts.push(`Status updated to ${status}.`);
    router.push(`/dashboard?flash=${encodeURIComponent(parts.join(" ") || "Saved.")}`);
  }

  return (
    <div>
      <div style={{ background: "#fff", borderBottom: `1px solid ${L.border}`, padding: "0 28px", height: 68, display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 34, height: 34, borderRadius: 0, background: "var(--red)", flexShrink: 0 }} />
        <div>
          <h1 style={{ fontSize: 17, fontWeight: 900, letterSpacing: "0.04em" }}>LOG CALL</h1>
          <p style={{ color: L.muted, fontSize: 12, marginTop: 1 }}>{lead.company} &middot; {lead.contact_name} &middot; {lead.email}</p>
        </div>
      </div>

      <div style={{ maxWidth: 720, margin: "32px auto", padding: "0 28px" }}>
        {error && <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", color: "#991b1b", padding: "10px 16px", borderRadius: 0, marginBottom: 18, fontSize: 14 }}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 0, padding: 24, marginBottom: 20 }}>
            <div style={{ fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, fontWeight: 800, marginBottom: 4 }}>Call notes</div>
            <p style={{ fontSize: 13, color: L.muted, marginBottom: 12 }}>
              Paste how the call went. Send these notes to Lucky/Claude to get a personalised follow-up written, then paste it below.
            </p>
            <textarea value={callNotes} onChange={(e) => setCallNotes(e.target.value)} rows={6} placeholder="What did they say? Objections, interest level, next steps..." />
          </div>

          <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 0, padding: 24, marginBottom: 20 }}>
            <div style={{ fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, fontWeight: 800, marginBottom: 4 }}>Send follow-up</div>
            <p style={{ fontSize: 13, color: L.muted, marginBottom: 16 }}>
              Leave blank to just save the call notes without sending. Use <code>{"{{CTA_LINK}}"}</code> as the href for the booking link.
            </p>
            <div style={{ marginBottom: 14 }}>
              <label>Subject</label>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={`e.g. Great chatting today, ${lead.contact_name}`} />
            </div>
            <div>
              <label>Email body (HTML &lt;p&gt; paragraphs)</label>
              <textarea
                value={bodyHtml}
                onChange={(e) => setBodyHtml(e.target.value)}
                rows={10}
                style={{ fontFamily: "monospace", fontSize: 13 }}
                placeholder={`<p>Hey ${lead.contact_name},</p>\n<p>...</p>\n<p>Keen for a <a href="{{CTA_LINK}}">quick chat</a> this week?</p>`}
              />
            </div>
          </div>

          <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 0, padding: 24, marginBottom: 20 }}>
            <label>Update status <span style={{ fontWeight: 400, color: L.dimmed }}>(optional)</span></label>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.value === "" ? `No change (currently ${lead.status})` : o.label}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", gap: 12 }}>
            <button type="submit" disabled={loading} style={{
              padding: "11px 24px", background: loading ? "#fca5a5" : "var(--red)", color: "#fff",
              border: "none", borderRadius: 0, fontSize: 14, fontWeight: 700, cursor: loading ? "default" : "pointer",
            }}>{loading ? "Saving…" : "Save & send"}</button>
            <a href="/dashboard" style={{
              padding: "11px 20px", background: "#f8fafc", color: L.text,
              border: `1px solid ${L.border}`, borderRadius: 0, fontSize: 14, fontWeight: 700,
              display: "inline-flex", alignItems: "center",
            }}>Cancel</a>
          </div>
        </form>

        {lead.notes?.trim() && (
          <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 0, padding: 24, marginTop: 20 }}>
            <div style={{ fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, fontWeight: 800, marginBottom: 10 }}>Previous notes</div>
            <p style={{ fontSize: 13.5, whiteSpace: "pre-wrap", color: L.text }}>{lead.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}
