"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { coldEmailDraft } from "@/lib/templates";
import Topbar from "@/components/Topbar";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b" };

const PLACEHOLDER_HTML = "<p><em>Paste your notes and generate an email to preview it here.</em></p>";

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
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [previewVersion, setPreviewVersion] = useState(0);

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
      setSubject(result.subject);
      setBodyHtml(result.bodyHtml);
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
      body: JSON.stringify({ callNotes, subject, bodyHtml: finalBodyHtml }),
    });
    const sendData = await sendRes.json();
    setLoading(false);

    if (sendData.sendError) {
      router.push(`/dashboard?flash=${encodeURIComponent(`Saved ${leadData.lead.company} but email failed: ${sendData.sendError}`)}`);
      return;
    }
    router.push(`/dashboard?flash=${encodeURIComponent(`Sent personalised email to ${leadData.lead.company}.`)}`);
  }

  return (
    <div>
      <Topbar title="COLD CALL" subtitle="Paste your notes, generate a follow-up email, and send it now" />

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
                style={{ marginBottom: 12 }}
              />
              <button
                type="button"
                onClick={handleGenerate}
                disabled={generating}
                className="btn-lift"
                style={{ padding: "10px 20px", background: generating ? "#fca5a5" : "var(--red)", color: "#fff", border: "none", borderRadius: 0, fontSize: 13, fontWeight: 700, cursor: generating ? "default" : "pointer" }}
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
    </div>
  );
}
