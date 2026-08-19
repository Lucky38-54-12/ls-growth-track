"use client";
import { Fragment, useEffect, useState, useCallback } from "react";
import Topbar from "@/components/Topbar";
import { RefreshCw, ChevronDown, ChevronRight, Sparkles, Search, MapPin, ExternalLink, LineChart } from "lucide-react";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };

interface CampaignInsight {
  id: string;
  name: string;
  status: string;
  objective: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  results: number | null;
  costPerResult: number | null;
  resultType: string | null;
}

interface CampaignTestIdea {
  headline: string;
  angle: string;
  why: string;
  sourceUrl: string | null;
}

interface CampaignAnalysis {
  verdict: "winning" | "losing" | "mixed" | "too_early";
  diagnosis: string;
  ideas: CampaignTestIdea[];
}

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

const DATE_PRESETS = [
  { value: "last_7d", label: "Last 7 days" },
  { value: "last_30d", label: "Last 30 days" },
  { value: "last_90d", label: "Last 90 days" },
  { value: "this_month", label: "This month" },
  { value: "maximum", label: "All time" },
];

// Fallback accounts to show while lq_clients accounts are loading, or if
// none of Lucky's clients have a meta_ad_account_id set yet.
const FALLBACK_ACCOUNTS = [
  { value: "1410791492649615", label: "HRC", trade: "electricians, EV charger installation, solar" },
  { value: "206264138206064", label: "Katies Cleaning", trade: "house cleaning services, deep cleaning, move-out cleaning" },
];

interface AdAccount {
  value: string;
  label: string;
  trade: string;
}

interface LqClient {
  id: string;
  name: string;
  trade: string | null;
  meta_ad_account_id: string | null;
}

