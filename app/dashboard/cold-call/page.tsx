"use client";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { coldEmailDraft } from "@/lib/templates";
import Topbar from "@/components/Topbar";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b" };

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

  async function generateFromNotes(data: { company: string; contact_name: string; trade: string; location: string; callNotes: string }) {
    try {
      const res = await fetch("/api/generate-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (result.error) return null;
      return { subject: result.subject as string, bodyHtml: result.bodyHtml as string };
    } catch {
      return null;
    }
  }

  async function handleGenerate() {
    if (!callNotes.trim()) {
      setError("Add some call notes first, then generate the email.");
      return;
    }
    setGenerating(true);
    setError("");
    const generated = await generateFromNotes({ company, contact_name: contactName, trade, location, callNotes });
    setGenerating(false);
    if (!generated) {
      setError("Couldn't generate an email right now. Try again, or write/insert one manually.");
      return;
    }
    setSubject(generated.subject);
    setBodyHtml(generated.bodyHtml);
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
  }

  const preview = useMemo(() => {
    const filledBody = bodyHtml.replace(/\{\{CTA_LINK\}\}/g, "#") || "<p><em>Write or insert an email body to preview it here.</em></p>";
    return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.5;max-width:560px;">
${filledBody}
  <p>Cheers,<br>Lucky<br>LS Growth</p>
</div>`;
  }, [bodyHtml]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!subject.trim() || !bodyHtml.trim()) {
      setError("Add a subject and email body before sending.");
      return;
    }
    setLoading(true);
    setError("");

    const leadRes = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company, contact_name: contactName, email, trade, location, sendInitialEmail: false }),
    });
    const leadData = await leadRes.json();
    if (leadData.error) { setLoading(false); setError(leadData.error); return; }

    const sendRes = await fetch(`/api/leads/${leadData.lead.lead_id}/followup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callNotes, subject, bodyHtml }),
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
      <Topbar title="COLD CALL" subtitle="Log who you called, generate a follow-up email, and send it now" />

      <div style={{ maxWidth: 1080, margin: "32px auto", padding: "0 28px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" }}>
        <div>
          {error && <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", color: "#991b1b", padding: "10px 16px", borderRadius: 0, marginBottom: 18, fontSize: 14 }}>{error}</div>}

          <form onSubmit={handleSubmit}>
            <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 0, padding: 24, marginBottom: 20 }}>
              <div style={{ fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, fontWeight: 800, marginBottom: 4 }}>Who you called</div>
              <p style={{ fontSize: 13, color: L.muted, marginBottom: 16 }}>This creates the lead in your pipeline and is who the email gets sent to.</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <label>Company</label>
                  <input value={company} onChange={(e) => setCompany(e.target.value)} required placeholder="e.g. Acme Plumbing" />
                </div>
                <div>
                  <label>Contact first name</label>
                  <input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="e.g. Mike — leave blank for 'there'" />
                </div>
                <div>
                  <label>Email</label>
                  <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label>Trade</label>
                    <input value={trade} onChange={(e) => setTrade(e.target.value)} required placeholder="e.g. Plumbing" />
                  </div>
                  <div>
                    <label>Location</label>
                    <input value={location} onChange={(e) => setLocation(e.target.value)} required placeholder="e.g. Auckland NZ" />
                  </div>
                </div>
              </div>
            </div>

            <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 0, padding: 24, marginBottom: 20 }}>
              <div style={{ fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, fontWeight: 800, marginBottom: 4 }}>Call notes</div>
              <p style={{ fontSize: 13, color: L.muted, marginBottom: 12 }}>
                What did they say? Objections, interest level, next steps. Saved to the lead so you can pick it up later.
              </p>
              <textarea value={callNotes} onChange={(e) => setCallNotes(e.target.value)} rows={4} placeholder="e.g. Spoke to Mike, busy until next month but interested in more jobs..." style={{ marginBottom: 12 }} />
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

            <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 0, padding: 24, marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
                <div style={{ fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, fontWeight: 800 }}>Personalised email</div>
                <button type="button" onClick={handleInsertTemplate} className="btn-lift" style={{
                  padding: "6px 12px", background: "#f8fafc", color: L.text, border: `1px solid ${L.border}`, borderRadius: 0, fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
                }}>Insert cold email template</button>
              </div>
              <p style={{ fontSize: 13, color: L.muted, marginBottom: 16 }}>
                Use &quot;Generate email from notes&quot; above for a personalised draft, or write/edit it yourself. Replace <code>[MEETING LINK]</code> with your call link before sending.
              </p>
              <div style={{ marginBottom: 14 }}>
                <label>Subject</label>
                <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={`e.g. Catch-up today 1pm, quick link inside`} />
              </div>
              <div>
                <label>Email body (HTML &lt;p&gt; paragraphs)</label>
                <textarea
                  value={bodyHtml}
                  onChange={(e) => setBodyHtml(e.target.value)}
                  rows={10}
                  style={{ fontFamily: "monospace", fontSize: 13 }}
                  placeholder={`<p>Hey ${contactName || "there"},</p>\n<p>Looking forward to our chat today at 1pm. Here's the link to join:</p>\n<p>[MEETING LINK]</p>\n<p>Quick heads up on what I want to cover...</p>`}
                />
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
          </form>
        </div>

        <div style={{ position: "sticky", top: 20 }}>
          <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 0, padding: 24 }}>
            <div style={{ fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, fontWeight: 800, marginBottom: 4 }}>Preview</div>
            <p style={{ fontSize: 13, color: L.muted, marginBottom: 16 }}>This is exactly what will be sent when you save.</p>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, marginBottom: 4 }}>Subject</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: L.text, marginBottom: 14 }}>{subject || "—"}</div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, marginBottom: 8 }}>Body</div>
            <div style={{ border: `1px solid ${L.border}`, padding: 16, background: "#f8fafc" }} dangerouslySetInnerHTML={{ __html: preview }} />
          </div>
        </div>
      </div>
    </div>
  );
}
