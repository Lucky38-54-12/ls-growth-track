"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { coldEmailDraft } from "@/lib/templates";
import Topbar from "@/components/Topbar";
import { Lead, EmailCheck } from "@/lib/types";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b" };

const PLACEHOLDER_HTML = "<p><em>Paste your notes and generate an email to preview it here.</em></p>";

const LANDING_PAGES = [
  { key: "standard", label: "Standard", url: "https://lsgrowth.agency" },
  { key: "cleaning", label: "Cleaning", url: "https://lsgrowth.agency/cleaning" },
];

export default function ColdCallPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [company, setCompany] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [trade, setTrade] = useState("");
  const [location, setLocation] = useState("");

  const [callNotes, setCallNotes] = useState("");
  const [meetingDateTime, setMeetingDateTime] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [previewVersion, setPreviewVersion] = useState(0);
  const [selectedPage, setSelectedPage] = useState("standard");
  const [quality, setQuality] = useState<{ verdict: "approved" | "rejected"; mechanicalFails: string[]; judgmentFlags: string[]; reasoning: string } | null>(null);

  const [recentlyEmailed, setRecentlyEmailed] = useState<Lead[]>([]);
  const [heldChecks, setHeldChecks] = useState<EmailCheck[]>([]);

  const [noteText, setNoteText] = useState("");
  const [noteLoading, setNoteLoading] = useState(false);
  const [noteError, setNoteError] = useState("");

  useEffect(() => {
    fetch("/api/leads")
      .then(res => res.json())
      .then((data: Lead[]) => {
        if (!Array.isArray(data)) return;
        const emailed = data
          .filter(l => l.source === "cold_call" && l.last_followup)
          .sort((a, b) => (b.last_followup || "").localeCompare(a.last_followup || ""));
        setRecentlyEmailed(emailed);
      })
      .catch(() => {});
    fetch("/api/cold-call/held")
      .then(res => res.json())
      .then((data: EmailCheck[]) => { if (Array.isArray(data)) setHeldChecks(data); })
      .catch(() => {});
  }, []);

  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.innerHTML = bodyHtml || PLACEHOLDER_HTML;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewVersion]);

  function syncBodyFromPreview() {
    if (bodyRef.current) {
      setBodyHtml(bodyRef.current.innerHTML);
    }
  }

  function swapLandingPage(key: string) {
    setSelectedPage(key);
    const from = LANDING_PAGES.find(p => p.key !== key)?.url || "";
    const to = LANDING_PAGES.find(p => p.key === key)?.url || "";
    if (!from || !to || !bodyRef.current) return;
    bodyRef.current.innerHTML = bodyRef.current.innerHTML.split(from).join(to);
    setBodyHtml(bodyRef.current.innerHTML);
  }

  async function handleGenerate() {
    if (!callNotes.trim()) {
      setError("Paste your notes first, then generate the email.");
      return;
    }
    setGenerating(true);
    setError("");
    try {
      const res = await fetch("/api/generate-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callNotes }),
      });
      const result = await res.json();
      if (result.error) {
        setError("Couldn't generate an email right now. Try again, or write/insert one manually.");
        return;
      }
      setCompany(result.company || "");
      setContactName(result.contact_name || "");
      setEmail(result.email || "");
      setTrade(result.trade || "");
      setLocation(result.location || "");
      setMeetingDateTime(result.meetingDateTime || "");
      setSubject(result.subject);
      setBodyHtml(result.bodyHtml);
      setQuality(result.quality || null);
      setGenerated(true);
      setPreviewVersion((v) => v + 1);
    } catch {
      setError("Couldn't generate an email right now. Try again, or write/insert one manually.");
    } finally {
      setGenerating(false);
    }
  }

  function handleInsertTemplate() {
    const draft = coldEmailDraft({
      company: company || "[company]",
      contact_name: contactName || "there",
      trade: trade || "[trade]",
      location: location || "[location]",
    });
    setSubject(draft.subject);
    setBodyHtml(draft.bodyHtml);
    setQuality(null);
    setGenerated(true);
    setPreviewVersion((v) => v + 1);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    syncBodyFromPreview();
    const finalBodyHtml = bodyRef.current?.innerHTML || bodyHtml;

    if (!company.trim() || !email.trim()) {
      setError("Couldn't find a company name and email in your notes — fill them in below before sending.");
      return;
    }
    if (!subject.trim() || !finalBodyHtml.trim()) {
      setError("Add a subject and email body before sending.");
      return;
    }
    setLoading(true);
    setError("");

    const leadRes = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company, contact_name: contactName, email, trade, location, source: "cold_call", sendInitialEmail: false }),
    });
    const leadData = await leadRes.json();
    if (leadData.error) { setLoading(false); setError(leadData.error); return; }

    const sendRes = await fetch(`/api/leads/${leadData.lead.lead_id}/followup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callNotes, subject, bodyHtml: finalBodyHtml, meetingDateTime: meetingDateTime || undefined }),
    });
    const sendData = await sendRes.json();
    setLoading(false);

    const parts: string[] = [];
    if (sendData.meetingBooked) parts.push(`Booked meeting on calendar${sendData.meetingLink ? " with Meet link" : ""}.`);
    if (sendData.meetingError) parts.push(`Calendar booking failed — ${sendData.meetingError}`);
    if (sendData.sendError) {
      parts.push(`Saved ${leadData.lead.company} but email failed: ${sendData.sendError}`);
    } else {
      parts.push(`Sent personalised email to ${leadData.lead.company}.`);
    }
    router.push(`/dashboard?flash=${encodeURIComponent(parts.join(" "))}`);
  }

  async function handleSaveNoteOnly(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!noteText.trim()) {
      setNoteError("Write a quick note first.");
      return;
    }
    setNoteLoading(true);
    setNoteError("");

    const quickRes = await fetch("/api/leads/quick-note", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: noteText }),
    });
    const quickData = await quickRes.json();
    if (quickData.error) { setNoteLoading(false); setNoteError(quickData.error); return; }

    const today = new Date().toISOString().split("T")[0];
    const entry = `[${today} call] ${quickData.summary}`;

    const res = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company: quickData.company,
        contact_name: quickData.contact_name,
        notes: entry,
        source: "cold_call",
      }),
    });
    const data = await res.json();
    setNoteLoading(false);
    if (data.error) { setNoteError(data.error); return; }

    router.push(`/dashboard?flash=${encodeURIComponent(`Saved a note for ${data.lead.company} and added them to the pipeline.`)}`);
  }

  return (
    <div>
      <Topbar title="COLD CALL" subtitle="Paste your notes, generate a follow-up email, and send it now" />

      {heldChecks.length > 0 && (
        <div style={{ maxWidth: 1080, margin: "24px auto 0", padding: "0 28px" }}>
          <div style={{ background: "#fff1f2", border: "1px solid #fecdd3", borderRadius: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 18px", borderBottom: "1px solid #fecdd3" }}>
              <ShieldAlert style={{ width: 15, height: 15, color: "#be123c" }} />
              <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "#be123c" }}>Held for review</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#be123c" }}>{heldChecks.length}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {heldChecks.map(check => (
                <div key={check.id} style={{ padding: "12px 18px", borderBottom: "1px solid #fecdd3" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: L.text }}>{check.lead_id.replace(/^cold-call-/, "").replace(/-/g, " ")}</div>
                  <div style={{ fontSize: 11.5, color: "#9f1239", marginTop: 2 }}>
                    {check.mechanical_fails?.[0] || check.judgment_flags?.[0] || check.reasoning || "Flagged by AI check"}
                  </div>
                  <div style={{ fontSize: 11, color: L.muted, marginTop: 4 }}>
                    Paste the same call notes above and generate again — the fix is already in the generator.
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div style={{ maxWidth: 1080, margin: "32px auto", padding: "0 28px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" }}>
        <div>
          {error && <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", color: "#991b1b", padding: "10px 16px", borderRadius: 0, marginBottom: 18, fontSize: 14 }}>{error}</div>}

          <form onSubmit={handleSubmit}>
            <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 0, padding: 24, marginBottom: 20 }}>
              <div style={{ fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, fontWeight: 800, marginBottom: 4 }}>Call notes</div>
              <p style={{ fontSize: 13, color: L.muted, marginBottom: 12 }}>
                Paste or type up your notes from the call — who you spoke to, their company, email, trade, location, what they said, objections, next steps. We'll pull out the details and draft the follow-up for you.
              </p>
              <textarea
                value={callNotes}
                onChange={(e) => setCallNotes(e.target.value)}
                rows={8}
                placeholder={`e.g. Mike from Acme Plumbing, mike@acmeplumbing.co.nz, Auckland. Busy until next month but interested in more jobs, said to follow up in a few weeks...`}
                style={{ display: "block", width: "100%", boxSizing: "border-box", resize: "vertical", marginBottom: 16 }}
              />
              <button
                type="button"
                onClick={handleGenerate}
                disabled={generating}
                className="btn-lift"
                style={{ display: "inline-block", padding: "10px 20px", background: generating ? "#fca5a5" : "var(--red)", color: "#fff", border: "none", borderRadius: 0, fontSize: 13, fontWeight: 700, cursor: generating ? "default" : "pointer" }}
              >
                {generating ? "Generating…" : "Generate email from notes"}
              </button>
            </div>

            {generated && (
              <>
                <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 0, padding: 24, marginBottom: 20 }}>
                  <div style={{ fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, fontWeight: 800, marginBottom: 4 }}>Lead details</div>
                  <p style={{ fontSize: 13, color: L.muted, marginBottom: 16 }}>
                    Pulled from your notes. This creates the lead in your pipeline and is who the email gets sent to — fix anything that's missing or wrong.
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <div>
                        <label>Company</label>
                        <input value={company} onChange={(e) => setCompany(e.target.value)} required placeholder="e.g. Acme Plumbing" />
                      </div>
                      <div>
                        <label>Contact first name</label>
                        <input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="e.g. Mike — leave blank for 'there'" />
                      </div>
                    </div>
                    <div>
                      <label>Email</label>
                      <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <div>
                        <label>Trade</label>
                        <input value={trade} onChange={(e) => setTrade(e.target.value)} placeholder="e.g. Plumbing" />
                      </div>
                      <div>
                        <label>Location</label>
                        <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Auckland NZ" />
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 0, padding: 24, marginBottom: 20 }}>
                  <div style={{ fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, fontWeight: 800, marginBottom: 4 }}>Meeting booked?</div>
                  <p style={{ fontSize: 13, color: L.muted, marginBottom: 12 }}>
                    Pulled from your notes if a time was agreed — check it's right. On send, this adds it to the calendar with a Google Meet link and invites {email || "their email"}, and fills any <code>[MEETING LINK]</code> placeholder in the email above. Leave blank if no meeting was booked.
                  </p>
                  <input type="datetime-local" value={meetingDateTime} onChange={(e) => setMeetingDateTime(e.target.value)} style={{ maxWidth: 280 }} />
                </div>

                <div style={{ display: "flex", gap: 12 }}>
                  <button type="submit" disabled={loading} className="btn-lift" style={{
                    padding: "11px 24px", background: loading ? "#fca5a5" : "var(--red)", color: "#fff",
                    border: "none", borderRadius: 0, fontSize: 14, fontWeight: 700, cursor: loading ? "default" : "pointer",
                  }}>
                    {loading ? "Sending…" : "Save & send now"}
                  </button>
                  <a href="/dashboard" className="btn-lift" style={{
                    padding: "11px 20px", background: "#f8fafc", color: L.text,
                    border: `1px solid ${L.border}`, borderRadius: 0, fontSize: 14, fontWeight: 700,
                    display: "inline-flex", alignItems: "center",
                  }}>Cancel</a>
                </div>
              </>
            )}
          </form>

          <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 0, padding: 24, marginBottom: 20 }}>
            <div style={{ fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, fontWeight: 800, marginBottom: 4 }}>Owner not available?</div>
            <p style={{ fontSize: 13, color: L.muted, marginBottom: 12 }}>
              No email to send yet — just jot down what happened. We'll pull out the business name, summarise it, and add them to the pipeline.
            </p>
            {noteError && <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", color: "#991b1b", padding: "10px 16px", borderRadius: 0, marginBottom: 12, fontSize: 13 }}>{noteError}</div>}
            <form onSubmit={handleSaveNoteOnly}>
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                rows={8}
                placeholder="e.g. Called Acme Plumbing, owner was out on a job — call back Thursday afternoon."
                style={{ display: "block", width: "100%", boxSizing: "border-box", resize: "vertical", marginBottom: 16 }}
              />
              <button
                type="submit"
                disabled={noteLoading}
                className="btn-lift"
                style={{ display: "inline-block", padding: "10px 20px", background: noteLoading ? "#fca5a5" : "var(--red)", color: "#fff", border: "none", borderRadius: 0, fontSize: 13, fontWeight: 700, cursor: noteLoading ? "default" : "pointer" }}
              >
                {noteLoading ? "Saving…" : "Save note & add to pipeline"}
              </button>
            </form>
          </div>
        </div>

        <div style={{ position: "sticky", top: 20 }}>
          <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 0, padding: 24 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
              <div style={{ fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, fontWeight: 800 }}>Preview</div>
              {generated && (
                <button type="button" onClick={handleInsertTemplate} className="btn-lift" style={{
                  padding: "6px 12px", background: "#f8fafc", color: L.text, border: `1px solid ${L.border}`, borderRadius: 0, fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
                }}>Insert cold email template</button>
              )}
            </div>

            {quality && (
              <div style={{
                display: "flex", flexDirection: "column", gap: 4, marginBottom: 14, padding: "8px 12px",
                fontSize: 11.5, borderRadius: 0,
                background: quality.verdict === "approved" ? "#f0fdf4" : "#fff1f2",
                border: `1px solid ${quality.verdict === "approved" ? "#bbf7d0" : "#fecdd3"}`,
                color: quality.verdict === "approved" ? "#15803d" : "#9f1239",
              }}>
                <div style={{ fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", fontSize: 10.5 }}>
                  {quality.verdict === "approved" ? "AI check: approved" : "AI check: needs a look"}
                </div>
                {quality.verdict === "rejected" && (
                  <>
                    {quality.reasoning && <div>{quality.reasoning}</div>}
                    {[...quality.mechanicalFails, ...quality.judgmentFlags].map((flag, i) => (
                      <div key={i}>• {flag}</div>
                    ))}
                  </>
                )}
              </div>
            )}

            {/* Landing page picker */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: L.muted, textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>Link:</span>
              <div style={{ display: "flex", gap: 4 }}>
                {LANDING_PAGES.map(p => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => swapLandingPage(p.key)}
                    style={{
                      padding: "5px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", border: "none", borderRadius: 0,
                      background: selectedPage === p.key ? "var(--red)" : "#f1f5f9",
                      color: selectedPage === p.key ? "#fff" : L.muted,
                    }}
                  >{p.label}</button>
                ))}
              </div>
            </div>

            <p style={{ fontSize: 13, color: L.muted, marginBottom: 16 }}>
              This is what gets sent. Click into the subject or the email below to edit it before you send.
            </p>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, marginBottom: 4 }}>Subject</div>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Catch-up today 1pm, quick link inside"
              style={{ marginBottom: 14, fontWeight: 700 }}
            />
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, marginBottom: 8 }}>Body</div>
            <div
              ref={bodyRef}
              className="email-preview"
              contentEditable={generated}
              onBlur={syncBodyFromPreview}
              suppressContentEditableWarning
              style={{
                border: `1px solid ${L.border}`,
                padding: 16,
                background: "#f8fafc",
                fontFamily: "Arial,Helvetica,sans-serif",
                fontSize: 15,
                color: "#1a1a1a",
                lineHeight: 1.5,
                minHeight: 120,
                outline: "none",
              }}
            />
            <div style={{ fontFamily: "Arial,Helvetica,sans-serif", fontSize: 15, color: "#1a1a1a", lineHeight: 1.5, padding: "0 16px" }}>
              <p>Cheers,<br />Lucky<br />LS Growth</p>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1080, margin: "0 auto 40px", padding: "0 28px" }}>
        <div style={{ background: L.surface, border: `1px solid ${L.border}`, padding: 24 }}>
          <div style={{ fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, fontWeight: 800, marginBottom: 12 }}>
            Recently emailed from cold calls
          </div>
          {recentlyEmailed.length === 0 ? (
            <p style={{ fontSize: 13, color: L.muted }}>Nobody yet — once you send a follow-up email above, they'll show up here.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {recentlyEmailed.map(l => (
                <Link key={l.lead_id} href={`/dashboard/leads/${l.lead_id}`} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                  padding: "8px 4px", textDecoration: "none", borderBottom: `1px solid ${L.border}`,
                }}>
                  <div style={{ minWidth: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: L.text }}>{l.company}</span>
                    <span style={{ fontSize: 12, color: L.muted, marginLeft: 8 }}>{l.email}</span>
                  </div>
                  <span style={{ fontSize: 11, color: L.muted, flexShrink: 0 }}>{l.last_followup}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
