"use client";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { CALL_OUTCOME_LABELS, SalesCall, ScriptProposal } from "@/lib/types";
import { ExternalLink } from "lucide-react";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b" };
const PLACEHOLDER_HTML = "<p><em>Generate a recap to preview it here.</em></p>";

export default function CallLogForm({ onSaved }: { onSaved: (call: SalesCall, proposal: ScriptProposal | null, backupUrl: string | null) => void }) {
  const [rawSummary, setRawSummary] = useState("");
  const [yourTake, setYourTake] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [lastSaved, setLastSaved] = useState<SalesCall | null>(null);
  const [savedNotes, setSavedNotes] = useState("");

  // --- Recap email ---
  const [generatingRecap, setGeneratingRecap] = useState(false);
  const [recapGenerated, setRecapGenerated] = useState(false);
  const [recapError, setRecapError] = useState("");
  const [recapName, setRecapName] = useState("");
  const [recapCompany, setRecapCompany] = useState("");
  const [recapEmail, setRecapEmail] = useState("");
  const [recapPhone, setRecapPhone] = useState("");
  const [recapSubject, setRecapSubject] = useState("");
  const [recapBodyHtml, setRecapBodyHtml] = useState("");
  const [previewVersion, setPreviewVersion] = useState(0);
  const [decisionStatus, setDecisionStatus] = useState<"ready" | "thinking">("ready");
  const [sendingRecap, setSendingRecap] = useState(false);
  const [recapSentNote, setRecapSentNote] = useState("");
  const [onboardingClientId, setOnboardingClientId] = useState("");

  // --- Agreement ---
  const [generatingDoc, setGeneratingDoc] = useState(false);
  const [docUrl, setDocUrl] = useState("");
  const [docError, setDocError] = useState("");

  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.innerHTML = recapBodyHtml || PLACEHOLDER_HTML;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewVersion]);

  function syncBody() {
    if (bodyRef.current) setRecapBodyHtml(bodyRef.current.innerHTML);
  }

  function resetRecapAndDoc() {
    setRecapGenerated(false); setRecapName(""); setRecapCompany(""); setRecapEmail(""); setRecapPhone("");
    setRecapSubject(""); setRecapBodyHtml(""); setRecapSentNote(""); setOnboardingClientId("");
    setDocUrl(""); setDocError(""); setPreviewVersion((v) => v + 1);
  }

  async function handleSave() {
    if (!rawSummary.trim()) {
      setError("Paste the notes first.");
      return;
    }
    setSaving(true);
    setError("");
    setLastSaved(null);
    resetRecapAndDoc();
    try {
      const res = await fetch("/api/sales-calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw_summary: rawSummary, your_take: yourTake }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Couldn't log this call. Try again.");
        return;
      }
      onSaved(data.call, data.proposal, data.backupUrl || null);
      setLastSaved(data.call);
      setSavedNotes(rawSummary);
      setRawSummary("");
      setYourTake("");
    } catch {
      setError("Couldn't log this call. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerateRecap() {
    setGeneratingRecap(true);
    setRecapError("");
    try {
      const res = await fetch("/api/onboarding/generate-recap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callNotes: savedNotes }),
      });
      const data = await res.json();
      if (data.error) { setRecapError(data.error); return; }
      setRecapName(data.name || lastSaved?.prospect_name || "");
      setRecapCompany(data.company || lastSaved?.business_name || "");
      setRecapEmail(data.email || "");
      setRecapPhone(data.phone || "");
      setRecapSubject(data.subject || "");
      setRecapBodyHtml(data.bodyHtml || "");
      setRecapGenerated(true);
      setPreviewVersion((v) => v + 1);
    } catch {
      setRecapError("Something went wrong. Try again.");
    } finally {
      setGeneratingRecap(false);
    }
  }

  async function handleSendRecap() {
    syncBody();
    const finalBody = bodyRef.current?.innerHTML || recapBodyHtml;
    if (!recapCompany.trim()) { setRecapError("Company name is required."); return; }
    setSendingRecap(true);
    setRecapError("");
    setRecapSentNote("");
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: recapName, company: recapCompany, email: recapEmail, phone: recapPhone,
          subject: recapSubject, bodyHtml: finalBody, decisionStatus, callNotes: savedNotes,
        }),
      });
      const data = await res.json();
      if (data.error) { setRecapError(data.error); return; }
      setOnboardingClientId(data.id || "");
      setRecapSentNote(data.sent ? `Recap sent to ${recapEmail}.` : "Client saved. No email sent, add an email above to send one.");
    } catch {
      setRecapError("Something went wrong. Try again.");
    } finally {
      setSendingRecap(false);
    }
  }

  async function handleGenerateDoc() {
    setGeneratingDoc(true);
    setDocError("");
    setDocUrl("");
    try {
      const res = await fetch("/api/onboarding/generate-agreement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callNotes: savedNotes }),
      });
      const data = await res.json();
      if (data.error) { setDocError(data.error); return; }
      setDocUrl(data.url);
    } catch {
      setDocError("Something went wrong. Try again.");
    } finally {
      setGeneratingDoc(false);
    }
  }

  return (
    <div>
      {error && <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", color: "#991b1b", padding: "10px 16px", marginBottom: 18, fontSize: 14 }}>{error}</div>}

      {lastSaved && (
        <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#15803d", padding: "14px 16px", marginBottom: 18, fontSize: 13 }}>
          Logged: {lastSaved.prospect_name || "unnamed"}{lastSaved.business_name ? ` (${lastSaved.business_name})` : ""}, {CALL_OUTCOME_LABELS[lastSaved.outcome]}
          {lastSaved.next_step_booked && lastSaved.next_step_detail ? ` — next step: ${lastSaved.next_step_detail}` : ""}.
          {" "}Wrong on something? Fix it in Call History. Check the Master Script tab if a proposal came out of it.
        </div>
      )}

      <div style={{ background: L.surface, border: `1px solid ${L.border}`, padding: 24, marginBottom: 20 }}>
        <div style={{ fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, fontWeight: 800, marginBottom: 4 }}>Raw call notes</div>
        <p style={{ fontSize: 13, color: L.muted, marginBottom: 12 }}>
          Paste the notetaker summary word for word. Date, prospect, business, outcome, objection, next step and what went well all get pulled from this automatically, stored in full, never truncated.
        </p>
        <textarea
          value={rawSummary}
          onChange={(e) => setRawSummary(e.target.value)}
          rows={10}
          placeholder="Paste the raw notetaker summary here..."
          style={{ display: "block", width: "100%", boxSizing: "border-box", resize: "vertical" }}
        />
      </div>

      <div style={{ background: L.surface, border: `1px solid ${L.border}`, padding: 24, marginBottom: 20 }}>
        <div style={{ fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, fontWeight: 800, marginBottom: 4 }}>Your take</div>
        <p style={{ fontSize: 13, color: L.muted, marginBottom: 12 }}>
          Your own honest read: where you mucked up, what you'd change next time. This is the one thing worth typing yourself, it's what the script review reads first.
        </p>
        <textarea
          value={yourTake}
          onChange={(e) => setYourTake(e.target.value)}
          rows={4}
          placeholder="e.g. Let the call end without pinning down a specific follow up day..."
          style={{ display: "block", width: "100%", boxSizing: "border-box", resize: "vertical" }}
        />
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="btn-lift"
        style={{ padding: "11px 24px", background: saving ? "#fca5a5" : "var(--red)", color: "#fff", border: "none", fontSize: 14, fontWeight: 700, cursor: saving ? "default" : "pointer" }}
      >
        {saving ? "Logging call…" : "Log this call"}
      </button>

      {lastSaved && (
        <div style={{ background: L.surface, border: `1px solid ${L.border}`, padding: 24, marginTop: 20 }}>
          <div style={{ fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, fontWeight: 800, marginBottom: 4 }}>Recap &amp; next steps</div>
          <p style={{ fontSize: 13, color: L.muted, marginBottom: 16 }}>
            Uses the notes you just pasted, no need to paste them again.
          </p>

          {recapError && <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", color: "#991b1b", padding: "10px 14px", marginBottom: 14, fontSize: 13 }}>{recapError}</div>}
          {docError && <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", color: "#991b1b", padding: "10px 14px", marginBottom: 14, fontSize: 13 }}>{docError}</div>}

          <div style={{ display: "flex", gap: 10, marginBottom: recapGenerated || docUrl ? 20 : 0, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={handleGenerateRecap}
              disabled={generatingRecap}
              className="btn-lift"
              style={{ padding: "10px 20px", background: generatingRecap ? "#fca5a5" : "var(--red)", color: "#fff", border: "none", fontSize: 13, fontWeight: 700, cursor: generatingRecap ? "default" : "pointer" }}
            >
              {generatingRecap ? "Generating…" : "Generate recap email"}
            </button>
            <button
              type="button"
              onClick={handleGenerateDoc}
              disabled={generatingDoc}
              className="btn-lift"
              style={{ padding: "10px 20px", background: generatingDoc ? "#fca5a5" : "#fff", color: L.text, border: `1px solid ${L.border}`, fontSize: 13, fontWeight: 700, cursor: generatingDoc ? "default" : "pointer" }}
            >
              {generatingDoc ? "Creating doc…" : "Generate agreement"}
            </button>
            {docUrl && (
              <a href={docUrl} target="_blank" rel="noopener noreferrer" className="btn-lift" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 18px", background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#15803d", fontSize: 13, fontWeight: 700, textDecoration: "none" }}>
                <ExternalLink style={{ width: 13, height: 13 }} /> Open agreement in Google Docs
              </a>
            )}
          </div>

          {recapGenerated && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start", paddingTop: 20, borderTop: `1px solid ${L.border}` }}>
              <div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                  <div><label>Contact name</label><input value={recapName} onChange={(e) => setRecapName(e.target.value)} /></div>
                  <div><label>Company</label><input value={recapCompany} onChange={(e) => setRecapCompany(e.target.value)} /></div>
                </div>
                <div style={{ marginBottom: 10 }}><label>Email</label><input value={recapEmail} onChange={(e) => setRecapEmail(e.target.value)} type="email" placeholder="prospect@example.com" /></div>
                <div style={{ marginBottom: 14 }}><label>Phone</label><input value={recapPhone} onChange={(e) => setRecapPhone(e.target.value)} /></div>

                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: "block", marginBottom: 6 }}>Where are they at?</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="button" onClick={() => setDecisionStatus("ready")} style={{ flex: 1, padding: "8px 12px", background: decisionStatus === "ready" ? "var(--red)" : "#f8fafc", color: decisionStatus === "ready" ? "#fff" : L.text, border: `1px solid ${decisionStatus === "ready" ? "var(--red)" : L.border}`, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>Ready to move forward</button>
                    <button type="button" onClick={() => setDecisionStatus("thinking")} style={{ flex: 1, padding: "8px 12px", background: decisionStatus === "thinking" ? "var(--red)" : "#f8fafc", color: decisionStatus === "thinking" ? "#fff" : L.text, border: `1px solid ${decisionStatus === "thinking" ? "var(--red)" : L.border}`, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>Still deciding</button>
                  </div>
                </div>

                {recapSentNote ? (
                  <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#15803d", padding: "10px 14px", fontSize: 13 }}>
                    {recapSentNote}
                    {onboardingClientId && (
                      <div style={{ marginTop: 6 }}>
                        <Link href={`/dashboard/sales-calls/onboarding/${onboardingClientId}`} style={{ color: "#15803d", fontWeight: 700, textDecoration: "underline" }}>View onboarding checklist</Link>
                      </div>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleSendRecap}
                    disabled={sendingRecap}
                    className="btn-lift"
                    style={{ padding: "10px 20px", background: sendingRecap ? "#fca5a5" : "var(--red)", color: "#fff", border: "none", fontSize: 13, fontWeight: 700, cursor: sendingRecap ? "default" : "pointer" }}
                  >
                    {sendingRecap ? "Sending…" : recapEmail ? "Add client & send recap" : "Add client"}
                  </button>
                )}
              </div>

              <div style={{ position: "sticky", top: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, marginBottom: 4 }}>Subject</div>
                <input value={recapSubject} onChange={(e) => setRecapSubject(e.target.value)} style={{ marginBottom: 12, fontWeight: 700 }} />
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, marginBottom: 8 }}>Body</div>
                <div
                  ref={bodyRef}
                  className="email-preview"
                  contentEditable
                  onBlur={syncBody}
                  suppressContentEditableWarning
                  style={{ border: `1px solid ${L.border}`, padding: 16, background: "#f8fafc", fontFamily: "Arial,Helvetica,sans-serif", fontSize: 14, color: "#1a1a1a", lineHeight: 1.5, minHeight: 160, outline: "none" }}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
