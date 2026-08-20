"use client";
import { useEffect, useState } from "react";
import Topbar from "@/components/Topbar";
import SectionTabs from "@/components/SectionTabs";
import { Sparkles, RefreshCw, ChevronRight, ExternalLink, Megaphone } from "lucide-react";

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

interface AdConcept {
  angle: string;
  headline: string;
  primaryText: string;
  creativeDirection: string;
  targeting: string;
  referenceLinks: string[];
}

// Per-service strategy fields, matching lib/campaignBrief.ts's ServiceStrategy
// plus the ad_concepts campaignAds.ts writes into the same object.
interface ServiceStrategyFields {
  offerPricing: string;
  jobValueMargins: string;
  competitorResearch: string;
  leadQualificationCriteria: string;
  retargetingStrategy: string;
}

interface ServiceDetail extends ServiceStrategyFields {
  ad_concepts?: AdConcept[];
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
  service_details: Record<string, ServiceDetail>;
  google_doc_url: string | null;
  updated_at: string;
}

const AD_FIELD_ORDER: { key: keyof Omit<AdConcept, "referenceLinks">; label: string }[] = [
  { key: "angle", label: "Angle" },
  { key: "headline", label: "Headline" },
  { key: "primaryText", label: "Primary Text" },
  { key: "creativeDirection", label: "Creative Direction" },
  { key: "targeting", label: "Targeting" },
];

const SERVICE_FIELD_ORDER: { key: keyof ServiceStrategyFields; label: string }[] = [
  { key: "jobValueMargins", label: "Job Value & Margins" },
  { key: "competitorResearch", label: "Competitor Research" },
  { key: "leadQualificationCriteria", label: "Lead Qualification Criteria" },
  { key: "retargetingStrategy", label: "Retargeting Strategy" },
];

const STATUS_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  none: { label: "NO BRIEF", color: "#94a3b8", bg: "#f8fafc" },
  draft: { label: "DRAFT", color: "#b45309", bg: "#fffbeb" },
  approved: { label: "APPROVED", color: "#16a34a", bg: "#f0fdf4" },
};

const emptyServiceFields = (): ServiceStrategyFields => ({
  offerPricing: "",
  jobValueMargins: "",
  competitorResearch: "",
  leadQualificationCriteria: "",
  retargetingStrategy: "",
});

