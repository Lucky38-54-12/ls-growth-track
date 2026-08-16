"use client";
import { useState } from "react";
import { ExternalLink } from "lucide-react";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b" };

export default function AgreementMakerPanel() {
  const [notes, setNotes] = useState("");
  const [photosFolderUrl, setPhotosFolderUrl] = useState("");
  const [generating, setGenerating] = useState(false);
  const [docUrl, setDocUrl] = useState("");
  const [error, setError] = useState("");

  async function handleGenerate() {
    if (!notes.trim()) return;
    setGenerating(true);
    setError("");
    setDocUrl("");
    try {
      const res = await fetch("/api/onboarding/generate-agreement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callNotes: notes, photosFolderUrl: photosFolderUrl.trim() || undefined }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      setDocUrl(data.url);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div>
      <div style={{ background: L.surface, border: `1px solid ${L.border}`, padding: 24, marginBottom: 20 }}>
        <div style={{ fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, fontWeight: 800, marginBottom: 4 }}>Agreement maker</div>
        <p style={{ fontSize: 13, color: L.muted, marginBottom: 12 }}>
          Paste the client details and call notes — client name, business, focus service, monthly fee, ad spend, trial length, quote threshold, whatever you've got. Missing pieces fall back to defaults ($2,000/mo, $15/day, 10 quote requests, 3-week trial).
        </p>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={10}
          placeholder="e.g. Hrc Electrical - Charl&#10;&#10;Next touch point Sunday 11am. Focus on solar installations..."
          style={{ display: "block", width: "100%", boxSizing: "border-box", resize: "vertical", marginBottom: 12 }}
        />
        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: L.text, marginBottom: 6 }}>Photos folder (optional)</label>
        <input
          value={photosFolderUrl}
          onChange={(e) => setPhotosFolderUrl(e.target.value)}
          placeholder="Paste the Google Drive folder link with the client's photos"
          style={{ display: "block", width: "100%", boxSizing: "border-box", padding: "8px 10px", border: `1px solid ${L.border}`, fontSize: 13, marginBottom: 12 }}
        />
        {error && <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", color: "#991b1b", padding: "10px 14px", marginBottom: 12, fontSize: 13 }}>{error}</div>}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating || !notes.trim()}
            className="btn-lift"
            style={{ padding: "10px 20px", background: generating ? "#fca5a5" : "var(--accent)", color: "#fff", border: "none", fontSize: 13, fontWeight: 700, cursor: generating || !notes.trim() ? "default" : "pointer", opacity: !notes.trim() ? 0.6 : 1 }}
          >
            {generating ? "Generating…" : "Generate agreement"}
          </button>
          {docUrl && (
            <a href={docUrl} target="_blank" rel="noopener noreferrer" className="btn-lift" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 18px", background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#15803d", fontSize: 13, fontWeight: 700, textDecoration: "none" }}>
              <ExternalLink style={{ width: 13, height: 13 }} /> Open agreement in Google Docs
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
