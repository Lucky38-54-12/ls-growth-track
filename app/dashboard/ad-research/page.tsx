"use client";
import { useState } from "react";
import Topbar from "@/components/Topbar";
import { Search, MapPin, ExternalLink, Sparkles } from "lucide-react";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };

interface AdIdea {
  headline: string;
  angle: string;
  offer: string | null;
  format: string;
  why_it_works: string;
  source_url: string | null;
  source_business: string | null;
}

interface AdResearchResult {
  summary: string;
  ads: AdIdea[];
  source: "live_ad_library" | "ai_web_search";
  researchedAt?: string;
}

export default function AdResearchPage() {
  const [niche, setNiche] = useState("");
  const [location, setLocation] = useState("New Zealand");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AdResearchResult | null>(null);

  async function runResearch(e: React.FormEvent) {
    e.preventDefault();
    if (!niche.trim()) return;

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/ad-research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ niche: niche.trim(), location: location.trim() }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      setResult(data);
    } catch {
      setError("Research failed — check server logs.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <Topbar title="Ad Research" subtitle="Find Meta (Facebook/Instagram) ad angles that are working for a given trade/niche" />

      <div style={{ maxWidth: 900, margin: "28px auto", padding: "0 28px", display: "flex", flexDirection: "column", gap: 20, width: "100%" }}>

        <div style={{ background: L.surface, border: `1px solid ${L.border}`, padding: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: L.muted, marginBottom: 18 }}>Find Working Ads</div>

          <form onSubmit={runResearch} style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: L.muted, letterSpacing: "0.06em", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 5 }}>
                <Search style={{ width: 11, height: 11 }} /> Trade / Niche
              </span>
              <input
                value={niche}
                onChange={e => setNiche(e.target.value)}
                placeholder="e.g. bathroom renovation companies"
                required
                disabled={loading}
                style={{ padding: "9px 12px", border: `1px solid ${L.border}`, fontSize: 13, color: L.text, fontFamily: "inherit", background: L.surface, outline: "none" }}
              />
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: L.muted, letterSpacing: "0.06em", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 5 }}>
                <MapPin style={{ width: 11, height: 11 }} /> Location
              </span>
              <input
                value={location}
                onChange={e => setLocation(e.target.value)}
                placeholder="New Zealand"
                disabled={loading}
                style={{ padding: "9px 12px", border: `1px solid ${L.border}`, fontSize: 13, color: L.text, fontFamily: "inherit", background: L.surface, outline: "none" }}
              />
            </label>

            <div style={{ gridColumn: "1 / -1", display: "flex", gap: 10, alignItems: "center", marginTop: 4 }}>
              <button
                type="submit"
                disabled={loading}
                className="btn-lift"
                style={{ display: "flex", alignItems: "center", gap: 7, background: "var(--red)", color: "#fff", border: "none", padding: "10px 20px", fontSize: 13, fontWeight: 700, cursor: loading ? "default" : "pointer", opacity: loading ? 0.7 : 1 }}
              >
                <Sparkles style={{ width: 13, height: 13 }} />
                {loading ? "Researching…" : "Find Working Ads"}
              </button>
              <span style={{ fontSize: 12, color: L.dimmed }}>
                Searches Meta Ad Library and the web — usually takes 20-40s.
              </span>
            </div>
          </form>
        </div>

        {error && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", padding: 16, fontSize: 13 }}>
            {error}
          </div>
        )}

        {result && (
          <>
            {result.summary && (
              <div style={{ background: L.surface, border: `1px solid ${L.border}`, padding: 20 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: L.muted }}>Summary</div>
                  {result.source === "live_ad_library" ? (
                    <span style={{ fontSize: 10, fontWeight: 800, color: "#15803d", background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "2px 8px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                      Real live ads{result.researchedAt ? ` · pulled ${new Date(result.researchedAt).toLocaleDateString()}` : ""}
                    </span>
                  ) : (
                    <span style={{ fontSize: 10, fontWeight: 800, color: L.dimmed, background: "#f8fafc", border: `1px solid ${L.border}`, padding: "2px 8px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                      AI-inferred, not verified live ads
                    </span>
                  )}
                </div>
                <p style={{ fontSize: 14, color: L.text, lineHeight: 1.6 }}>{result.summary}</p>
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {result.ads.map((ad, i) => (
                <div key={i} style={{ background: L.surface, border: `1px solid ${L.border}`, padding: 18 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 8 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: L.text, lineHeight: 1.4 }}>{ad.headline}</div>
                    <span style={{ fontSize: 10, fontWeight: 700, color: "var(--red)", border: "1px solid var(--red)", padding: "2px 8px", whiteSpace: "nowrap", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                      {ad.angle}
                    </span>
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10, fontSize: 12, color: L.muted }}>
                    <span>{ad.format}</span>
                    {ad.offer && <><span>·</span><span>Offer: {ad.offer}</span></>}
                  </div>

                  <p style={{ fontSize: 13, color: L.text, lineHeight: 1.6, marginBottom: ad.source_url || ad.source_business ? 10 : 0 }}>
                    {ad.why_it_works}
                  </p>

                  {(ad.source_url || ad.source_business) && (
                    <div style={{ fontSize: 12, color: L.dimmed, display: "flex", alignItems: "center", gap: 6 }}>
                      {ad.source_business && <span>{ad.source_business}</span>}
                      {ad.source_url && (
                        <a href={ad.source_url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--red)", display: "flex", alignItems: "center", gap: 4 }}>
                          Source <ExternalLink style={{ width: 10, height: 10 }} />
                        </a>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
