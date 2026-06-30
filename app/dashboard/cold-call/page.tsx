"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { coldEmailDraft } from "@/lib/templates";
import Topbar from "@/components/Topbar";
import { Lead } from "@/lib/types";
import Link from "next/link";

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
  const [meetingDateTime, setMeetingDateTime] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [previewVersion, setPreviewVersion] = useState(0);

  const [recentlyEmailed, setRecentlyEmailed] = useState<Lead[]>([]);

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

  async function handleGenerateAndSend() {
    if (!callNotes.trim()) {
      setError("Paste your notes first.");
      return;
    }
    setGenerating(true);
    setError("");
    try {
      // Step 1: extract lead details + generate email
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
      const extractedCompany = result.company || "";
      const extractedEmail = result.email || "";
      if (!extractedCompany || !extractedEmail) {
        setCompany(extractedCompany);
        setContactName(result.contact_name || "");
        setEmail(extractedEmail);
        setTrade(result.trade || "");
        setLocation(result.location || "");
        setMeetingDateTime(result.meetingDateTime || "");
        setSubject(result.subject);
        setBodyHtml(result.bodyHtml);
        setGenerated(true);
        setPreviewVersion((v) => v + 1);
        setError("Couldn't find a company name or email in your notes — fill them in below and send manually.");
        return;
      }

      // Step 2: create lead
      const leadRes = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company: extractedCompany,
          contact_name: result.contact_name || "",
          email: extractedEmail,
          trade: result.trade || "",
          location: result.location || "",
          source: "cold_call",
          sendInitialEmail: false,
        }),
      });
      const leadData = await leadRes.json();
      if (leadData.error) { setError(leadData.error); return; }

      // Step 3: send
      const sendRes = await fetch(`/api/leads/${leadData.lead.lead_id}/followup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callNotes,
          subject: result.subject,
          bodyHtml: result.bodyHtml,
          meetingDateTime: result.meetingDateTime || undefined,
        }),
      });
      const sendData = await sendRes.json();

      const parts: string[] = [];
      if (sendData.meetingBooked) parts.push(`Booked meeting on calendar${sendData.meetingLink ? " with Meet link" : ""}.`);
      if (sendData.meetingError) parts.push(`Calendar booking failed — ${sendData.meetingError}`);
      if (sendData.sendError) {
        parts.push(`Saved ${extractedCompany} but email failed: ${sendData.sendError}`);
      } else {
        parts.push(`Sent follow-up email to ${extractedCompany}.`);
      }
      router.push(`/dashboard?flash=${encodeURIComponent(parts.join(" "))}`);
    } catch {
      setError("Something went wrong. Try again.");
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

  async function handleManualSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    syncBodyFromPreview();
    const finalBodyHtml = bodyRef.current?.innerHTML || bodyHtml;

    if (!company.trim() || !email.trim()) {
      setError("Fill in company name and email before sending.");
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

  return (
    <div>
      <Topbar title="COLD CALL" subtitle="Paste your Read.ai notes and send — no extra steps" />

      <div style={{ maxWidth: 1080, margin: "32px auto", padding: "0 28px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" }}>
        <div>
          {error && <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", color: "#991b1b", padding: "10px 16px", borderRadius: 0, marginBottom: 18, fontSize: 14 }}>{error}</div>}

          <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 0, padding: 24, marginBottom: 20 }}>
            <div style={{ fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, fontWeight: 800, marginBottom: 4 }}>Call notes</div>
            <p style={{ fontSize: 13, color: L.muted, marginBottom: 12 }}>
              Paste your Read.ai summary. Claude will extract the lead details, write the follow-up email, and send it automatically.
            </p>
            <textarea
              value={callNotes}
              onChange={(e) => setCallNotes(e.target.value)}
              rows={8}
              placeholder={`Paste your Read.ai call summary here…`}
              style={{ display: "block", width: "100%", boxSizing: "border-box", resize: "vertical", marginBottom: 16 }}
            />
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <button
                type="button"
                onClick={handleGenerateAndSend}
                disabled={generating}
                className="btn-lift"
                style={{ display: "inline-block", padding: "11px 24px", background: generating ? "#fca5a5" : "var(--red)", color: "#fff", border: "none", borderRadius: 0, fontSize: 14, fontWeight: 700, cursor: generating ? "default" : "pointer" }}
              >
                {generating ? "Sending…" : "Generate & send"}
              </button>
              {generating && <span style={{ fontSize: 13, color: L.muted }}>Extracting details, writing email, sending…</span>}
            </div>
          </div>

          {/* Manual fallback — shown only when extraction fails */}
          {generated && (
            <form onSubmit={handleManualSubmit}>
              <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 0, padding: 16, marginBottom: 16 }}>
                <p style={{ fontSize: 13, color: "#92400e", fontWeight: 600 }}>Couldn&apos;t extract all details automatically — fill in what&apos;s missing and send manually.</p>
              </div>
              <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 0, padding: 24, marginBottom: 20 }}>
                <div style={{ fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, fontWeight: 800, marginBottom: 12 }}>Lead details</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div><label>Company</label><input value={company} onChange={(e) => setCompany(e.target.value)} required placeholder="e.g. Acme Plumbing" /></div>
                    <div><label>Contact first name</label><input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="e.g. Mike" /></div>
                  </div>
                  <div><label>Email</label><input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required /></div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div><label>Trade</label><input value={trade} onChange={(e) => setTrade(e.target.value)} placeholder="e.g. Plumbing" /></div>
                    <div><label>Location</label><input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Auckland NZ" /></div>
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                <button type="submit" disabled={loading} className="btn-lift" style={{
                  padding: "11px 24px", background: loading ? "#fca5a5" : "var(--red)", color: "#fff",
                  border: "none", borderRadius: 0, fontSize: 14, fontWeight: 700, cursor: loading ? "default" : "pointer",
                }}>
                  {loading ? "Sending…" : "Save & send manually"}
                </button>
                <a href="/dashboard" className="btn-lift" style={{
                  padding: "11px 20px", background: "#f8fafc", color: L.text,
                  border: `1px solid ${L.border}`, borderRadius: 0, fontSize: 14, fontWeight: 700,
                  display: "inline-flex", alignItems: "center",
                }}>Cancel</a>
              </div>
            </form>
          )}
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
