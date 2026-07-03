"use client";

import { useState } from "react";
import { Eye, X, ChevronDown } from "lucide-react";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };

interface Quality {
  verdict: "approved" | "rejected";
  mechanicalFails: string[];
  judgmentFlags: string[];
  reasoning: string;
}

interface Step {
  step: string;
  day: string;
  subject?: string;
  bodyHtml?: string;
  error?: string;
  quality?: Quality | null;
}

interface Preview {
  leadId: string;
  company: string;
  contactName: string;
  steps: Step[];
}

export default function CampaignPreviewButton({ campaignId, leadCount }: { campaignId: string; leadCount: number }) {
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [sampleSize, setSampleSize] = useState(0);
  const [openStep, setOpenStep] = useState<string>("");
  const [error, setError] = useState("");

  async function generate() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/preview`, { method: "POST" });
      if (!res.headers.get("content-type")?.includes("application/json")) {
        throw new Error("Generating the previews took too long. Please try again.");
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate previews.");
      setPreviews(data.previews || []);
      setSampleSize(data.sampleSize || 0);
      if (data.previews?.[0]?.steps?.[0]) {
        setOpenStep(`${data.previews[0].leadId}:${data.previews[0].steps[0].step}`);
      }
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
          {loading ? "Generating full sequence…" : `Preview Email Sequence (sample of ${Math.min(2, leadCount)})`}
        </button>
        {error && <span style={{ fontSize: 11, color: "var(--red)" }}>{error}</span>}
      </div>

      {open && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
          onClick={() => setOpen(false)}
        >
          <div
            style={{ width: "100%", maxWidth: 760, maxHeight: "85vh", background: L.surface, border: `1px solid ${L.border}`, display: "flex", flexDirection: "column" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: `1px solid ${L.border}` }}>
              <div>
                <p style={{ fontSize: 13, fontWeight: 800, color: L.text }}>Email Sequence Preview</p>
                <p style={{ fontSize: 11.5, color: L.dimmed }}>
                  {sampleSize} sample lead{sampleSize !== 1 ? "s" : ""}, full 5-email follow-up arc — exactly what gets sent once you activate
                </p>
              </div>
              <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: L.dimmed, padding: 4 }}>
                <X style={{ width: 16, height: 16 }} />
              </button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 20 }}>
              {previews.map((p) => (
                <div key={p.leadId}>
                  <p style={{ fontSize: 12.5, fontWeight: 700, color: L.text, marginBottom: 8 }}>
                    {p.company} <span style={{ color: L.dimmed, fontWeight: 500 }}>· {p.contactName || "no name on file"}</span>
                  </p>
                  <div style={{ border: `1px solid ${L.border}`, display: "flex", flexDirection: "column" }}>
                    {p.steps.map((s, i) => {
                      const key = `${p.leadId}:${s.step}`;
                      const isOpen = openStep === key;
                      return (
                        <div key={key} style={{ borderBottom: i === p.steps.length - 1 ? "none" : `1px solid ${L.border}` }}>
                          <button
                            onClick={() => setOpenStep(isOpen ? "" : key)}
                            className="row-hover"
                            style={{
                              width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 16px",
                              background: "#f8fafc", border: "none", cursor: "pointer", textAlign: "left",
                            }}
                          >
                            <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", color: L.dimmed, width: 56, flexShrink: 0 }}>{s.day}</span>
                            <span style={{ fontSize: 12.5, fontWeight: 600, color: L.text, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {s.error ? "Couldn't generate" : s.subject}
                            </span>
                            {s.quality && (
                              <span style={{
                                fontSize: 9.5, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase",
                                padding: "2px 8px", flexShrink: 0,
                                background: s.quality.verdict === "approved" ? "#f0fdf4" : "#fff1f2",
                                color: s.quality.verdict === "approved" ? "#15803d" : "#9f1239",
                                border: `1px solid ${s.quality.verdict === "approved" ? "#bbf7d0" : "#fecdd3"}`,
                              }}>
                                {s.quality.verdict === "approved" ? "Approved" : "Would be held"}
                              </span>
                            )}
                            <ChevronDown style={{ width: 13, height: 13, color: L.dimmed, transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s", flexShrink: 0 }} />
                          </button>
                          {isOpen && (
                            <div style={{ padding: 16 }}>
                              {s.error ? (
                                <p style={{ fontSize: 12.5, color: "var(--red)" }}>Couldn&apos;t generate: {s.error}</p>
                              ) : (
                                <>
                                  <div style={{ fontSize: 13.5, lineHeight: 1.6, color: "#1a1a1a" }} dangerouslySetInnerHTML={{ __html: s.bodyHtml || "" }} />
                                  {s.quality?.verdict === "rejected" && (
                                    <div style={{ marginTop: 12, padding: "10px 12px", background: "#fff1f2", border: "1px solid #fecdd3", fontSize: 11.5, color: "#9f1239" }}>
                                      <strong>Would be held, not sent:</strong>
                                      {s.quality.reasoning && <div style={{ marginTop: 4 }}>{s.quality.reasoning}</div>}
                                      <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                                        {[...s.quality.mechanicalFails, ...s.quality.judgmentFlags].map((f, i) => <li key={i}>{f}</li>)}
                                      </ul>
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
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
