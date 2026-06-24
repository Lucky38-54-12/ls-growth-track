"use client";

import { useState } from "react";
import { Eye, X } from "lucide-react";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };

interface Preview {
  leadId: string;
  company: string;
  contactName: string;
  subject?: string;
  bodyHtml?: string;
  error?: string;
}

export default function CampaignPreviewButton({ campaignId, leadCount }: { campaignId: string; leadCount: number }) {
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [sampleSize, setSampleSize] = useState(0);
  const [error, setError] = useState("");

  async function generate() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/preview`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate previews.");
      setPreviews(data.previews || []);
      setSampleSize(data.sampleSize || 0);
      setOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          onClick={generate}
          disabled={loading}
          className="btn-lift"
          style={{
            display: "flex", alignItems: "center", gap: 6, background: L.surface, color: L.text,
            border: `1px solid ${L.border}`, padding: "7px 14px", fontSize: 12, fontWeight: 700,
            cursor: loading ? "default" : "pointer", opacity: loading ? 0.6 : 1,
          }}
        >
          <Eye style={{ width: 13, height: 13 }} />
          {loading ? "Generating…" : `Preview Emails (sample of ${Math.min(3, leadCount)})`}
        </button>
        {error && <span style={{ fontSize: 11, color: "var(--red)" }}>{error}</span>}
      </div>

      {open && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
          onClick={() => setOpen(false)}
        >
          <div
            style={{ width: "100%", maxWidth: 720, maxHeight: "85vh", background: L.surface, border: `1px solid ${L.border}`, display: "flex", flexDirection: "column" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: `1px solid ${L.border}` }}>
              <div>
                <p style={{ fontSize: 13, fontWeight: 800, color: L.text }}>Email Preview</p>
                <p style={{ fontSize: 11.5, color: L.dimmed }}>
                  {sampleSize} sample email{sampleSize !== 1 ? "s" : ""} — this is exactly what gets sent once you activate
                </p>
              </div>
              <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: L.dimmed, padding: 4 }}>
                <X style={{ width: 16, height: 16 }} />
              </button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
              {previews.map((p) => (
                <div key={p.leadId} style={{ border: `1px solid ${L.border}` }}>
                  <div style={{ padding: "10px 16px", background: "#f8fafc", borderBottom: `1px solid ${L.border}` }}>
                    <p style={{ fontSize: 12.5, fontWeight: 700, color: L.text }}>
                      {p.company} <span style={{ color: L.dimmed, fontWeight: 500 }}>· {p.contactName || "there"}</span>
                    </p>
                    {p.subject && <p style={{ fontSize: 12, color: L.muted, marginTop: 2 }}>Subject: {p.subject}</p>}
                  </div>
                  <div style={{ padding: 16 }}>
                    {p.error ? (
                      <p style={{ fontSize: 12.5, color: "var(--red)" }}>Couldn&apos;t generate: {p.error}</p>
                    ) : (
                      <div
                        style={{ fontSize: 13.5, lineHeight: 1.6, color: "#1a1a1a" }}
                        dangerouslySetInnerHTML={{ __html: p.bodyHtml || "" }}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
