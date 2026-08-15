"use client";
import { useEffect, useState } from "react";
import Topbar from "@/components/Topbar";
import { Sparkles, RefreshCw, ChevronRight, ExternalLink, Megaphone } from "lucide-react";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };

interface ClientRow {
  id: string;
  name: string;
  trade: string | null;
  status: string;
  brief: { id: string; status: "draft" | "approved"; updated_at: string } | null;
}

interface BriefFields {
  offer_pricing: string;
  ideal_customer: string;
  budget_targeting: string;
  job_value_margins: string;
  competitor_research: string;
  lead_qualification_criteria: string;
  retargeting_strategy: string;
}

interface AdConcept {
  angle: string;
  headline: string;
  primaryText: string;
  creativeDirection: string;
  targeting: string;
}

interface Brief extends BriefFields {
  id: string;
  client_id: string;
  status: "draft" | "approved";
  doc_markdown: string;
  google_doc_url: string | null;
  ad_concepts: AdConcept[];
  updated_at: string;
}

const AD_FIELD_ORDER: { key: keyof AdConcept; label: string }[] = [
  { key: "angle", label: "Angle" },
  { key: "headline", label: "Headline" },
  { key: "primaryText", label: "Primary Text" },
  { key: "creativeDirection", label: "Creative Direction" },
  { key: "targeting", label: "Targeting" },
];

const PRIMARY_FIELDS: { key: keyof BriefFields; label: string }[] = [
  { key: "offer_pricing", label: "Offer + Pricing Confirmed" },
  { key: "ideal_customer", label: "Ideal Customer Defined" },
  { key: "budget_targeting", label: "Budget + Targeting Set" },
];

const SUPPORTING_FIELDS: { key: keyof BriefFields; label: string }[] = [
  { key: "job_value_margins", label: "Job Value & Margins" },
  { key: "competitor_research", label: "Competitor Research" },
  { key: "lead_qualification_criteria", label: "Lead Qualification Criteria" },
  { key: "retargeting_strategy", label: "Retargeting Strategy" },
];

const STATUS_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  none: { label: "NO BRIEF", color: "#94a3b8", bg: "#f8fafc" },
  draft: { label: "DRAFT", color: "#b45309", bg: "#fffbeb" },
  approved: { label: "APPROVED", color: "#16a34a", bg: "#f0fdf4" },
};