export default function CampaignSetupPage() {
  const [clients, setClients] = useState<ClientRow[] | null>(null);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [brief, setBrief] = useState<Brief | null>(null);
  const [sharedFields, setSharedFields] = useState<{ ideal_customer: string; budget_targeting: string }>({ ideal_customer: "", budget_targeting: "" });
  const [serviceFieldsMap, setServiceFieldsMap] = useState<Record<string, ServiceStrategyFields>>({});
  const [adsMap, setAdsMap] = useState<Record<string, AdConcept[] | null>>({});
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefError, setBriefError] = useState("");
  const [statusSaving, setStatusSaving] = useState(false);

  const [generatingMap, setGeneratingMap] = useState<Record<string, boolean>>({});
  const [savingMap, setSavingMap] = useState<Record<string, boolean>>({});
  const [generatingAdsMap, setGeneratingAdsMap] = useState<Record<string, boolean>>({});
  const [savingAdsMap, setSavingAdsMap] = useState<Record<string, boolean>>({});
  const [adsError, setAdsError] = useState("");

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
    const sfMap: Record<string, ServiceStrategyFields> = {};
    const adsNext: Record<string, AdConcept[] | null> = {};
    for (const [svc, details] of Object.entries(b.service_details || {})) {
      sfMap[svc] = {
        offerPricing: details.offerPricing || "",
        jobValueMargins: details.jobValueMargins || "",
        competitorResearch: details.competitorResearch || "",
        leadQualificationCriteria: details.leadQualificationCriteria || "",
        retargetingStrategy: details.retargetingStrategy || "",
      };
      adsNext[svc] = details.ad_concepts?.length === 3 ? details.ad_concepts : null;
    }
    setServiceFieldsMap(sfMap);
    setAdsMap(adsNext);
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
    setServiceFieldsMap({});
    setAdsMap({});
    setBriefError("");
    setAdsError("");
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

  async function generateStrategy(service: string) {
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
      setBriefError("Failed to generate the strategy.");
    } finally {
      setGeneratingMap((m) => ({ ...m, [service]: false }));
    }
  }

  async function saveStrategy(service: string) {
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
          serviceFields: serviceFieldsMap[service] || emptyServiceFields(),
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

  async function generateAds(service: string) {
    if (!brief) return;
    setGeneratingAdsMap((m) => ({ ...m, [service]: true }));
    setAdsError("");
    try {
      const res = await fetch(`/api/campaign-brief/${brief.id}/ad-concepts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service }),
      });
      const data = await res.json();
      if (data.error) { setAdsError(data.error); return; }
      applyBrief(data.brief);
    } catch {
      setAdsError("Failed to generate ad concepts.");
    } finally {
      setGeneratingAdsMap((m) => ({ ...m, [service]: false }));
    }
  }

  async function saveAds(service: string) {
    if (!brief || !adsMap[service]) return;
    setSavingAdsMap((m) => ({ ...m, [service]: true }));
    setAdsError("");
    try {
      const res = await fetch(`/api/campaign-brief/${brief.id}/ad-concepts`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service, ad_concepts: adsMap[service] }),
      });
      const data = await res.json();
      if (data.error) { setAdsError(data.error); return; }
      applyBrief(data.brief);
    } catch {
      setAdsError("Failed to save ad concept changes.");
    } finally {
      setSavingAdsMap((m) => ({ ...m, [service]: false }));
    }
  }

  function updateAd(service: string, index: number, key: keyof Omit<AdConcept, "referenceLinks">, value: string) {
    const current = adsMap[service];
    if (!current) return;
    const next = current.slice();
    next[index] = { ...next[index], [key]: value };
    setAdsMap((m) => ({ ...m, [service]: next }));
  }

  function updateAdLinks(service: string, index: number, value: string) {
    const current = adsMap[service];
    if (!current) return;
    const next = current.slice();
    next[index] = { ...next[index], referenceLinks: value.split("\n").map((l) => l.trim()).filter(Boolean) };
    setAdsMap((m) => ({ ...m, [service]: next }));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <Topbar title="Campaign Setup" subtitle="Stage 01 — Strategy briefs, researched per client and per service before any ad gets built" />

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
            <div style={{ padding: 60, textAlign: "center", color: L.dimmed, fontSize: 13 }}>Pick a client to view or build their campaign strategy.</div>
          )}

          {selectedClient && briefLoading && (
            <div style={{ padding: 60, textAlign: "center", color: L.dimmed, fontSize: 13 }}>Loading brief…</div>
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

              <SectionTabs
                key={selectedClient.id}
                tabs={[
                  ...services.map((service) => {
                    const hasStrategy = !!serviceFieldsMap[service];
                    const ads = adsMap[service] || null;
                    const generating = !!generatingMap[service];
                    const saving = !!savingMap[service];
                    const generatingAds = !!generatingAdsMap[service];
                    const savingAds = !!savingAdsMap[service];
                    const fields = serviceFieldsMap[service] || emptyServiceFields();

                    return {
                      id: service,
                      label: service,
                      content: !hasStrategy ? (
                        <div style={{ background: L.surface, border: `1px solid ${L.border}`, padding: 40, textAlign: "center" }}>
                          <p style={{ fontSize: 13, color: L.muted, marginBottom: 16 }}>
                            No strategy yet for <strong style={{ color: L.text }}>{service}</strong>.
                          </p>
                          <button
                            onClick={() => generateStrategy(service)}
                            disabled={generating}
                            style={{
                              display: "inline-flex", alignItems: "center", gap: 8, background: "var(--accent)", color: "#fff",
                              border: "none", padding: "10px 18px", fontSize: 13, fontWeight: 700, cursor: generating ? "default" : "pointer",
                            }}
                          >
                            <Sparkles style={{ width: 14, height: 14 }} className={generating ? "spin" : ""} />
                            {generating ? "Researching market and drafting strategy…" : `Generate strategy for ${service}`}
                          </button>
                          {generating && <p style={{ fontSize: 11, color: L.dimmed, marginTop: 10 }}>This runs several live searches — can take up to a minute.</p>}
                        </div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                          <div style={{ background: "#0f172a", borderRadius: 10, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
                            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "#93c5fd" }}>Campaign Decision — {service}</div>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "6px 20px", fontSize: 13, color: "#e2e8f0", lineHeight: 1.5 }}>
                              <div><span style={{ color: "#94a3b8" }}>Offer: </span>{fields.offerPricing || "—"}</div>
                              <div><span style={{ color: "#94a3b8" }}>Ideal customer: </span>{sharedFields.ideal_customer || "—"}</div>
                              <div><span style={{ color: "#94a3b8" }}>Budget + targeting: </span>{sharedFields.budget_targeting || "—"}</div>
                              <div><span style={{ color: "#94a3b8" }}>Current ad angle: </span>{ads?.[0]?.angle || "no ad concepts yet"}</div>
                            </div>
                          </div>
                          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                            <button
                              onClick={() => generateStrategy(service)}
                              disabled={generating}
                              style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: `1px solid ${L.border}`, padding: "8px 14px", fontSize: 12, fontWeight: 700, color: L.muted, cursor: generating ? "default" : "pointer" }}
                            >
                              <RefreshCw style={{ width: 12, height: 12 }} className={generating ? "spin" : ""} />
                              Regenerate research
                            </button>
                            <button
                              onClick={() => saveStrategy(service)}
                              disabled={saving}
                              style={{ background: "none", border: `1px solid ${L.border}`, padding: "8px 14px", fontSize: 12, fontWeight: 700, color: L.text, cursor: saving ? "default" : "pointer" }}
                            >
                              {saving ? "Saving…" : "Save changes"}
                            </button>
                          </div>

                          <SectionTabs
                            tabs={[
                              {
                                id: "strategy",
                                label: "Strategy",
                                content: (
                                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14 }}>
                                    <div style={{ background: L.surface, border: `1px solid var(--accent)`, padding: 16 }}>
                                      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--accent)", marginBottom: 10 }}>
                                        Offer + Pricing Confirmed
                                      </div>
                                      <textarea
                                        value={fields.offerPricing}
                                        onChange={(e) => setServiceFieldsMap((m) => ({ ...m, [service]: { ...fields, offerPricing: e.target.value } }))}
                                        rows={3}
                                        style={{ width: "100%", border: "none", outline: "none", resize: "vertical", fontSize: 14, fontWeight: 500, color: L.text, lineHeight: 1.5, fontFamily: "inherit", background: "transparent" }}
                                      />
                                    </div>
                                    <div style={{ background: L.surface, border: `1px solid var(--accent)`, padding: 16 }}>
                                      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--accent)", marginBottom: 10 }}>
                                        Ideal Customer Defined <span style={{ color: L.dimmed, fontWeight: 500, textTransform: "none", letterSpacing: 0 }}>(shared across services)</span>
                                      </div>
                                      <textarea
                                        value={sharedFields.ideal_customer}
                                        onChange={(e) => setSharedFields((s) => ({ ...s, ideal_customer: e.target.value }))}
                                        rows={3}
                                        style={{ width: "100%", border: "none", outline: "none", resize: "vertical", fontSize: 14, fontWeight: 500, color: L.text, lineHeight: 1.5, fontFamily: "inherit", background: "transparent" }}
                                      />
                                    </div>
                                    <div style={{ background: L.surface, border: `1px solid var(--accent)`, padding: 16 }}>
                                      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--accent)", marginBottom: 10 }}>
                                        Budget + Targeting Set <span style={{ color: L.dimmed, fontWeight: 500, textTransform: "none", letterSpacing: 0 }}>(shared across services)</span>
                                      </div>
                                      <textarea
                                        value={sharedFields.budget_targeting}
                                        onChange={(e) => setSharedFields((s) => ({ ...s, budget_targeting: e.target.value }))}
                                        rows={3}
                                        style={{ width: "100%", border: "none", outline: "none", resize: "vertical", fontSize: 14, fontWeight: 500, color: L.text, lineHeight: 1.5, fontFamily: "inherit", background: "transparent" }}
                                      />
                                    </div>
                                  </div>
                                ),
                              },
                              {
                                id: "research",
                                label: "Research",
                                content: (
                                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12 }}>
                                    {SERVICE_FIELD_ORDER.map(({ key, label }) => (
                                      <div key={key} style={{ background: "#fafafa", border: `1px solid ${L.border}`, padding: 12 }}>
                                        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, marginBottom: 6 }}>{label}</div>
                                        <textarea
                                          value={fields[key]}
                                          onChange={(e) => setServiceFieldsMap((m) => ({ ...m, [service]: { ...fields, [key]: e.target.value } }))}
                                          rows={4}
                                          style={{ width: "100%", border: "none", outline: "none", resize: "vertical", fontSize: 12, color: L.muted, lineHeight: 1.5, fontFamily: "inherit", background: "transparent" }}
                                        />
                                      </div>
                                    ))}
                                  </div>
                                ),
                              },
                              {
                                id: "ads",
                                label: "Ads",
                                content: (
                                  <div>
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12, marginBottom: 10 }}>
                                      {ads && (
                                        <button
                                          onClick={() => generateAds(service)}
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
                                          Turn this confirmed strategy into the 3 ads Lucky would actually run for {service}.
                                        </p>
                                        <button
                                          onClick={() => generateAds(service)}
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
                                                    onChange={(e) => updateAd(service, i, key, e.target.value)}
                                                    rows={key === "primaryText" ? 4 : 2}
                                                    style={{ width: "100%", border: `1px solid ${L.border}`, outline: "none", resize: "vertical", padding: 6, fontSize: 12, color: L.text, lineHeight: 1.5, fontFamily: "inherit", background: "transparent" }}
                                                  />
                                                </div>
                                              ))}
                                              <div>
                                                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, marginBottom: 4 }}>Reference links</div>
                                                {ad.referenceLinks.length > 0 && (
                                                  <ul style={{ margin: "0 0 6px", padding: "0 0 0 16px", fontSize: 11 }}>
                                                    {ad.referenceLinks.map((link, li) => (
                                                      <li key={li} style={{ marginBottom: 2 }}>
                                                        <a href={link} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", wordBreak: "break-all" }}>{link}</a>
                                                      </li>
                                                    ))}
                                                  </ul>
                                                )}
                                                <textarea
                                                  value={ad.referenceLinks.join("\n")}
                                                  onChange={(e) => updateAdLinks(service, i, e.target.value)}
                                                  rows={2}
                                                  placeholder="One link per line"
                                                  style={{ width: "100%", border: `1px solid ${L.border}`, outline: "none", resize: "vertical", padding: 6, fontSize: 11, color: L.muted, lineHeight: 1.5, fontFamily: "inherit", background: "transparent" }}
                                                />
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                        <button
                                          onClick={() => saveAds(service)}
                                          disabled={savingAds}
                                          style={{ marginTop: 12, background: "none", border: `1px solid ${L.border}`, padding: "8px 14px", fontSize: 12, fontWeight: 700, color: L.text, cursor: savingAds ? "default" : "pointer" }}
                                        >
                                          {savingAds ? "Saving…" : "Save ad concept changes"}
                                        </button>
                                      </>
                                    )}
                                  </div>
                                ),
                              },
                            ]}
                          />
                        </div>
                      ),
                    };
                  }),
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