// loaded starts false so callers can wait for the real per-client list
// before picking a default/URL-requested account — resolving against
// FALLBACK_ACCOUNTS while the real fetch is still in flight let a
// ?account= for a real client silently fall back to the old hardcoded HRC
// account whenever it didn't (yet) match the still-fallback list.
function useAdAccounts(): { accounts: AdAccount[]; loaded: boolean } {
  const [accounts, setAccounts] = useState<AdAccount[]>(FALLBACK_ACCOUNTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/lead-qual/clients")
      .then((r) => r.json())
      .then((data: { clients?: LqClient[] }) => {
        const linked = (data.clients || [])
          .filter((c) => c.meta_ad_account_id)
          .map((c) => ({ value: c.meta_ad_account_id as string, label: c.name, trade: c.trade || "" }));
        if (linked.length > 0) setAccounts(linked);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  return { accounts, loaded };
}

const VERDICT_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  winning: { label: "WINNING", color: "#16a34a", bg: "#f0fdf4" },
  losing: { label: "LOSING", color: "#dc2626", bg: "#fef2f2" },
  mixed: { label: "MIXED", color: "#b45309", bg: "#fffbeb" },
  too_early: { label: "TOO EARLY", color: "#64748b", bg: "#f8fafc" },
};

const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function PerformanceTab() {
  const { accounts, loaded: accountsLoaded } = useAdAccounts();
  const [account, setAccount] = useState<string | null>(null);
  const [datePreset, setDatePreset] = useState("last_30d");
  const [campaigns, setCampaigns] = useState<CampaignInsight[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showAll, setShowAll] = useState(false);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [analysisCache, setAnalysisCache] = useState<Record<string, CampaignAnalysis>>({});
  const [analysisLoading, setAnalysisLoading] = useState<Record<string, boolean>>({});
  const [analysisError, setAnalysisError] = useState<Record<string, string>>({});

  // Pick the account to show once the REAL account list has loaded (not
  // the fallback list still sitting in `accounts` while that fetch is in
  // flight) — resolving early against the fallback list let a ?account=
  // for a real client silently fall back to the old hardcoded HRC account
  // whenever it didn't (yet) match that placeholder list.
  useEffect(() => {
    if (account !== null || !accountsLoaded) return;
    const requested = new URLSearchParams(window.location.search).get("account");
    if (requested && accounts.some(a => a.value === requested)) { setAccount(requested); return; }
    if (accounts.length > 0) setAccount(accounts[0].value);
  }, [accounts, accountsLoaded, account]);

  const activeAccount = accounts.find(a => a.value === account) || accounts[0];

  const load = useCallback(async (acc: string, preset: string) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/meta-ads/insights?account=${acc}&date_preset=${preset}`);
      const data = await res.json();
      if (data.error) { setError(data.error); setCampaigns(null); return; }
      setCampaigns(data.campaigns);
    } catch {
      setError("Failed to load campaign data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!account) return;
    load(account, datePreset);
    setExpandedId(null);
  }, [account, datePreset, load]);

  async function fetchAnalysis(c: CampaignInsight) {
    setAnalysisLoading(prev => ({ ...prev, [c.id]: true }));
    setAnalysisError(prev => { const next = { ...prev }; delete next[c.id]; return next; });
    try {
      const res = await fetch("/api/meta-ads/campaign-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignName: c.name,
          status: c.status,
          trade: activeAccount.trade,
          location: "New Zealand",
          spend: c.spend,
          clicks: c.clicks,
          ctr: c.ctr,
          results: c.results,
          costPerResult: c.costPerResult,
          resultType: c.resultType,
        }),
      });
      const data = await res.json();
      if (data.error) { setAnalysisError(prev => ({ ...prev, [c.id]: data.error })); return; }
      setAnalysisCache(prev => ({ ...prev, [c.id]: data }));
    } catch {
      setAnalysisError(prev => ({ ...prev, [c.id]: "Failed to analyze this campaign." }));
    } finally {
      setAnalysisLoading(prev => ({ ...prev, [c.id]: false }));
    }
  }

  function toggleRow(c: CampaignInsight) {
    if (expandedId === c.id) { setExpandedId(null); return; }
    setExpandedId(c.id);
    if (!analysisCache[c.id] && !analysisLoading[c.id]) fetchAnalysis(c);
  }

  const visibleCampaigns = campaigns?.filter(c => showAll || c.status === "ACTIVE") ?? null;

  const totals = visibleCampaigns?.reduce((acc, c) => ({
    spend: acc.spend + c.spend,
    results: acc.results + (c.results || 0),
    clicks: acc.clicks + c.clicks,
    impressions: acc.impressions + c.impressions,
  }), { spend: 0, results: 0, clicks: 0, impressions: 0 });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 10 }}>
          <select
            value={account || ""}
            onChange={e => setAccount(e.target.value)}
            style={{ padding: "8px 12px", border: `1px solid ${L.border}`, fontSize: 13, fontWeight: 700, color: L.text, fontFamily: "inherit", background: L.surface, outline: "none" }}
          >
            {accounts.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
          <select
            value={datePreset}
            onChange={e => setDatePreset(e.target.value)}
            style={{ padding: "8px 12px", border: `1px solid ${L.border}`, fontSize: 13, color: L.text, fontFamily: "inherit", background: L.surface, outline: "none" }}
          >
            {DATE_PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: L.muted, cursor: "pointer" }}>
            <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} />
            Show paused too
          </label>
        </div>
        <button
          onClick={() => account && load(account, datePreset)}
          disabled={loading || !account}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: `1px solid ${L.border}`, padding: "8px 14px", fontSize: 12, fontWeight: 700, color: L.muted, cursor: loading ? "default" : "pointer" }}
        >
          <RefreshCw style={{ width: 12, height: 12 }} className={loading ? "spin" : ""} />
          Refresh
        </button>
      </div>

      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", padding: 16, fontSize: 13 }}>
          {error}
          {error.toLowerCase().includes("ads_read") && (
            <div style={{ marginTop: 6, color: "#7f1d1d" }}>
              The system user token needs the ads_read permission on this ad account — grant it in Meta Business Settings.
            </div>
          )}
        </div>
      )}

      {loading && !campaigns && (
        <div style={{ padding: 40, textAlign: "center", color: L.dimmed, fontSize: 13 }}>Loading campaign data…</div>
      )}

      {totals && visibleCampaigns && visibleCampaigns.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {[
            { label: "Total Spend", value: money(totals.spend) },
            { label: "Total Results", value: totals.results.toLocaleString() },
            { label: "Blended Cost/Result", value: totals.results ? money(totals.spend / totals.results) : "—" },
            { label: "Total Clicks", value: totals.clicks.toLocaleString() },
          ].map(stat => (
            <div key={stat.label} style={{ background: L.surface, border: `1px solid ${L.border}`, padding: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: L.muted, marginBottom: 6 }}>{stat.label}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: L.text }}>{stat.value}</div>
            </div>
          ))}
        </div>
      )}

      {visibleCampaigns && visibleCampaigns.length === 0 && !error && (
        <div style={{ padding: 40, textAlign: "center", color: L.dimmed, fontSize: 13 }}>
          {showAll ? "No campaigns found for this ad account / date range." : "No live campaigns right now — check “Show paused too” to see everything."}
        </div>
      )}

      {visibleCampaigns && visibleCampaigns.length > 0 && (
        <div style={{ background: L.surface, border: `1px solid ${L.border}`, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${L.border}` }}>
                {["", "Campaign", "Status", "Spend", "Results", "Cost/Result", "CTR", "CPC"].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "10px 14px", fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleCampaigns.map(c => {
                const expanded = expandedId === c.id;
                const analysis = analysisCache[c.id];
                const verdict = analysis ? VERDICT_STYLE[analysis.verdict] : null;
                return (
                  <Fragment key={c.id}>
                    <tr
                      onClick={() => toggleRow(c)}
                      style={{ borderBottom: `1px solid ${L.border}`, cursor: "pointer", background: expanded ? "#fafafa" : "transparent" }}
                    >
                      <td style={{ padding: "12px 8px 12px 14px", width: 20, color: L.dimmed }}>
                        {expanded ? <ChevronDown style={{ width: 14, height: 14 }} /> : <ChevronRight style={{ width: 14, height: 14 }} />}
                      </td>
                      <td style={{ padding: "12px 14px", color: L.text, fontWeight: 600 }}>
                        {c.name}
                        {verdict && (
                          <span style={{ marginLeft: 8, fontSize: 9, fontWeight: 800, letterSpacing: "0.04em", color: verdict.color, background: verdict.bg, padding: "2px 6px", borderRadius: 3 }}>
                            {verdict.label}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "12px 14px" }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: c.status === "ACTIVE" ? "#16a34a" : L.dimmed }}>{c.status}</span>
                      </td>
                      <td style={{ padding: "12px 14px", color: L.text }}>{money(c.spend)}</td>
                      <td style={{ padding: "12px 14px", color: L.text }}>{c.results ?? "—"} {c.resultType && <span style={{ color: L.dimmed, fontSize: 11 }}>({c.resultType.replace(/_/g, " ")})</span>}</td>
                      <td style={{ padding: "12px 14px", color: L.text }}>{c.costPerResult ? money(c.costPerResult) : "—"}</td>
                      <td style={{ padding: "12px 14px", color: L.text }}>{c.ctr.toFixed(2)}%</td>
                      <td style={{ padding: "12px 14px", color: L.text }}>{money(c.cpc)}</td>
                    </tr>
                    {expanded && (
                      <tr style={{ borderBottom: `1px solid ${L.border}` }}>
                        <td colSpan={8} style={{ padding: 0, background: "#fafafa" }}>
                          <div style={{ padding: "18px 24px 22px 44px" }}>
                            {analysisLoading[c.id] && (
                              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: L.dimmed }}>
                                <Sparkles style={{ width: 14, height: 14 }} />
                                Researching {activeAccount.trade} ads and diagnosing this campaign…
                              </div>
                            )}
                            {analysisError[c.id] && (
                              <div style={{ fontSize: 13, color: "#b91c1c" }}>{analysisError[c.id]}</div>
                            )}
                            {analysis && (
                              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                                <p style={{ fontSize: 13.5, color: L.text, lineHeight: 1.6, maxWidth: 760 }}>{analysis.diagnosis}</p>
                                <div>
                                  <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: L.muted, marginBottom: 10 }}>Test Next</div>
                                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
                                    {analysis.ideas.map((idea, i) => (
                                      <div key={i} style={{ background: L.surface, border: `1px solid ${L.border}`, padding: 14 }}>
                                        <div style={{ fontSize: 13, fontWeight: 700, color: L.text, marginBottom: 6, lineHeight: 1.4 }}>&ldquo;{idea.headline}&rdquo;</div>
                                        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>{idea.angle}</div>
                                        <p style={{ fontSize: 12, color: L.muted, lineHeight: 1.5, margin: 0 }}>{idea.why}</p>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ResearchTab() {
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
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
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
              style={{ display: "flex", alignItems: "center", gap: 7, background: "var(--accent)", color: "#fff", border: "none", padding: "10px 20px", fontSize: 13, fontWeight: 700, cursor: loading ? "default" : "pointer", opacity: loading ? 0.7 : 1 }}
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
                  <span style={{ fontSize: 10, fontWeight: 700, color: "var(--accent)", border: "1px solid var(--accent)", padding: "2px 8px", whiteSpace: "nowrap", textTransform: "uppercase", letterSpacing: "0.04em" }}>
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
                      <a href={ad.source_url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", display: "flex", alignItems: "center", gap: 4 }}>
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
  );
}

export default function MetaAdsPage() {
  const [tab, setTab] = useState<"performance" | "research">("performance");

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <Topbar title="Meta Ads" subtitle="Live campaign performance and AI-backed ad research, in one place" />

      <div style={{ maxWidth: 1100, margin: "28px auto", padding: "0 28px", display: "flex", flexDirection: "column", gap: 20, width: "100%" }}>
        <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${L.border}` }}>
          {([
            { key: "performance" as const, label: "Performance", icon: LineChart },
            { key: "research" as const, label: "Research", icon: Sparkles },
          ]).map(t => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "10px 16px", fontSize: 13, fontWeight: 700,
                  background: "none", border: "none", borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
                  color: active ? L.text : L.muted, cursor: "pointer", marginBottom: -1,
                }}
              >
                <Icon style={{ width: 13, height: 13 }} />
                {t.label}
              </button>
            );
          })}
        </div>

        {tab === "performance" ? <PerformanceTab /> : <ResearchTab />}
      </div>
    </div>
  );
}
