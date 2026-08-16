"use client";

import { useState } from "react";
import { X, ExternalLink } from "lucide-react";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b" };

interface Client {
  name: string;
  trade: string | null;
  email: string | null;
}

export default function AgreementModal({ client, onClose }: { client: Client; onClose: () => void }) {
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
        body: JSON.stringify({
          company: client.name,
          trade: client.trade || "",
          email: client.email || "",
          dealNotes: notes,
          photosFolderUrl: photosFolderUrl.trim() || undefined,
        }),
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
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: L.surface, border: `1px solid ${L.border}`, width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto", borderRadius: 14, boxShadow: "0 20px 48px rgba(15,23,42,0.22)" }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${L.border}` }}>
          <p style={{ fontSize: 13, fontWeight: 800, color: L.text }}>Make agreement — {client.name}</p>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
            <X style={{ width: 16, height: 16, color: L.muted }} />
          </button>
        </div>

        <div style={{ padding: 16 }}>
          <p style={{ fontSize: 13, color: L.muted, marginBottom: 12 }}>
            Just say what was actually agreed — e.g. contact name, 3 week trial, 50% deposit then we start, whatever the deal is. The doc gets written to match, not forced into a fixed template.
          </p>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={8}
            placeholder="e.g. Charl. 3 week trial, 10 qualified quotes to trigger the $2k/mo fee, $15/day ad spend, starts 27/07..."
            style={{ display: "block", width: "100%", boxSizing: "border-box", resize: "vertical", marginBottom: 12, padding: "8px 10px", border: `1px solid ${L.border}`, fontSize: 13 }}
          />
          <input
            value={photosFolderUrl}
            onChange={(e) => setPhotosFolderUrl(e.target.value)}
            placeholder="Photos folder link (optional) — pulls their photos into the doc"
            style={{ display: "block", width: "100%", boxSizing: "border-box", marginBottom: 12, padding: "8px 10px", border: `1px solid ${L.border}`, fontSize: 13 }}
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
                <ExternalLink style={{ width: 13, height: 13 }} /> Open in Google Docs
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
