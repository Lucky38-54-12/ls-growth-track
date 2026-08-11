"use client";
import { useEffect, useState, useCallback } from "react";
import Topbar from "@/components/Topbar";
import { RefreshCw } from "lucide-react";

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

const DATE_PRESETS = [
  { value: "last_7d", label: "Last 7 days" },
  { value: "last_30d", label: "Last 30 days" },
  { value: "last_90d", label: "Last 90 days" },
  { value: "this_month", label: "This month" },
  { value: "maximum", label: "All time" },
];

const ACCOUNTS = [
  { value: "587704705727466", label: "LS Growth" },
  { value: "1410791492649615", label: "HRC" },
  { value: "206264138206064", label: "Katies Cleaning" },
];

const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function MetaAdsPage() {
  const [account, setAccount] = useState(ACCOUNTS[0].value);
  const [datePreset, setDatePreset] = useState("last_30d");
  const [campaigns, setCampaigns] = useState<CampaignInsight[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  useEffect(() => { load(account, datePreset); }, [account, datePreset, load]);

  const totals = campaigns?.reduce((acc, c) => ({
    spend: acc.spend + c.spend,
    results: acc.results + (c.results || 0),
    clicks: acc.clicks + c.clicks,
    impressions: acc.impressions + c.impressions,
  }), { spend: 0, results: 0, clicks: 0, impressions: 0 });

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <Topbar title="Meta Ads Performance" subtitle="Live campaign data from your ad account" />

      <div style={{ maxWidth: 1100, margin: "28px auto", padding: "0 28px", display: "flex", flexDirection: "column", gap: 20, width: "100%" }}>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 10 }}>
            <select
              value={account}
              onChange={e => setAccount(e.target.value)}
              style={{ padding: "8px 12px", border: `1px solid ${L.border}`, fontSize: 13, fontWeight: 700, color: L.text, fontFamily: "inherit", background: L.surface, outline: "none" }}
            >
              {ACCOUNTS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
            <select
              value={datePreset}
              onChange={e => setDatePreset(e.target.value)}
              style={{ padding: "8px 12px", border: `1px solid ${L.border}`, fontSize: 13, color: L.text, fontFamily: "inherit", background: L.surface, outline: "none" }}
            >
              {DATE_PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <button
            onClick={() => load(account, datePreset)}
            disabled={loading}
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

        {totals && campaigns && campaigns.length > 0 && (
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

        {campaigns && campaigns.length === 0 && !error && (
          <div style={{ padding: 40, textAlign: "center", color: L.dimmed, fontSize: 13 }}>No campaigns found for this ad account / date range.</div>
        )}

        {campaigns && campaigns.length > 0 && (
          <div style={{ background: L.surface, border: `1px solid ${L.border}`, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${L.border}` }}>
                  {["Campaign", "Status", "Spend", "Results", "Cost/Result", "CTR", "CPC"].map(h => (
                    <th key={h} style={{ textAlign: "left", padding: "10px 14px", fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {campaigns.map(c => (
                  <tr key={c.id} style={{ borderBottom: `1px solid ${L.border}` }}>
                    <td style={{ padding: "12px 14px", color: L.text, fontWeight: 600 }}>{c.name}</td>
                    <td style={{ padding: "12px 14px" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: c.status === "ACTIVE" ? "#16a34a" : L.dimmed }}>{c.status}</span>
                    </td>
                    <td style={{ padding: "12px 14px", color: L.text }}>{money(c.spend)}</td>
                    <td style={{ padding: "12px 14px", color: L.text }}>{c.results ?? "—"} {c.resultType && <span style={{ color: L.dimmed, fontSize: 11 }}>({c.resultType.replace(/_/g, " ")})</span>}</td>
                    <td style={{ padding: "12px 14px", color: L.text }}>{c.costPerResult ? money(c.costPerResult) : "—"}</td>
                    <td style={{ padding: "12px 14px", color: L.text }}>{c.ctr.toFixed(2)}%</td>
                    <td style={{ padding: "12px 14px", color: L.text }}>{money(c.cpc)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
