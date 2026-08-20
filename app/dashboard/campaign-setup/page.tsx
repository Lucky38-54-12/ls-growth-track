"use client";
import { useEffect, useState } from "react";
import Topbar from "@/components/Topbar";
import SectionTabs from "@/components/SectionTabs";
import { Sparkles, RefreshCw, ChevronRight, ExternalLink, Plus, Trash2, Flag } from "lucide-react";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };

interface ClientRow {
  id: string;
  name: string;
  trade: string | null;
  status: string;
  services: string[];
  meta_ad_account_id: string | null;
  brief: { id: string; status: "draft" | "approved"; updated_at: string } | null;
}

interface CreativeReference {
  source: string;
  url: string | null;
  whatTheyreDoing: string;
  whatWeCanTake: string;
}

interface AdConcept {
  name: string;
  format: string;
  angle: string;
  headline: string;
  primaryText: string;
  hook: string;
  first3Seconds: string;
  creativeConcept: string;
  mainMessage: string;
  offer: string;
  cta: string;
  copyFramework: string;
  hypothesis: string;
  whyTesting: string;
  creativeReference: CreativeReference | null;
}

interface MarketResearch {
  keyFindings: string;
  commonOffers: string;
  commonMessaging: string;
  creativePatterns: string;
  opportunities: string;
}

// Matches lib/campaignBrief.ts's ServiceCreativePlan — the whole unit of
// work for one service, generated together in one call (strategy + market
// research + a variable-length set of differentiated ad concepts), not the
// old two-step "prose strategy, then exactly-3 generic ads."
interface ServicePlan {
  customer: string;
  customerProblem: string;
  desiredOutcome: string;
  keyObjections: string;
  recommendedOffer: string;
  marketResearch: MarketResearch;
  ads: AdConcept[];
  flags: string[];
}

// Matches app/api/lead-qual/clients/[id]/config/route.ts — only the shape
// this page actually touches (extra_context); everything else is passed
// through untouched on save.
interface ClientConfig {
  client_id: string;
  version: number;
  business_info: { extra_context?: string; [key: string]: unknown };
  services: string[];
  service_areas: string[];
  faqs: unknown[];
  qualification_rules: unknown;
}

interface Brief {
  id: string;
  client_id: string;
  status: "draft" | "approved";
  ideal_customer: string;
  budget_targeting: string;
  service_details: Record<string, ServicePlan>;
  google_doc_url: string | null;
  updated_at: string;
}

const STATUS_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  none: { label: "NO SETUP", color: "#94a3b8", bg: "#f8fafc" },
  draft: { label: "DRAFT", color: "#b45309", bg: "#fffbeb" },
  approved: { label: "APPROVED", color: "#16a34a", bg: "#f0fdf4" },
};

const emptyPlan = (): ServicePlan => ({
  customer: "",
  customerProblem: "",
  desiredOutcome: "",
  keyObjections: "",
  recommendedOffer: "",
  marketResearch: { keyFindings: "", commonOffers: "", commonMessaging: "", creativePatterns: "", opportunities: "" },
  ads: [],
  flags: [],
});

const emptyAd = (): AdConcept => ({
  name: "New concept",
  format: "",
  angle: "",
  headline: "",
  primaryText: "",
  hook: "",
  first3Seconds: "",
  creativeConcept: "",
  mainMessage: "",
  offer: "",
  cta: "",
  copyFramework: "",
  hypothesis: "",
  whyTesting: "",
  creativeReference: null,
});

function textareaStyle(overrides: Record<string, unknown> = {}) {
  return { width: "100%", border: `1px solid ${L.border}`, outline: "none", resize: "vertical" as const, padding: 8, fontSize: 12.5, color: L.text, lineHeight: 1.5, fontFamily: "inherit", background: "transparent", ...overrides };
}

function Field({ label, value, onChange, rows = 2 }: { label: string; value: string; onChange: (v: string) => void; rows?: number }) {
  return (
    <div>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, marginBottom: 4 }}>{label}</div>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} style={textareaStyle()} />
    </div>
  );
}

