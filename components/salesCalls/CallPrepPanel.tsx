"use client";
import { useState } from "react";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b" };

interface Prep {
  topWorkOns: string[];
  likelyObjections: string[];
  reminder: string;
  tailoredScript: string;
}

export default function CallPrepPanel() {
  const [prospectName, setProspectName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [industry, setIndustry] = useState("");
  const [notes, setNotes] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [prep, setPrep] = useState<Prep | null>(null);

  async function handleGenerate() {
    setGenerating(true);
    setError("");
    try {
      const res = await fetch("/api/sales-calls/prep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prospectName, businessName, industry, notes }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Couldn't generate prep right now.");
        return;
      }
      setPrep(data);
    } catch {
      setError("Couldn't generate prep right now.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" }}>
      <div>
        {error && <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", color: "#991b1b", padding: "10px 16px", marginBottom: 18, fontSize: 14 }}>{error}</div>}

        <div style={{ background: L.surface, border: `1px solid ${L.border}`, padding: 24 }}>
          <div style={{ fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, fontWeight: 800, marginBottom: 16 }}>Before this call</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label>Prospect name</label>
              <input value={prospectName} onChange={(e) => setProspectName(e.target.value)} placeholder="e.g. Dave" />
            </div>
            <div>
              <label>Business</label>
              <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="e.g. Dave's Plumbing" />
            </div>
            <div>
              <label>Industry</label>
              <input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="e.g. Plumbing" />
            </div>
            <div>
              <label>Notes from booking</label>
              <textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything they said when booking the call" style={{ display: "block", width: "100%", boxSizing: "border-box", resize: "vertical" }} />
            </div>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating}
              className="btn-lift"
              style={{ padding: "10px 20px", background: generating ? "#fca5a5" : "var(--red)", color: "#fff", border: "none", fontSize: 13, fontWeight: 700, cursor: generating ? "default" : "pointer" }}
            >
              {generating ? "Prepping…" : "Generate prep for this call"}
            </button>
          </div>
        </div>
      </div>

      <div style={{ position: "sticky", top: 20 }}>
        {!prep ? (
          <div style={{ background: L.surface, border: `1px solid ${L.border}`, padding: 24, textAlign: "center", color: L.muted, fontSize: 13 }}>
            Fill in the prospect's details and generate a prep card and tailored script.
          </div>
        ) : (
          <>
            <div style={{ background: L.surface, border: `1px solid ${L.border}`, padding: 20, marginBottom: 16 }}>
              <div style={{ fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, fontWeight: 800, marginBottom: 12 }}>Prep card</div>

              {prep.topWorkOns.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: L.muted, marginBottom: 4 }}>Watch yourself on</div>
                  {prep.topWorkOns.map((w, i) => <div key={i} style={{ fontSize: 13, color: L.text, marginBottom: 3 }}>• {w}</div>)}
                </div>
              )}

              {prep.likelyObjections.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: L.muted, marginBottom: 4 }}>Likely objections</div>
                  {prep.likelyObjections.map((o, i) => <div key={i} style={{ fontSize: 13, color: L.text, marginBottom: 3 }}>• {o}</div>)}
                </div>
              )}

              <div style={{ background: "#fef2f2", border: "1px solid #fecaca", padding: "10px 12px", fontSize: 12.5, color: "#991b1b", fontWeight: 600 }}>
                {prep.reminder}
              </div>
            </div>

            <div style={{ background: L.surface, border: `1px solid ${L.border}`, padding: 20 }}>
              <div style={{ fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, fontWeight: 800, marginBottom: 12 }}>Tailored script</div>
              <div style={{ fontSize: 13.5, color: L.text, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{prep.tailoredScript}</div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
