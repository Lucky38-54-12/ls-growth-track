"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { EmailEvent, EmailSend, Lead } from "@/lib/types";
import { deviceFromUserAgent, formatDateTime } from "@/lib/format";
import Topbar from "@/components/Topbar";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "" },
  { value: "booked", label: "Booked" },
  { value: "replied", label: "Replied / interested" },
  { value: "not_interested", label: "Not interested" },
  { value: "sequence_complete", label: "Sequence complete" },
];

export default function CallForm({ lead, events, sends }: { lead: Lead; events: EmailEvent[]; sends: EmailSend[] }) {
  const router = useRouter();
  const [callNotes, setCallNotes] = useState("");
  const [meetingDateTime, setMeetingDateTime] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!callNotes.trim() && !(subject.trim() && bodyHtml.trim()) && !status && !meetingDateTime) {
      setError("Add call notes, an email to send, a status change, or a meeting time first.");
      return;
    }
    setLoading(true);
    setError("");

    const res = await fetch(`/api/leads/${lead.lead_id}/followup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callNotes, subject, bodyHtml, status, meetingDateTime: meetingDateTime || undefined }),
    });
    const data = await res.json();
    setLoading(false);
    if (data.error) { setError(data.error); return; }

    const parts: string[] = [];
    if (callNotes.trim()) parts.push("Saved call notes.");
    if (data.meetingBooked) parts.push(`Booked meeting on calendar${data.meetingLink ? " with Meet link" : ""}.`);
    if (data.meetingError) parts.push(`Calendar booking failed — ${data.meetingError}`);
    if (data.sent) parts.push(`Sent follow-up to ${lead.company}.`);
    if (data.sendError) parts.push(`Email failed to send — ${data.sendError}`);
    if (status) parts.push(`Status updated to ${status}.`);
    router.push(`/dashboard?flash=${encodeURIComponent(parts.join(" ") || "Saved.")}`);
  }

  return (
    <div>
      <Topbar title="LOG CALL" subtitle={[lead.company, lead.phone, lead.contact_name, lead.email].filter(Boolean).join(" · ")} />

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
            <div style={{ fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, fontWeight: 800, marginBottom: 4 }}>Meeting booked?</div>
            <p style={{ fontSize: 13, color: L.muted, marginBottom: 12 }}>
              If they agreed to a time on the call, set it here — this adds it to the calendar with a Google Meet link and invites {lead.email}. Use <code>{"{{MEETING_LINK}}"}</code> as the href in the email below to drop in the link.
            </p>
            <input type="datetime-local" value={meetingDateTime} onChange={(e) => setMeetingDateTime(e.target.value)} style={{ maxWidth: 280 }} />
          </div>

          <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 0, padding: 24, marginBottom: 20 }}>
            <div style={{ fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, fontWeight: 800, marginBottom: 4 }}>Send follow-up</div>
            <p style={{ fontSize: 13, color: L.muted, marginBottom: 16 }}>
              Leave blank to just save the call notes without sending. Use <code>{"{{CTA_LINK}}"}</code> as the href for the booking link, or <code>{"{{MEETING_LINK}}"}</code> for the Meet link if a meeting was booked above.
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
            <button type="submit" disabled={loading} className="btn-lift" style={{
              padding: "11px 24px", background: loading ? "#fca5a5" : "var(--red)", color: "#fff",
              border: "none", borderRadius: 0, fontSize: 14, fontWeight: 700, cursor: loading ? "default" : "pointer",
            }}>{loading ? "Saving…" : "Save & send"}</button>
            <a href="/dashboard" className="btn-lift" style={{
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

        <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 0, padding: 24, marginTop: 20 }}>
          <div style={{ fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, fontWeight: 800, marginBottom: 10 }}>
            Sent emails — {sends.length}
          </div>
          {sends.length === 0 ? (
            <p style={{ fontSize: 13, color: L.dimmed }}>No emails sent to this lead yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {sends.map((s) => (
                <details key={s.id} style={{ border: `1px solid ${L.border}`, background: "#f8fafc" }}>
                  <summary style={{ padding: "10px 12px", cursor: "pointer", fontSize: 13 }}>
                    <span style={{ fontWeight: 700, color: L.text }}>{s.subject}</span>
                    <span style={{ color: L.dimmed, marginLeft: 8 }}>{formatDateTime(s.sent_at)}</span>
                  </summary>
                  <div
                    style={{ padding: "12px 16px", borderTop: `1px solid ${L.border}`, fontFamily: "Arial,Helvetica,sans-serif", fontSize: 14, color: L.text, lineHeight: 1.5 }}
                    dangerouslySetInnerHTML={{ __html: s.body_html }}
                  />
                </details>
              ))}
            </div>
          )}
        </div>

        <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 0, padding: 24, marginTop: 20 }}>
          <div style={{ fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, fontWeight: 800, marginBottom: 10 }}>
            Activity — {events.length} event{events.length !== 1 ? "s" : ""}
          </div>
          {events.length === 0 ? (
            <p style={{ fontSize: 13, color: L.dimmed }}>No opens or clicks tracked yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {events.map((ev) => {
                const isOpen = ev.event_type === "open";
                return (
                  <div key={ev.id} style={{
                    display: "flex", alignItems: "flex-start", gap: 12,
                    padding: "10px 12px", border: `1px solid ${L.border}`, background: "#f8fafc",
                  }}>
                    <div style={{
                      width: 32, height: 32, flexShrink: 0, borderRadius: 0,
                      background: isOpen ? "#dbeafe" : "#fce7f3",
                      color: isOpen ? "#1e40af" : "#9d174d",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontWeight: 900, fontSize: 13,
                    }}>
                      {isOpen ? "👁" : "🔗"}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: L.text }}>
                        {isOpen ? "Opened email" : "Clicked link"}
                      </div>
                      <div style={{ fontSize: 12, color: L.muted, marginTop: 1 }}>{formatDateTime(ev.created_at)}</div>
                      {!isOpen && ev.url && (
                        <div style={{ fontSize: 11.5, color: L.dimmed, marginTop: 2, wordBreak: "break-all" }}>{ev.url}</div>
                      )}
                      <div style={{ fontSize: 11.5, color: L.dimmed, marginTop: 2 }}>
                        {deviceFromUserAgent(ev.user_agent)}{ev.ip ? ` · ${ev.ip}` : ""}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