export default function CampaignSetupPage() {
  const [clients, setClients] = useState<ClientRow[] | null>(null);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [brief, setBrief] = useState<Brief | null>(null);
  const [sharedFields, setSharedFields] = useState<{ ideal_customer: string; budget_targeting: string }>({ ideal_customer: "", budget_targeting: "" });
  const [planMap, setPlanMap] = useState<Record<string, ServicePlan>>({});
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefError, setBriefError] = useState("");
  const [statusSaving, setStatusSaving] = useState(false);

  const [generatingMap, setGeneratingMap] = useState<Record<string, boolean>>({});
  const [savingMap, setSavingMap] = useState<Record<string, boolean>>({});

  const [config, setConfig] = useState<ClientConfig | null>(null);
  const [notesText, setNotesText] = useState("");
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesError, setNotesError] = useState("");

  const [adAccountInput, setAdAccountInput] = useState("");
  const [adAccountSaving, setAdAccountSaving] = useState(false);
  const [adAccountError, setAdAccountError] = useState("");

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
  const services = selectedClient?.services?.length ? selectedClient.services : selectedClient ? ["General"] : [];

  function applyBrief(b: Brief) {
    setBrief(b);
    setSharedFields({ ideal_customer: b.ideal_customer || "", budget_targeting: b.budget_targeting || "" });
    const pm: Record<string, ServicePlan> = {};
    for (const [svc, details] of Object.entries(b.service_details || {})) {
      // Old-shape rows (pre-rebuild: offerPricing/ad_concepts) have no `ads`
      // array — treated the same as "not generated yet" so they show the
      // Generate CTA instead of rendering broken/empty fields.
      if (Array.isArray((details as { ads?: unknown }).ads)) {
        pm[svc] = details as ServicePlan;
      }
    }
    setPlanMap(pm);
  }

  function loadBrief(briefId: string) {
    setBriefLoading(true);
    setBriefError("");
    fetch(`/api/campaign-brief/${briefId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setBriefError(data.error); return; }
        applyBrief(data.brief);
      })
      .catch(() => setBriefError("Failed to load this brief."))
      .finally(() => setBriefLoading(false));
  }

  function loadConfig(clientId: string) {
    setNotesLoading(true);
    setNotesError("");
    fetch(`/api/lead-qual/clients/${clientId}/config`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setNotesError(data.error); return; }
        setConfig(data.config);
        setNotesText(data.config?.business_info?.extra_context || "");
      })
      .catch(() => setNotesError("Failed to load notes."))
      .finally(() => setNotesLoading(false));
  }

  async function saveNotes() {
    if (!selectedClient || !config) return;
    setNotesSaving(true);
    setNotesError("");
    try {
      const res = await fetch(`/api/lead-qual/clients/${selectedClient.id}/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business_info: { ...config.business_info, extra_context: notesText },
          services: config.services,
          service_areas: config.service_areas,
          faqs: config.faqs,
          qualification_rules: config.qualification_rules,
        }),
      });
      const data = await res.json();
      if (data.error) { setNotesError(data.error); return; }
      setConfig(data.config);
    } catch {
      setNotesError("Failed to save notes.");
    } finally {
      setNotesSaving(false);
    }
  }

  function selectClient(c: ClientRow) {
    setSelectedId(c.id);
    setBrief(null);
    setSharedFields({ ideal_customer: "", budget_targeting: "" });
    setPlanMap({});
    setBriefError("");
    setConfig(null);
    setNotesText("");
    setNotesError("");
    setAdAccountInput(c.meta_ad_account_id || "");
    setAdAccountError("");
    if (c.brief) loadBrief(c.brief.id);
    loadConfig(c.id);
  }

  async function saveAdAccount() {
    if (!selectedClient) return;
    setAdAccountSaving(true);
    setAdAccountError("");
    try {
      const res = await fetch(`/api/lead-qual/clients/${selectedClient.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meta_ad_account_id: adAccountInput }),
      });
      const data = await res.json();
      if (data.error) { setAdAccountError(data.error); return; }
      setClients((prev) => prev?.map((c) => (c.id === selectedClient.id ? { ...c, meta_ad_account_id: data.client.meta_ad_account_id } : c)) || null);
    } catch {
      setAdAccountError("Failed to save the ad account ID.");
    } finally {
      setAdAccountSaving(false);
    }
  }

  async function generatePlan(service: string) {
    if (!selectedClient) return;
    setGeneratingMap((m) => ({ ...m, [service]: true }));
    setBriefError("");
    try {
      const res = await fetch("/api/campaign-brief/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: selectedClient.id, service }),
      });
      const data = await res.json();
      if (data.error) { setBriefError(data.error); return; }
      applyBrief(data.brief);
      loadClients();
    } catch {
      setBriefError("Failed to generate the campaign setup.");
    } finally {
      setGeneratingMap((m) => ({ ...m, [service]: false }));
    }
  }

  async function savePlan(service: string) {
    if (!brief) return;
    setSavingMap((m) => ({ ...m, [service]: true }));
    setBriefError("");
    try {
      const res = await fetch(`/api/campaign-brief/${brief.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ideal_customer: sharedFields.ideal_customer,
          budget_targeting: sharedFields.budget_targeting,
          service,
          plan: planMap[service] || emptyPlan(),
        }),
      });
      const data = await res.json();
      if (data.error) { setBriefError(data.error); return; }
      applyBrief(data.brief);
      loadClients();
    } catch {
      setBriefError("Failed to save changes.");
    } finally {
      setSavingMap((m) => ({ ...m, [service]: false }));
    }
  }

  async function setStatus(status: "draft" | "approved") {
    if (!brief) return;
    setStatusSaving(true);
    try {
      const res = await fetch(`/api/campaign-brief/${brief.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (data.error) { setBriefError(data.error); return; }
      applyBrief(data.brief);
      loadClients();
    } catch {
      setBriefError("Failed to update status.");
    } finally {
      setStatusSaving(false);
    }
  }

  function updatePlan(service: string, patch: Partial<ServicePlan>) {
    setPlanMap((m) => ({ ...m, [service]: { ...(m[service] || emptyPlan()), ...patch } }));
  }

  function updateMarketResearch(service: string, patch: Partial<MarketResearch>) {
    const current = planMap[service] || emptyPlan();
    updatePlan(service, { marketResearch: { ...current.marketResearch, ...patch } });
  }

  function updateAd(service: string, index: number, patch: Partial<AdConcept>) {
    const current = planMap[service] || emptyPlan();
    const ads = current.ads.slice();
    ads[index] = { ...ads[index], ...patch };
    updatePlan(service, { ads });
  }

  function updateAdReference(service: string, index: number, patch: Partial<CreativeReference>) {
    const current = planMap[service] || emptyPlan();
    const ad = current.ads[index];
    const ref: CreativeReference = { source: "", url: null, whatTheyreDoing: "", whatWeCanTake: "", ...ad.creativeReference, ...patch };
    updateAd(service, index, { creativeReference: ref });
  }

  function addAd(service: string) {
    const current = planMap[service] || emptyPlan();
    updatePlan(service, { ads: [...current.ads, emptyAd()] });
  }

  function removeAd(service: string, index: number) {
    const current = planMap[service] || emptyPlan();
    updatePlan(service, { ads: current.ads.filter((_, i) => i !== index) });
  }

  // Every generated/edited ad across every service, in one place — the
  // "hand this to a media buyer" view Lucky asked for, built from data
  // already on the page rather than a separate AI call.
  const testingSummaryRows = services.flatMap((service) =>
    (planMap[service]?.ads || []).map((ad, i) => ({ service, index: i + 1, ad }))
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <Topbar title="Campaign Setup" subtitle="Practical creative testing plans — researched per client and per service before any ad gets built" />

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

        {/* Client detail */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {!selectedClient && (
            <div style={{ padding: 60, textAlign: "center", color: L.dimmed, fontSize: 13 }}>Pick a client to view or build their campaign setup.</div>
          )}

          {selectedClient && briefLoading && (
            <div style={{ padding: 60, textAlign: "center", color: L.dimmed, fontSize: 13 }}>Loading…</div>
          )}

          {selectedClient && !briefLoading && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <h2 style={{ fontSize: 16, fontWeight: 800, color: L.text }}>{selectedClient.name}</h2>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input
                      value={adAccountInput}
                      onChange={(e) => setAdAccountInput(e.target.value)}
                      placeholder="Meta ad account ID"
                      style={{ width: 160, border: `1px solid ${L.border}`, outline: "none", padding: "5px 8px", fontSize: 11, color: L.text, fontFamily: "inherit" }}
                    />
                    <button
                      onClick={saveAdAccount}
                      disabled={adAccountSaving || adAccountInput === (selectedClient.meta_ad_account_id || "")}
                      style={{ background: "none", border: `1px solid ${L.border}`, padding: "5px 10px", fontSize: 11, fontWeight: 700, color: L.text, cursor: adAccountSaving ? "default" : "pointer" }}
                    >
                      {adAccountSaving ? "Saving…" : "Save"}
                    </button>
                    {selectedClient.meta_ad_account_id && (
                      <a
                        href={`/dashboard/meta-ads?account=${selectedClient.meta_ad_account_id}`}
                        style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, color: "var(--accent)", textDecoration: "none" }}
                      >
                        <ExternalLink style={{ width: 11, height: 11 }} />
                        View in Meta Ads
                      </a>
                    )}
                  </div>
                  {adAccountError && <span style={{ fontSize: 11, color: "#b91c1c" }}>{adAccountError}</span>}
                  {brief && (
                    <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.04em", color: STATUS_STYLE[brief.status].color, background: STATUS_STYLE[brief.status].bg, padding: "3px 7px", borderRadius: 3 }}>
                      {STATUS_STYLE[brief.status].label}
                    </span>
                  )}
                  {brief?.google_doc_url && (
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
                {brief && brief.status !== "approved" && (
                  <button
                    onClick={() => setStatus("approved")}
                    disabled={statusSaving}
                    style={{ background: "#16a34a", border: "none", padding: "8px 14px", fontSize: 12, fontWeight: 700, color: "#fff", cursor: statusSaving ? "default" : "pointer" }}
                  >
                    Mark approved
                  </button>
                )}
              </div>

              {briefError && <div style={{ fontSize: 12, color: "#b91c1c" }}>{briefError}</div>}

              {(sharedFields.ideal_customer || sharedFields.budget_targeting) && (
                <div style={{ background: "#0f172a", borderRadius: 10, padding: "14px 18px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "6px 20px", fontSize: 12.5, color: "#e2e8f0" }}>
                  <div><span style={{ color: "#94a3b8" }}>Ideal customer (shared): </span>{sharedFields.ideal_customer || "—"}</div>
                  <div><span style={{ color: "#94a3b8" }}>Budget + targeting (shared): </span>{sharedFields.budget_targeting || "—"}</div>
                </div>
              )}

              <SectionTabs
                key={selectedClient.id}
                tabs={[
                  ...services.map((service) => {
                    const plan = planMap[service];
                    const hasPlan = !!plan;
                    const generating = !!generatingMap[service];
                    const saving = !!savingMap[service];

                    return {
                      id: service,
                      label: service,
                      badge: plan?.ads.length,
                      content: !hasPlan ? (
                        <div style={{ background: L.surface, border: `1px solid ${L.border}`, padding: 40, textAlign: "center" }}>
                          <p style={{ fontSize: 13, color: L.muted, marginBottom: 16 }}>
                            No campaign setup yet for <strong style={{ color: L.text }}>{service}</strong>.
                          </p>
                          <button
                            onClick={() => generatePlan(service)}
                            disabled={generating}
                            style={{
                              display: "inline-flex", alignItems: "center", gap: 8, background: "var(--accent)", color: "#fff",
                              border: "none", padding: "10px 18px", fontSize: 13, fontWeight: 700, cursor: generating ? "default" : "pointer",
                            }}
                          >
                            <Sparkles style={{ width: 14, height: 14 }} className={generating ? "spin" : ""} />
                            {generating ? "Researching market and building the testing plan…" : `Generate campaign setup for ${service}`}
                          </button>
                          {generating && <p style={{ fontSize: 11, color: L.dimmed, marginTop: 10 }}>Several live searches plus creative generation — can take up to two minutes.</p>}
                        </div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                          <div style={{ background: "#0f172a", borderRadius: 10, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
                            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "#93c5fd" }}>Campaign Decision — {service}</div>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "6px 20px", fontSize: 13, color: "#e2e8f0", lineHeight: 1.5 }}>
                              <div><span style={{ color: "#94a3b8" }}>Recommended offer: </span>{plan.recommendedOffer || "—"}</div>
                              <div><span style={{ color: "#94a3b8" }}>Customer: </span>{plan.customer || "—"}</div>
                              <div><span style={{ color: "#94a3b8" }}>Ad concepts: </span>{plan.ads.length} ({plan.ads.map((a) => a.format || a.angle).filter(Boolean).join(", ") || "—"})</div>
                            </div>
                          </div>

                          {plan.flags.length > 0 && (
                            <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: 14, display: "flex", gap: 10 }}>
                              <Flag style={{ width: 14, height: 14, color: "#b45309", flexShrink: 0, marginTop: 1 }} />
                              <div>
                                <div style={{ fontSize: 11, fontWeight: 800, color: "#92400e", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>Flagged — needs your input</div>
                                <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12.5, color: "#78350f" }}>
                                  {plan.flags.map((f, i) => <li key={i}>{f}</li>)}
                                </ul>
                              </div>
                            </div>
                          )}

                          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                            <button
                              onClick={() => generatePlan(service)}
                              disabled={generating}
                              style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: `1px solid ${L.border}`, padding: "8px 14px", fontSize: 12, fontWeight: 700, color: L.muted, cursor: generating ? "default" : "pointer" }}
                            >
                              <RefreshCw style={{ width: 12, height: 12 }} className={generating ? "spin" : ""} />
                              Regenerate
                            </button>
                            <button
                              onClick={() => savePlan(service)}
                              disabled={saving}
                              style={{ background: "none", border: `1px solid ${L.border}`, padding: "8px 14px", fontSize: 12, fontWeight: 700, color: L.text, cursor: saving ? "default" : "pointer" }}
                            >
                              {saving ? "Saving…" : "Save changes"}
                            </button>
                          </div>

                          <div style={{ background: L.surface, border: `1px solid var(--accent)`, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--accent)" }}>Service Strategy</div>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
                              <Field label="Customer" value={plan.customer} onChange={(v) => updatePlan(service, { customer: v })} />
                              <Field label="Customer Problem" value={plan.customerProblem} onChange={(v) => updatePlan(service, { customerProblem: v })} />
                              <Field label="Desired Outcome" value={plan.desiredOutcome} onChange={(v) => updatePlan(service, { desiredOutcome: v })} />
                              <Field label="Key Objections" value={plan.keyObjections} onChange={(v) => updatePlan(service, { keyObjections: v })} />
                              <Field label="Recommended Offer" value={plan.recommendedOffer} onChange={(v) => updatePlan(service, { recommendedOffer: v })} />
                            </div>
                          </div>

                          <div style={{ background: "#fafafa", border: `1px solid ${L.border}`, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: L.muted }}>Market Research</div>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
                              <Field label="Key Findings" value={plan.marketResearch.keyFindings} onChange={(v) => updateMarketResearch(service, { keyFindings: v })} rows={3} />
                              <Field label="Common Offers" value={plan.marketResearch.commonOffers} onChange={(v) => updateMarketResearch(service, { commonOffers: v })} rows={3} />
                              <Field label="Common Messaging" value={plan.marketResearch.commonMessaging} onChange={(v) => updateMarketResearch(service, { commonMessaging: v })} rows={3} />
                              <Field label="Creative Patterns" value={plan.marketResearch.creativePatterns} onChange={(v) => updateMarketResearch(service, { creativePatterns: v })} rows={3} />
                              <Field label="Opportunities" value={plan.marketResearch.opportunities} onChange={(v) => updateMarketResearch(service, { opportunities: v })} rows={3} />
                            </div>
                          </div>

                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: L.text }}>Ad Concepts</div>
                            <button
                              onClick={() => addAd(service)}
                              style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: `1px solid ${L.border}`, padding: "6px 12px", fontSize: 11.5, fontWeight: 700, color: L.text, cursor: "pointer" }}
                            >
                              <Plus style={{ width: 12, height: 12 }} /> Add concept
                            </button>
                          </div>

                          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                            {plan.ads.map((ad, i) => (
                              <div key={i} style={{ background: L.surface, border: `1px solid ${L.border}`, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                  <input
                                    value={ad.name}
                                    onChange={(e) => updateAd(service, i, { name: e.target.value })}
                                    style={{ fontSize: 13, fontWeight: 800, color: "var(--accent)", border: "none", outline: "none", background: "transparent", flex: 1, fontFamily: "inherit" }}
                                  />
                                  <button
                                    onClick={() => removeAd(service, i)}
                                    title="Remove this concept"
                                    style={{ background: "none", border: "none", color: L.dimmed, cursor: "pointer", padding: 4, display: "flex" }}
                                  >
                                    <Trash2 style={{ width: 13, height: 13 }} />
                                  </button>
                                </div>

                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
                                  <Field label="Format" value={ad.format} onChange={(v) => updateAd(service, i, { format: v })} rows={1} />
                                  <Field label="Angle" value={ad.angle} onChange={(v) => updateAd(service, i, { angle: v })} rows={1} />
                                  <Field label="Copy Framework" value={ad.copyFramework} onChange={(v) => updateAd(service, i, { copyFramework: v })} rows={1} />
                                  <Field label="Offer" value={ad.offer} onChange={(v) => updateAd(service, i, { offer: v })} rows={1} />
                                </div>

                                <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#1d4ed8" }}>Ready-to-Use Meta Copy</div>
                                  <Field label="Headline" value={ad.headline} onChange={(v) => updateAd(service, i, { headline: v })} rows={1} />
                                  <Field label="Primary Text" value={ad.primaryText} onChange={(v) => updateAd(service, i, { primaryText: v })} rows={3} />
                                  <Field label="CTA" value={ad.cta} onChange={(v) => updateAd(service, i, { cta: v })} rows={1} />
                                </div>

                                <Field label="Hook" value={ad.hook} onChange={(v) => updateAd(service, i, { hook: v })} rows={2} />
                                <Field label="First 3 Seconds" value={ad.first3Seconds} onChange={(v) => updateAd(service, i, { first3Seconds: v })} rows={2} />
                                <Field label="Creative Concept" value={ad.creativeConcept} onChange={(v) => updateAd(service, i, { creativeConcept: v })} rows={3} />
                                <Field label="Main Message" value={ad.mainMessage} onChange={(v) => updateAd(service, i, { mainMessage: v })} rows={2} />

                                <div style={{ background: "#fafafa", border: `1px solid ${L.border}`, padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                                  <Field label="Hypothesis — what we're testing" value={ad.hypothesis} onChange={(v) => updateAd(service, i, { hypothesis: v })} rows={2} />
                                  <Field label="Why We're Testing It" value={ad.whyTesting} onChange={(v) => updateAd(service, i, { whyTesting: v })} rows={2} />
                                </div>

                                <div style={{ border: `1px dashed ${L.border}`, padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted }}>Creative Reference</div>
                                  <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 8 }}>
                                    <input
                                      value={ad.creativeReference?.source || ""}
                                      onChange={(e) => updateAdReference(service, i, { source: e.target.value })}
                                      placeholder="Source (e.g. Meta Ad Library)"
                                      style={{ padding: 6, fontSize: 11.5, border: `1px solid ${L.border}`, fontFamily: "inherit" }}
                                    />
                                    <input
                                      value={ad.creativeReference?.url || ""}
                                      onChange={(e) => updateAdReference(service, i, { url: e.target.value || null })}
                                      placeholder="URL (leave blank if describing a pattern, not one ad)"
                                      style={{ padding: 6, fontSize: 11.5, border: `1px solid ${L.border}`, fontFamily: "inherit" }}
                                    />
                                  </div>
                                  {ad.creativeReference?.url && (
                                    <a href={ad.creativeReference.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "var(--accent)", wordBreak: "break-all" }}>
                                      {ad.creativeReference.url}
                                    </a>
                                  )}
                                  <Field label="What They're Doing" value={ad.creativeReference?.whatTheyreDoing || ""} onChange={(v) => updateAdReference(service, i, { whatTheyreDoing: v })} rows={2} />
                                  <Field label="What We Can Take" value={ad.creativeReference?.whatWeCanTake || ""} onChange={(v) => updateAdReference(service, i, { whatWeCanTake: v })} rows={2} />
                                </div>
                              </div>
                            ))}
                            {plan.ads.length === 0 && (
                              <div style={{ padding: 20, textAlign: "center", color: L.dimmed, fontSize: 12.5, border: `1px dashed ${L.border}` }}>
                                No ad concepts yet — add one manually or regenerate.
                              </div>
                            )}
                          </div>
                        </div>
                      ),
                    };
                  }),
                  {
                    id: "testing-summary",
                    label: "Testing Summary",
                    content: testingSummaryRows.length === 0 ? (
                      <div style={{ padding: 40, textAlign: "center", color: L.dimmed, fontSize: 13 }}>
                        Generate at least one service's campaign setup to see the testing summary.
                      </div>
                    ) : (
                      <div style={{ background: L.surface, border: `1px solid ${L.border}`, overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                          <thead>
                            <tr style={{ borderBottom: `1px solid ${L.border}` }}>
                              {["Service", "Ad", "Format", "Angle", "Headline", "Offer", "Main Hypothesis"].map((h) => (
                                <th key={h} style={{ textAlign: "left", padding: "10px 14px", fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {testingSummaryRows.map(({ service, index, ad }, i) => (
                              <tr key={`${service}-${index}`} style={{ borderBottom: `1px solid ${L.border}`, background: i % 2 ? "#fafafa" : "transparent" }}>
                                <td style={{ padding: "10px 14px", color: L.text, fontWeight: 600 }}>{service}</td>
                                <td style={{ padding: "10px 14px", color: L.muted }}>Ad {index}</td>
                                <td style={{ padding: "10px 14px", color: L.text }}>{ad.format || "—"}</td>
                                <td style={{ padding: "10px 14px", color: L.text }}>{ad.angle || "—"}</td>
                                <td style={{ padding: "10px 14px", color: L.text }}>{ad.headline || "—"}</td>
                                <td style={{ padding: "10px 14px", color: L.text }}>{ad.offer || "—"}</td>
                                <td style={{ padding: "10px 14px", color: L.muted, maxWidth: 340 }}>{ad.hypothesis || "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ),
                  },
                  {
                    id: "notes",
                    label: "Notes",
                    content: (
                      <div>
                        <p style={{ fontSize: 12, color: L.muted, marginBottom: 10 }}>
                          Anything you want the Brain to know about this client — target audience, budget caps, a specific ad idea, whatever — before it researches or writes anything.
                        </p>
                        {notesLoading && <div style={{ padding: 20, textAlign: "center", color: L.dimmed, fontSize: 13 }}>Loading notes…</div>}
                        {!notesLoading && (
                          <>
                            <textarea
                              value={notesText}
                              onChange={(e) => setNotesText(e.target.value)}
                              rows={10}
                              placeholder="e.g. target audience is homeowners 40-55+, budget capped at $30/day, wants a start-to-finish deck build video as one of the ads..."
                              style={{ width: "100%", border: `1px solid ${L.border}`, outline: "none", resize: "vertical", padding: 10, fontSize: 13, color: L.text, lineHeight: 1.6, fontFamily: "inherit" }}
                            />
                            {notesError && <div style={{ marginTop: 10, fontSize: 12, color: "#b91c1c" }}>{notesError}</div>}
                            <button
                              onClick={saveNotes}
                              disabled={notesSaving || !config}
                              style={{ marginTop: 10, background: "var(--accent)", color: "#fff", border: "none", padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: notesSaving ? "default" : "pointer" }}
                            >
                              {notesSaving ? "Saving…" : "Save notes"}
                            </button>
                          </>
                        )}
                      </div>
                    ),
                  },
                ]}
              />

              {brief && <p style={{ fontSize: 11, color: L.dimmed }}>Last updated {new Date(brief.updated_at).toLocaleString("en-NZ")}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
