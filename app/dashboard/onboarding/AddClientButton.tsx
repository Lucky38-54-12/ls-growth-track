"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, X } from "lucide-react";

const L = { border: "#e2e8f0", text: "#0f172a", muted: "#64748b", surface: "#ffffff" };
const PLACEHOLDER_HTML = "<p><em>Paste your notes and generate a recap email to preview it here.</em></p>";

export default function AddClientButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"notes" | "preview">("notes");

  const [callNotes, setCallNotes] = useState("");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [previewVersion, setPreviewVersion] = useState(0);

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

  function reset() {
    setStep("notes");
    setCallNotes("");
    setName(""); setCompany(""); setEmail(""); setPhone("");
    setSubject(""); setBodyHtml("");
    setError("");
    setPreviewVersion(0);
  }

  function close() { setOpen(false); reset(); }

  async function handleGenerate() {
    if (!callNotes.trim()) { setError("Paste your call notes first."); return; }
    setGenerating(true);
    setError("");
    try {
      const res = await fetch("/api/onboarding/generate-recap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callNotes }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      setName(data.name || "");
      setCompany(data.company || "");
      setEmail(data.email || "");
      setPhone(data.phone || "");
      setSubject(data.subject || "");
      setBodyHtml(data.bodyHtml || "");
      setStep("preview");
      setPreviewVersion(v => v + 1);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleSend() {
    syncBody();
    const finalBody = bodyRef.current?.innerHTML || bodyHtml;
    if (!company.trim()) { setError("Company name is required."); return; }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, company, email, phone, subject, bodyHtml: finalBody }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      close();
      router.refresh();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          display: "flex", alignItems: "center", gap: 7,
          padding: "9px 16px", background: "var(--red)", color: "#fff",
          border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer",
        }}
      >
        <UserPlus style={{ width: 15, height: 15 }} /> Add Client
      </button>

      {open && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={close}
        >
          <div
            style={{ background: L.surface, borderRadius: 12, width: "100%", maxWidth: step === "preview" ? 860 : 480, margin: "0 16px", boxShadow: "0 20px 48px rgba(15,23,42,0.2)", maxHeight: "90vh", overflow: "auto" }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: `1px solid ${L.border}` }}>
              <h2 style={{ fontSize: 15, fontWeight: 800, color: L.text }}>
                {step === "notes" ? "New Onboarding Client" : "Preview recap email"}
              </h2>
              <button onClick={close} style={{ background: "none", border: "none", cursor: "pointer", color: L.muted, display: "flex" }}>
                <X style={{ width: 16, height: 16 }} />
              </button>
            </div>

            {step === "notes" && (
              <div style={{ padding: 24 }}>
                {error && <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", color: "#991b1b", padding: "10px 14px", borderRadius: 7, marginBottom: 16, fontSize: 13 }}>{error}</div>}
                <p style={{ fontSize: 13, color: L.muted, marginBottom: 12 }}>
                  Paste your Read.ai summary — Claude will extract the client details and write a recap email for you to review before sending.
                </p>
                <textarea
                  value={callNotes}
                  onChange={e => setCallNotes(e.target.value)}
                  rows={10}
                  placeholder="Paste your Read.ai call summary here…"
                  style={{ display: "block", width: "100%", boxSizing: "border-box", resize: "vertical", marginBottom: 16, padding: "10px 12px", border: `1px solid ${L.border}`, borderRadius: 7, fontSize: 13, fontFamily: "inherit", outline: "none" }}
                />
                <button
                  onClick={handleGenerate}
                  disabled={generating}
                  style={{ padding: "10px 20px", background: generating ? "#fca5a5" : "var(--red)", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: generating ? "default" : "pointer" }}
                >
                  {generating ? "Generating…" : "Generate recap email"}
                </button>
              </div>
            )}

            {step === "preview" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
                {/* Left — details */}
                <div style={{ padding: 24, borderRight: `1px solid ${L.border}` }}>
                  {error && <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", color: "#991b1b", padding: "10px 14px", borderRadius: 7, marginBottom: 16, fontSize: 13 }}>{error}</div>}
                  <p style={{ fontSize: 12, fontWeight: 700, color: L.muted, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 14 }}>Client details</p>
                  <p style={{ fontSize: 12, color: L.muted, marginBottom: 14 }}>Pulled from your notes — fix anything that's wrong before sending.</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {[
                      { label: "Contact name", value: name, set: setName, placeholder: "e.g. Sarah" },
                      { label: "Company", value: company, set: setCompany, placeholder: "e.g. ABC Plumbing", required: true },
                      { label: "Email", value: email, set: setEmail, placeholder: "sarah@example.com" },
                      { label: "Phone", value: phone, set: setPhone, placeholder: "+64 21 000 000" },
                    ].map(f => (
                      <div key={f.label}>
                        <label style={{ fontSize: 11.5, fontWeight: 600, color: L.muted, display: "block", marginBottom: 4 }}>{f.label}</label>
                        <input
                          value={f.value}
                          onChange={e => f.set(e.target.value)}
                          placeholder={f.placeholder}
                          style={{ width: "100%", padding: "8px 10px", border: `1px solid ${L.border}`, borderRadius: 6, fontSize: 13, color: L.text, outline: "none", boxSizing: "border-box" }}
                        />
                      </div>
                    ))}
                  </div>

                  <div style={{ marginTop: 20, display: "flex", gap: 10 }}>
                    <button
                      onClick={handleSend}
                      disabled={saving}
                      style={{ padding: "10px 18px", background: saving ? "#fca5a5" : "var(--red)", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: saving ? "default" : "pointer" }}
                    >
                      {saving ? "Sending…" : email ? "Add client & send email" : "Add client"}
                    </button>
                    <button
                      onClick={() => setStep("notes")}
                      style={{ padding: "10px 14px", background: "#f8fafc", color: L.muted, border: `1px solid ${L.border}`, borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: "pointer" }}
                    >
                      Back
                    </button>
                  </div>
                </div>

                {/* Right — email preview */}
                <div style={{ padding: 24 }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: L.muted, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 14 }}>Email preview</p>
                  <p style={{ fontSize: 12, color: L.muted, marginBottom: 12 }}>Click into the subject or body to edit before sending.</p>
                  <div style={{ fontSize: 11, fontWeight: 700, color: L.muted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Subject</div>
                  <input
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                    style={{ width: "100%", padding: "8px 10px", border: `1px solid ${L.border}`, borderRadius: 6, fontSize: 13, fontWeight: 700, color: L.text, outline: "none", boxSizing: "border-box", marginBottom: 12 }}
                  />
                  <div style={{ fontSize: 11, fontWeight: 700, color: L.muted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Body</div>
                  <div
                    ref={bodyRef}
                    contentEditable
                    onBlur={syncBody}
                    suppressContentEditableWarning
                    style={{ border: `1px solid ${L.border}`, borderRadius: 6, padding: 14, background: "#f8fafc", fontFamily: "Arial,Helvetica,sans-serif", fontSize: 14, color: "#1a1a1a", lineHeight: 1.5, minHeight: 180, outline: "none" }}
                  />
                  <div style={{ fontFamily: "Arial,Helvetica,sans-serif", fontSize: 14, color: "#1a1a1a", lineHeight: 1.5, padding: "0 14px" }}>
                    <p>Cheers,<br />Lucky<br />LS Growth</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
