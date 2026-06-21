"use client";
import { useEffect, useState } from "react";
import Topbar from "@/components/Topbar";
import { TrackedSheet } from "@/lib/types";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };

export default function ImportPage() {
  const [sheets, setSheets] = useState<TrackedSheet[]>([]);
  const [loadingSheets, setLoadingSheets] = useState(true);

  const [sheetId, setSheetId] = useState("");
  const [sheetTrade, setSheetTrade] = useState("");
  const [sheetLocation, setSheetLocation] = useState("");
  const [personalize, setPersonalize] = useState(true);
  const [sendFresh, setSendFresh] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");

  async function loadSheets() {
    setLoadingSheets(true);
    const res = await fetch("/api/tracked-sheets");
    const data = await res.json();
    setSheets(data.sheets || []);
    setLoadingSheets(false);
  }

  useEffect(() => { loadSheets(); }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!sheetId.trim()) { setError("Paste a Google Sheet ID first."); return; }
    setAdding(true);
    setError("");
    setFlash("");

    const res = await fetch("/api/tracked-sheets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sheetId: sheetId.trim(),
        tradeDefault: sheetTrade,
        locationDefault: sheetLocation,
        personalize,
        sendFresh,
      }),
    });
    const data = await res.json();
    setAdding(false);

    if (data.error) { setError(data.error); return; }

    setSheetId(""); setSheetTrade(""); setSheetLocation("");
    const imported = data.firstSync?.imported;
    setFlash(imported !== undefined ? `Sheet added. Imported ${imported} lead(s) right away — it'll keep syncing daily.` : "Sheet added. It'll sync daily from now on.");
    loadSheets();
  }

  async function handleRemove(id: string) {
    if (!confirm("Stop auto-syncing this sheet? Leads already imported will stay.")) return;
    await fetch(`/api/tracked-sheets/${id}`, { method: "DELETE" });
    loadSheets();
  }

  async function handleToggleActive(sheet: TrackedSheet) {
    await fetch(`/api/tracked-sheets/${sheet.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !sheet.active }),
    });
    loadSheets();
  }

  return (
    <div>
      <Topbar title="LEAD SHEETS" subtitle="Sheets sync automatically every day — no manual import needed" />

      <div style={{ maxWidth: 760, margin: "32px auto", padding: "0 28px", display: "flex", flexDirection: "column", gap: 20 }}>
        {error && <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", color: "#991b1b", padding: "10px 16px", borderRadius: 0, fontSize: 14 }}>{error}</div>}
        {flash && <div style={{ background: "#dcfce7", border: "1px solid #86efac", color: "#166534", padding: "10px 16px", borderRadius: 0, fontSize: 14 }}>{flash}</div>}

        <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 0, padding: 24 }}>
          <div style={{ fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, fontWeight: 800, marginBottom: 4 }}>Auto-synced sheets</div>
          <p style={{ fontSize: 13, color: L.muted, marginBottom: 16 }}>
            Every sheet below is checked once a day. New rows become leads automatically, and call notes
            (Date Called / Outcome / Call Back / Notes columns) are picked up to personalize follow-ups.
          </p>

          {loadingSheets && <p style={{ fontSize: 13, color: L.dimmed }}>Loading…</p>}
          {!loadingSheets && sheets.length === 0 && <p style={{ fontSize: 13, color: L.dimmed }}>No sheets yet — add one below.</p>}

          {!loadingSheets && sheets.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {sheets.map((s) => (
                <div key={s.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, border: `1px solid ${L.border}`, padding: "12px 14px", opacity: s.active ? 1 : 0.5 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>
                      {[s.trade_default, s.location_default].filter(Boolean).join(" / ") || "Untitled sheet"}
                    </div>
                    <div style={{ fontSize: 12, color: L.dimmed, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis" }}>{s.sheet_id}</div>
                    <div style={{ fontSize: 12, color: L.muted, marginTop: 2 }}>
                      {s.last_result ? s.last_result : "Not synced yet"}
                      {s.last_synced_at ? ` · ${new Date(s.last_synced_at).toLocaleString()}` : ""}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                    <button onClick={() => handleToggleActive(s)} style={{ padding: "6px 12px", background: "transparent", border: `1px solid ${L.border}`, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                      {s.active ? "Pause" : "Resume"}
                    </button>
                    <button onClick={() => handleRemove(s.id)} style={{ padding: "6px 12px", background: "transparent", border: `1px solid ${L.border}`, color: "var(--red)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 0, padding: 24 }}>
          <div style={{ fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, fontWeight: 800, marginBottom: 4 }}>Add a sheet</div>
          <p style={{ fontSize: 13, color: L.muted, marginBottom: 20 }}>
            Paste the Sheet ID from your scraper sheet (the long ID in the sheet&apos;s URL). Trade and location
            are detected automatically from the sheet&apos;s name (e.g. &quot;Wellington Builders&quot;) — the fields
            below are only a fallback if nothing is detected.
          </p>

          <form onSubmit={handleAdd} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label>Google Sheet ID</label>
              <input
                value={sheetId}
                onChange={(e) => setSheetId(e.target.value)}
                placeholder="1uro5nSHDGrrHUuyQ0HqvZAQ1jn6A-SBR2zOuFl7a02o"
                style={{ fontFamily: "monospace", fontSize: 13, marginTop: 5 }}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div>
                <label>Default trade <span style={{ fontWeight: 400, color: L.dimmed }}>(fallback)</span></label>
                <input value={sheetTrade} onChange={(e) => setSheetTrade(e.target.value)} placeholder="e.g. Fencing" />
              </div>
              <div>
                <label>Default location <span style={{ fontWeight: 400, color: L.dimmed }}>(fallback)</span></label>
                <input value={sheetLocation} onChange={(e) => setSheetLocation(e.target.value)} placeholder="e.g. Christchurch NZ" />
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: 0 }}>
                <input type="checkbox" checked={personalize} onChange={(e) => setPersonalize(e.target.checked)} style={{ width: "auto" }} />
                <span style={{ fontWeight: 600, fontSize: 13 }}>AI-personalize follow-ups for leads with call notes</span>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: 0 }}>
                <input type="checkbox" checked={sendFresh} onChange={(e) => setSendFresh(e.target.checked)} style={{ width: "auto" }} />
                <span style={{ fontWeight: 600, fontSize: 13 }}>Send fresh (initial) emails to new leads with no call notes yet</span>
              </label>
            </div>

            <div>
              <button type="submit" disabled={adding} className="btn-lift" style={{
                padding: "11px 24px",
                background: adding ? "#fca5a5" : "var(--red)", color: "#fff",
                border: "none", borderRadius: 0, fontSize: 14, fontWeight: 700, cursor: adding ? "default" : "pointer",
              }}>
                {adding ? "Adding…" : "Add sheet"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
