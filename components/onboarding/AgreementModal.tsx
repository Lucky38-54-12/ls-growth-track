"use client";

import { useState } from "react";
import { X, ExternalLink } from "lucide-react";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b" };

interface Client {
  name: string;
  trade: string | null;
  email: string | null;
}

const inputStyle: React.CSSProperties = {
  display: "block", width: "100%", boxSizing: "border-box", padding: "8px 10px",
  border: `1px solid ${L.border}`, fontSize: 13, marginBottom: 12,
};
const labelStyle: React.CSSProperties = { fontSize: 11.5, fontWeight: 700, color: L.muted, marginBottom: 4, display: "block" };

export default function AgreementModal({ client, onClose }: { client: Client; onClose: () => void }) {
  const [contactName, setContactName] = useState("");
  const [focusService, setFocusService] = useState("");
  const [monthlyFee, setMonthlyFee] = useState("$2,000");
  const [dailyAdSpend, setDailyAdSpend] = useState("$15");
  const [quoteThreshold, setQuoteThreshold] = useState("10");
  const [trialWeeks, setTrialWeeks] = useState("3");
  const [startDate, setStartDate] = useState("");
  const [generating, setGenerating] = useState(false);
  const [docUrl, setDocUrl] = useState("");
  const [error, setError] = useState("");

  async function handleGenerate() {
    setGenerating(true);
    setError("");
    setDocUrl("");
    try {
      const res = await fetch("/api/onboarding/generate-agreement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName: contactName,
          company: client.name,
          email: client.email || "",
          trade: client.trade || "",
          focusService,
          monthlyFee,
          dailyAdSpend,
          quoteThreshold,
          trialWeeks,
          startDate,
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
        style={{ background: L.surface, border: `1px solid ${L.border}`, width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto", borderRadius: 14, boxShadow: "0 20px 48px rgba(15,23,42,0.22)" }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${L.border}` }}>
          <p style={{ fontSize: 13, fontWeight: 800, color: L.text }}>Make agreement — {client.name}</p>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
            <X style={{ width: 16, height: 16, color: L.muted }} />
          </button>
        </div>

        <div style={{ padding: 16 }}>
          <label style={labelStyle}>Client contact name</label>
          <input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="e.g. Charl Van der Mescht" style={inputStyle} />

          <label style={labelStyle}>Focus service (leave blank to use their trade)</label>
          <input value={focusService} onChange={(e) => setFocusService(e.target.value)} placeholder="e.g. solar installations" style={inputStyle} />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Monthly fee</label>
              <input value={monthlyFee} onChange={(e) => setMonthlyFee(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Daily ad spend</label>
              <input value={dailyAdSpend} onChange={(e) => setDailyAdSpend(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Quote threshold</label>
              <input value={quoteThreshold} onChange={(e) => setQuoteThreshold(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Trial weeks</label>
              <input value={trialWeeks} onChange={(e) => setTrialWeeks(e.target.value)} style={inputStyle} />
            </div>
          </div>

          <label style={labelStyle}>Campaign start date</label>
          <input value={startDate} onChange={(e) => setStartDate(e.target.value)} placeholder="e.g. 27/07/26" style={inputStyle} />

          {error && <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", color: "#991b1b", padding: "10px 14px", marginBottom: 12, fontSize: 13 }}>{error}</div>}

          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating || !contactName.trim()}
              className="btn-lift"
              style={{ padding: "10px 20px", background: generating ? "#fca5a5" : "var(--red)", color: "#fff", border: "none", fontSize: 13, fontWeight: 700, cursor: generating || !contactName.trim() ? "default" : "pointer", opacity: !contactName.trim() ? 0.6 : 1 }}
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
