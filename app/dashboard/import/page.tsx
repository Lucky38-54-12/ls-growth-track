"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };

export default function ImportPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [trade, setTrade] = useState("");
  const [location, setLocation] = useState("");
  const [text, setText] = useState("");
  const [sendNow, setSendNow] = useState(true);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const content = await file.text();
    setText(content);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) { setError("Paste some leads or upload a file first."); return; }
    setLoading(true);
    setError("");

    const rows = text.split("\n").map((l) => l.trim()).filter(Boolean);
    const res = await fetch("/api/leads/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows, tradeDefault: trade, locationDefault: location, sendNow }),
    });
    const data = await res.json();
    setLoading(false);

    if (data.error) { setError(data.error); return; }

    const parts = [`Imported ${data.imported} lead(s).`];
    if (data.skipped) parts.push(`${data.skipped} skipped.`);
    if (data.sent) parts.push(`${data.sent} first email(s) sent.`);
    router.push(`/dashboard?flash=${encodeURIComponent(parts.join(" "))}`);
  }

  return (
    <div>
      <div style={{ background: "#fff", borderBottom: `1px solid ${L.border}`, padding: "0 28px", height: 68, display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 34, height: 34, borderRadius: 8, background: "var(--red)", flexShrink: 0 }} />
        <div>
          <h1 style={{ fontSize: 17, fontWeight: 900, letterSpacing: "0.04em" }}>IMPORT LEADS</h1>
          <p style={{ color: L.muted, fontSize: 12, marginTop: 1 }}>Bulk import from CSV or scraper output</p>
        </div>
      </div>

      <div style={{ maxWidth: 760, margin: "32px auto", padding: "0 28px", display: "flex", flexDirection: "column", gap: 20 }}>
        {error && <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", color: "#991b1b", padding: "10px 16px", borderRadius: 8, fontSize: 14 }}>{error}</div>}

        <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 10, padding: 24 }}>
          <div style={{ fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, fontWeight: 800, marginBottom: 4 }}>Bulk Import</div>
          <p style={{ fontSize: 13, color: L.muted, marginBottom: 20 }}>Paste leads or upload a CSV. Accepts scraper output or simple format.</p>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div>
                <label>Default trade <span style={{ fontWeight: 400, color: L.dimmed }}>(all rows)</span></label>
                <input value={trade} onChange={(e) => setTrade(e.target.value)} placeholder="e.g. Plumbing" />
              </div>
              <div>
                <label>Default location <span style={{ fontWeight: 400, color: L.dimmed }}>(all rows)</span></label>
                <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Auckland NZ" />
              </div>
            </div>

            <div>
              <label>Paste leads <span style={{ fontWeight: 400, color: L.dimmed }}>(one per line)</span></label>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={12}
                placeholder={"Company Name, email@domain.com\nOr paste scraper CSV directly (Business Name, Phone, Email, Website, ...)"}
                style={{ resize: "vertical", fontFamily: "monospace", fontSize: 13, marginTop: 5 }}
              />
            </div>

            <div>
              <label>Or upload a CSV file</label>
              <input type="file" accept=".csv" onChange={handleFileChange} style={{ marginTop: 5 }} />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap", marginTop: 4 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: 0 }}>
                <input type="checkbox" checked={sendNow} onChange={(e) => setSendNow(e.target.checked)} style={{ width: "auto" }} />
                <span style={{ fontWeight: 600, fontSize: 13 }}>Send first email immediately</span>
              </label>
              <button type="submit" disabled={loading} style={{
                marginLeft: "auto", padding: "11px 24px",
                background: loading ? "#fca5a5" : "var(--red)", color: "#fff",
                border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: loading ? "default" : "pointer",
              }}>
                {loading ? "Importing…" : "Import leads"}
              </button>
            </div>
          </form>
        </div>

        <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 10, padding: 24 }}>
          <div style={{ fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, fontWeight: 800, marginBottom: 14 }}>Format Guide</div>
          <table style={{ fontSize: 13, borderCollapse: "collapse", width: "100%" }}>
            {[
              ["Minimal", "Acme Plumbing, acme@gmail.com"],
              ["With contact", "Acme Plumbing, acme@gmail.com, Mike"],
              ["Full", "Acme Plumbing, acme@gmail.com, Mike, Plumbing, Auckland NZ"],
              ["Scraper CSV", "Business Name, Phone, Email, Website, … (auto-detected)"],
            ].map(([fmt, ex]) => (
              <tr key={fmt}>
                <td style={{ padding: "6px 16px 6px 0", fontWeight: 700, whiteSpace: "nowrap" }}>{fmt}</td>
                <td style={{ padding: "6px 0", color: L.muted, fontFamily: "monospace", fontSize: 12 }}>{ex}</td>
              </tr>
            ))}
          </table>
        </div>
      </div>
    </div>
  );
}
