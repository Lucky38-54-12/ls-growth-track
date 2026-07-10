"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink } from "lucide-react";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };
const PLACEHOLDER_HTML = "<p><em>Paste your notes and generate a recap to preview it here.</em></p>";

export default function OnboardingWorkspace() {
  const router = useRouter();

  // --- Proposal section ---
  const [generatingDoc, setGeneratingDoc] = useState(false);
  const [docUrl, setDocUrl] = useState("");
  const [propError, setPropError] = useState("");

  // --- Recap section ---
  const [callNotes, setCallNotes] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [previewVersion, setPreviewVersion] = useState(0);
  const [decisionStatus, setDecisionStatus] = useState<"ready" | "thinking">("ready");
  const [showDecisionModal, setShowDecisionModal] = useState(false);
  const [syncNote, setSyncNote] = useState("");

  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.innerHTML = bodyHtml || PLACEHOLDER_HTML;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewVersion]);

  function syncBody() {
    if (bodyRef.current) setBodyHtml(bodyRef.current.innerHTML);
  }

  async function handleGenerateDoc() {
    if (!callNotes.trim()) { setPropError("Paste your call notes in the recap section above first."); return; }
    setGeneratingDoc(true); setPropError(""); setDocUrl("");
    try {
      const res = await fetch("/api/onboarding/generate-agreement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callNotes }),
      });
      const data = await res.json();
      if (data.error) { setPropError(data.error); return; }
      setDocUrl(data.url);
    } catch { setPropError("Something went wrong. Try again."); }
    finally { setGeneratingDoc(false); }
  }

  function handleGenerateClick() {
    if (!callNotes.trim()) { setError("Paste your call notes first."); return; }
    setError(""); setSyncNote("");
    setShowDecisionModal(true);
  }

  async function handleDecisionPicked(choice: "ready" | "thinking") {
    setShowDecisionModal(false);
    setDecisionStatus(choice);
    await handleGenerate(choice);
  }

  async function handleGenerate(choice: "ready" | "thinking" = decisionStatus) {
    setGenerating(true); setError("");
    try {
      const res = await fetch("/api/onboarding/generate-recap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callNotes }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      setName(data.name || ""); setCompany(data.company || "");
      setEmail(data.email || ""); setPhone(data.phone || "");
      setSubject(data.subject || ""); setBodyHtml(data.bodyHtml || "");
      setGenerated(true);
      setPreviewVersion(v => v + 1);
      // Ready to onboard means a proposal is coming next regardless — generate
      // it straight away instead of making that a second manual step.
      if (choice === "ready") handleGenerateDoc();
    } catch { setError("Something went wrong. Try again."); }
    finally { setGenerating(false); }
  }

  async function handleSend() {
    syncBody();
    const finalBody = bodyRef.current?.innerHTML || bodyHtml;
    if (!company.trim()) { setError("Company name is required."); return; }
    setSending(true); setError(""); setSyncNote("");
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, company, email, phone, subject, bodyHtml: finalBody, decisionStatus, callNotes }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      setSyncNote(
        data.leadSynced
          ? `Pipeline updated — moved to "${decisionStatus === "thinking" ? "Thinking About It" : "Proposal Sent"}" with the recap added as a note.`
          : "No matching lead found in the pipeline — onboarding client saved on its own."
      );
      setCallNotes(""); setGenerated(false);
      setName(""); setCompany(""); setEmail(""); setPhone("");
      setSubject(""); setBodyHtml(""); setDecisionStatus("ready");
      setDocUrl(""); setPreviewVersion(v => v + 1);
      router.refresh();
    } catch { setError("Something went wrong. Try again."); }
    finally { setSending(false); }
  }

  return (
    <div>
      {/* Two-column workspace */}
      <div style={{ maxWidth: 1080, margin: "32px auto", padding: "0 28px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" }}>

        {/* LEFT */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {error && <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", color: "#991b1b", padding: "10px 16px", borderRadius: 0, fontSize: 13 }}>{error}</div>}
          {syncNote && <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#15803d", padding: "10px 16px", borderRadius: 0, fontSize: 13 }}>{syncNote}</div>}

          {/* Section 1 — Meeting recap */}
          <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 0, padding: 24 }}>
            <div style={{ fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, fontWeight: 800, marginBottom: 4 }}>Meeting recap</div>
            <p style={{ fontSize: 13, color: L.muted, marginBottom: 12 }}>
              Paste your Read.ai summary — Claude will write a recap email you can review and send to the client.
            </p>
            <textarea
              value={callNotes}
              onChange={e => setCallNotes(e.target.value)}
              rows={8}
              placeholder="Paste your Read.ai call summary here…"
              style={{ display: "block", width: "100%", boxSizing: "border-box", resize: "vertical", marginBottom: 16 }}
            />
            <button
              type="button"
              onClick={handleGenerateClick}
              disabled={generating}
              className="btn-lift"
              style={{ padding: "10px 20px", background: generating ? "#fca5a5" : "var(--red)", color: "#fff", border: "none", borderRadius: 0, fontSize: 13, fontWeight: 700, cursor: generating ? "default" : "pointer" }}
            >
              {generating ? "Generating…" : "Generate recap email"}
            </button>
          </div>

          {showDecisionModal && (
            <div
              style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
              onClick={() => setShowDecisionModal(false)}
            >
              <div
                style={{ background: L.surface, borderRadius: 8, width: "100%", maxWidth: 420, margin: "0 16px", padding: 24, boxShadow: "0 20px 48px rgba(15,23,42,0.2)" }}
                onClick={e => e.stopPropagation()}
              >
                <div style={{ fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, fontWeight: 800, marginBottom: 4 }}>Where are they at?</div>
                <p style={{ fontSize: 13, color: L.muted, marginBottom: 18 }}>
                  This decides what gets generated and how their pipeline card updates.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => handleDecisionPicked("ready")}
                    className="btn-lift"
                    style={{ padding: "12px 16px", background: "var(--red)", color: "#fff", border: "none", borderRadius: 0, fontSize: 13.5, fontWeight: 700, cursor: "pointer", textAlign: "left" }}
                  >
                    Ready to move forward
                    <div style={{ fontWeight: 500, fontSize: 12, opacity: 0.9, marginTop: 2 }}>Generates recap + proposal, moves them to Proposal Sent</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDecisionPicked("thinking")}
                    className="btn-lift"
                    style={{ padding: "12px 16px", background: "#f8fafc", color: L.text, border: `1px solid ${L.border}`, borderRadius: 0, fontSize: 13.5, fontWeight: 700, cursor: "pointer", textAlign: "left" }}
                  >
                    Still deciding
                    <div style={{ fontWeight: 500, fontSize: 12, color: L.muted, marginTop: 2 }}>Generates recap only, moves them to Thinking About It</div>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Extracted details — shown after generate */}
          {generated && (
            <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 0, padding: 24 }}>
              <div style={{ fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, fontWeight: 800, marginBottom: 4 }}>Client details</div>
              <p style={{ fontSize: 13, color: L.muted, marginBottom: 16 }}>Pulled from your notes — fix anything wrong before sending.</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div><label>Contact name</label><input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Sarah" /></div>
                  <div><label>Company</label><input value={company} onChange={e => setCompany(e.target.value)} placeholder="e.g. ABC Plumbing" /></div>
                </div>
                <div><label>Email</label><input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="sarah@example.com" /></div>
                <div><label>Phone</label><input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+64 21 000 000" /></div>
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: "block", marginBottom: 8 }}>Where are they at?</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setDecisionStatus("ready")}
                    style={{ flex: 1, padding: "9px 14px", background: decisionStatus === "ready" ? "var(--red)" : "#f8fafc", color: decisionStatus === "ready" ? "#fff" : L.text, border: `1px solid ${decisionStatus === "ready" ? "var(--red)" : L.border}`, borderRadius: 0, fontSize: 13, fontWeight: 700, cursor: "pointer" }}
                  >
                    Ready to move forward
                  </button>
                  <button
                    type="button"
                    onClick={() => setDecisionStatus("thinking")}
                    style={{ flex: 1, padding: "9px 14px", background: decisionStatus === "thinking" ? "var(--red)" : "#f8fafc", color: decisionStatus === "thinking" ? "#fff" : L.text, border: `1px solid ${decisionStatus === "thinking" ? "var(--red)" : L.border}`, borderRadius: 0, fontSize: 13, fontWeight: 700, cursor: "pointer" }}
                  >
                    Still deciding
                  </button>
                </div>
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={sending}
                  className="btn-lift"
                  style={{ padding: "11px 24px", background: sending ? "#fca5a5" : "var(--red)", color: "#fff", border: "none", borderRadius: 0, fontSize: 14, fontWeight: 700, cursor: sending ? "default" : "pointer" }}
                >
                  {sending ? "Sending…" : email ? "Add client & send recap" : "Add client"}
                </button>
                <a href="/dashboard/onboarding" className="btn-lift" style={{ padding: "11px 20px", background: "#f8fafc", color: L.text, border: `1px solid ${L.border}`, borderRadius: 0, fontSize: 14, fontWeight: 700, display: "inline-flex", alignItems: "center" }}>
                  Cancel
                </a>
              </div>
            </div>
          )}

          {/* Section 2 — Proposal / contract */}
          <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 0, padding: 24 }}>
            <div style={{ fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, fontWeight: 800, marginBottom: 4 }}>Proposal / contract</div>
            <p style={{ fontSize: 13, color: L.muted, marginBottom: 16 }}>
              Uses your notes above — Claude pulls the client details and drops them into an agreement in your Google Drive.
            </p>
            {propError && <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", color: "#991b1b", padding: "10px 14px", borderRadius: 0, marginBottom: 14, fontSize: 13 }}>{propError}</div>}
            {docUrl && (
              <a href={docUrl} target="_blank" rel="noopener noreferrer" className="btn-lift" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 18px", background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#15803d", borderRadius: 0, fontSize: 13, fontWeight: 700, textDecoration: "none", marginBottom: 16 }}>
                <ExternalLink style={{ width: 13, height: 13 }} /> Open agreement in Google Docs
              </a>
            )}
            <button
              type="button"
              onClick={handleGenerateDoc}
              disabled={generatingDoc}
              className="btn-lift"
              style={{ padding: "10px 20px", background: generatingDoc ? "#fca5a5" : "var(--red)", color: "#fff", border: "none", borderRadius: 0, fontSize: 13, fontWeight: 700, cursor: generatingDoc ? "default" : "pointer" }}
            >
              {generatingDoc ? "Creating doc…" : "Generate agreement in Google Docs"}
            </button>
          </div>
        </div>

        {/* RIGHT — preview */}
        <div style={{ position: "sticky", top: 20 }}>
          <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 0, padding: 24 }}>
            <div style={{ fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, fontWeight: 800, marginBottom: 4 }}>Preview</div>
            <p style={{ fontSize: 13, color: L.muted, marginBottom: 16 }}>
              This is what gets sent. Click into the subject or body to edit before sending.
            </p>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, marginBottom: 4 }}>Subject</div>
            <input
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="Subject will appear here after generating"
              style={{ marginBottom: 14, fontWeight: 700 }}
            />
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, marginBottom: 8 }}>Body</div>
            <div
              ref={bodyRef}
              className="email-preview"
              contentEditable={generated}
              onBlur={syncBody}
              suppressContentEditableWarning
              style={{ border: `1px solid ${L.border}`, padding: 16, background: "#f8fafc", fontFamily: "Arial,Helvetica,sans-serif", fontSize: 15, color: "#1a1a1a", lineHeight: 1.5, minHeight: 200, outline: "none" }}
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