export default function CampaignSetupPage() {
  const [clients, setClients] = useState<ClientRow[] | null>(null);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [brief, setBrief] = useState<Brief | null>(null);
  const [fields, setFields] = useState<BriefFields | null>(null);
  const [generating, setGenerating] = useState(false);
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefError, setBriefError] = useState("");
  const [saving, setSaving] = useState(false);

  const [ads, setAds] = useState<AdConcept[] | null>(null);
  const [generatingAds, setGeneratingAds] = useState(false);
  const [savingAds, setSavingAds] = useState(false);
  const [adsError, setAdsError] = useState("");

  function loadClients() {
    fetch("/api/campaign-brief")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setError(data.error); return; }
        setClients(data.clients);
      })
      .catch(() => setError("Failed to load clients."));
  }

  useEffect(() => { loadClients(); }, []);

  const selectedClient = clients?.find((c) => c.id === selectedId) || null;

  function loadBrief(briefId: string) {
    setBriefLoading(true);
    setBriefError("");
    fetch(`/api/campaign-brief/${briefId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setBriefError(data.error); return; }
        setBrief(data.brief);
        setFields(data.brief);
        setAds(data.brief.ad_concepts?.length === 3 ? data.brief.ad_concepts : null);
      })
      .catch(() => setBriefError("Failed to load this brief."))
      .finally(() => setBriefLoading(false));
  }

  function selectClient(c: ClientRow) {
    setSelectedId(c.id);
    setBrief(null);
    setFields(null);
    setAds(null);
    setBriefError("");
    setAdsError("");
    if (c.brief) loadBrief(c.brief.id);
  }

  async function generate() {
    if (!selectedClient) return;
    setGenerating(true);
    setBriefError("");
    try {
      const res = await fetch("/api/campaign-brief/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: selectedClient.id }),
      });
      const data = await res.json();
      if (data.error) { setBriefError(data.error); return; }
      setBrief(data.brief);
      setFields(data.brief);
      setAds(data.brief.ad_concepts?.length === 3 ? data.brief.ad_concepts : null);
      loadClients();
    } catch {
      setBriefError("Failed to generate the brief.");
    } finally {
      setGenerating(false);
    }
  }

  async function generateAds() {
    if (!brief) return;
    setGeneratingAds(true);
    setAdsError("");
    try {
      const res = await fetch(`/api/campaign-brief/${brief.id}/ad-concepts`, { method: "POST" });
      const data = await res.json();
      if (data.error) { setAdsError(data.error); return; }
      setBrief(data.brief);
      setAds(data.brief.ad_concepts);
    } catch {
      setAdsError("Failed to generate ad concepts.");
    } finally {
      setGeneratingAds(false);
    }
  }

  async function saveAds() {
    if (!brief || !ads) return;
    setSavingAds(true);
    setAdsError("");
    try {
      const res = await fetch(`/api/campaign-brief/${brief.id}/ad-concepts`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ad_concepts: ads }),
      });
      const data = await res.json();
      if (data.error) { setAdsError(data.error); return; }
      setBrief(data.brief);
      setAds(data.brief.ad_concepts);
    } catch {
      setAdsError("Failed to save ad concept changes.");
    } finally {
      setSavingAds(false);
    }
  }

  function updateAd(index: number, key: keyof AdConcept, value: string) {
    if (!ads) return;
    const next = ads.slice();
    next[index] = { ...next[index], [key]: value };
    setAds(next);
  }

  async function save(statusOverride?: "draft" | "approved") {
    if (!brief || !fields) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/campaign-brief/${brief.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...fields, status: statusOverride || brief.status }),
      });
      const data = await res.json();
      if (data.error) { setBriefError(data.error); return; }
      setBrief(data.brief);
      setFields(data.brief);
      loadClients();
    } catch {
      setBriefError("Failed to save changes.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <Topbar title="Campaign Setup" subtitle="Stage 01 — Strategy briefs, researched per client before any ad gets built" />

      <div style={{ maxWidth: 1200, margin: "28px auto", padding: "0 28px", display: "flex", gap: 20, width: "100%" }}>
        {/* Client list */}
        <div style={{ width: 280, flexShrink: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {error && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", padding: 12, fontSize: 12 }}>{error}</div>}
          {!clients && !error && <div style={{ padding: 20, textAlign: "center", color: L.dimmed, fontSize: 13 }}>Loading clients…</div>}
          {clients?.length === 0 && <div style={{ padding: 20, textAlign: "center", color: L.dimmed, fontSize: 13 }}>No onboarded clients yet.</div>}
          {clients?.map((c) => {
            const statusKey = c.brief?.status || "none";
            const style = STATUS_STYLE[statusKey];
            const active = c.id === selectedId;
            return (
              <button
                key={c.id}
                onClick={() => selectClient(c)}
                className="card-hover"
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                  textAlign: "left", padding: "12px 14px", background: active ? "#fafafa" : L.surface,
                  border: `1px solid ${active ? "var(--accent)" : L.border}`, cursor: "pointer", width: "100%",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: L.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: L.muted, marginTop: 2 }}>{c.trade || "no trade set"}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                  <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.04em", color: style.color, background: style.bg, padding: "2px 6px", borderRadius: 3 }}>
                    {style.label}
                  </span>
                  <ChevronRight style={{ width: 12, height: 12, color: L.dimmed }} />
                </div>
              </button>
            );
          })}
        </div>

        {/* Brief detail */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {!selectedClient && (
            <div style={{ padding: 60, textAlign: "center", color: L.dimmed, fontSize: 13 }}>Pick a client to view or build their campaign strategy brief.</div>
          )}

          {selectedClient && briefLoading && (
            <div style={{ padding: 60, textAlign: "center", color: L.dimmed, fontSize: 13 }}>Loading brief…</div>
          )}

          {selectedClient && !briefLoading && !brief && (
            <div style={{ background: L.surface, border: `1px solid ${L.border}`, padding: 40, textAlign: "center" }}>
              <p style={{ fontSize: 13, color: L.muted, marginBottom: 16 }}>
                No strategy brief yet for <strong style={{ color: L.text }}>{selectedClient.name}</strong>.
              </p>
              <button
                onClick={generate}
                disabled={generating}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 8, background: "var(--accent)", color: "#fff",
                  border: "none", padding: "10px 18px", fontSize: 13, fontWeight: 700, cursor: generating ? "default" : "pointer",
                }}
              >
                <Sparkles style={{ width: 14, height: 14 }} className={generating ? "spin" : ""} />
                {generating ? "Researching market and drafting brief…" : "Generate strategy brief"}
              </button>
              {generating && <p style={{ fontSize: 11, color: L.dimmed, marginTop: 10 }}>This runs several live searches — can take up to a minute.</p>}
              {briefError && <div style={{ marginTop: 14, fontSize: 12, color: "#b91c1c" }}>{briefError}</div>}
            </div>
          )}

          {selectedClient && brief && fields && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <h2 style={{ fontSize: 16, fontWeight: 800, color: L.text }}>{selectedClient.name}</h2>
                  <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.04em", color: STATUS_STYLE[brief.status].color, background: STATUS_STYLE[brief.status].bg, padding: "3px 7px", borderRadius: 3 }}>
                    {STATUS_STYLE[brief.status].label}
                  </span>
                  {brief.google_doc_url && (
                    <a
                      href={brief.google_doc_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 700, color: "var(--accent)", textDecoration: "none" }}
                    >
                      <ExternalLink style={{ width: 12, height: 12 }} />
                      Master doc
                    </a>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={generate}
                    disabled={generating}
                    style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: `1px solid ${L.border}`, padding: "8px 14px", fontSize: 12, fontWeight: 700, color: L.muted, cursor: generating ? "default" : "pointer" }}
                  >
                    <RefreshCw style={{ width: 12, height: 12 }} className={generating ? "spin" : ""} />
                    Regenerate research
                  </button>
                  <button
                    onClick={() => save()}
                    disabled={saving}
                    style={{ background: "none", border: `1px solid ${L.border}`, padding: "8px 14px", fontSize: 12, fontWeight: 700, color: L.text, cursor: saving ? "default" : "pointer" }}
                  >
                    {saving ? "Saving…" : "Save changes"}
                  </button>
                  {brief.status !== "approved" && (
                    <button
                      onClick={() => save("approved")}
                      disabled={saving}
                      style={{ background: "#16a34a", border: "none", padding: "8px 14px", fontSize: 12, fontWeight: 700, color: "#fff", cursor: saving ? "default" : "pointer" }}
                    >
                      Mark approved
                    </button>
                  )}
                </div>
              </div>

              {briefError && <div style={{ fontSize: 12, color: "#b91c1c" }}>{briefError}</div>}

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14 }}>
                {PRIMARY_FIELDS.map(({ key, label }) => (
                  <div key={key} style={{ background: L.surface, border: `1px solid var(--accent)`, padding: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--accent)", marginBottom: 10 }}>
                      {label}
                    </div>
                    <textarea
                      value={fields[key]}
                      onChange={(e) => setFields({ ...fields, [key]: e.target.value })}
                      rows={3}
                      style={{ width: "100%", border: "none", outline: "none", resize: "vertical", fontSize: 14, fontWeight: 500, color: L.text, lineHeight: 1.5, fontFamily: "inherit", background: "transparent" }}
                    />
                  </div>
                ))}
              </div>

              <div>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: L.dimmed, margin: "6px 0 10px" }}>Supporting research</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12 }}>
                  {SUPPORTING_FIELDS.map(({ key, label }) => (
                    <div key={key} style={{ background: "#fafafa", border: `1px solid ${L.border}`, padding: 12 }}>
                      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, marginBottom: 6 }}>{label}</div>
                      <textarea
                        value={fields[key]}
                        onChange={(e) => setFields({ ...fields, [key]: e.target.value })}
                        rows={3}
                        style={{ width: "100%", border: "none", outline: "none", resize: "vertical", fontSize: 12, color: L.muted, lineHeight: 1.5, fontFamily: "inherit", background: "transparent" }}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, margin: "10px 0 10px" }}>
                  <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: L.text }}>Ad concepts</div>
                  {ads && (
                    <button
                      onClick={generateAds}
                      disabled={generatingAds}
                      style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: `1px solid ${L.border}`, padding: "6px 12px", fontSize: 11, fontWeight: 700, color: L.muted, cursor: generatingAds ? "default" : "pointer" }}
                    >
                      <RefreshCw style={{ width: 11, height: 11 }} className={generatingAds ? "spin" : ""} />
                      Regenerate ad concepts
                    </button>
                  )}
                </div>

                {!ads && (
                  <div style={{ background: L.surface, border: `1px solid ${L.border}`, padding: 30, textAlign: "center" }}>
                    <p style={{ fontSize: 12, color: L.muted, marginBottom: 14 }}>
                      Turn this confirmed brief into the 3 ads Charl would actually run.
                    </p>
                    <button
                      onClick={generateAds}
                      disabled={generatingAds}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 8, background: "var(--accent)", color: "#fff",
                        border: "none", padding: "9px 16px", fontSize: 12, fontWeight: 700, cursor: generatingAds ? "default" : "pointer",
                      }}
                    >
                      <Megaphone style={{ width: 13, height: 13 }} className={generatingAds ? "spin" : ""} />
                      {generatingAds ? "Writing 3 ad concepts…" : "Generate ad concepts"}
                    </button>
                    {adsError && <div style={{ marginTop: 12, fontSize: 12, color: "#b91c1c" }}>{adsError}</div>}
                  </div>
                )}

                {ads && (
                  <>
                    {adsError && <div style={{ marginBottom: 10, fontSize: 12, color: "#b91c1c" }}>{adsError}</div>}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
                      {ads.map((ad, i) => (
                        <div key={i} style={{ background: L.surface, border: `1px solid ${L.border}`, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                          <div style={{ fontSize: 11, fontWeight: 800, color: "var(--accent)" }}>Ad {i + 1}</div>
                          {AD_FIELD_ORDER.map(({ key, label }) => (
                            <div key={key}>
                              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, marginBottom: 4 }}>{label}</div>
                              <textarea
                                value={ad[key]}
                                onChange={(e) => updateAd(i, key, e.target.value)}
                                rows={key === "primaryText" ? 4 : 2}
                                style={{ width: "100%", border: `1px solid ${L.border}`, outline: "none", resize: "vertical", padding: 6, fontSize: 12, color: L.text, lineHeight: 1.5, fontFamily: "inherit", background: "transparent" }}
                              />
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={saveAds}
                      disabled={savingAds}
                      style={{ marginTop: 12, background: "none", border: `1px solid ${L.border}`, padding: "8px 14px", fontSize: 12, fontWeight: 700, color: L.text, cursor: savingAds ? "default" : "pointer" }}
                    >
                      {savingAds ? "Saving…" : "Save ad concept changes"}
                    </button>
                  </>
                )}
              </div>

              <p style={{ fontSize: 11, color: L.dimmed }}>Last updated {new Date(brief.updated_at).toLocaleString("en-NZ")}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
