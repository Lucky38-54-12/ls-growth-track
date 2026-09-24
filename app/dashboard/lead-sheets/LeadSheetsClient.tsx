"use client";
import { useState } from "react";
import { LeadSheetSync } from "./page";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b" };

export default function LeadSheetsClient({ initialSyncs }: { initialSyncs: LeadSheetSync[] }) {
  const [syncs, setSyncs] = useState(initialSyncs);
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [spreadsheetUrl, setSpreadsheetUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingEmailId, setEditingEmailId] = useState<string | null>(null);
  const [editEmailValue, setEditEmailValue] = useState("");

  async function addSheet() {
    setAdding(true);
    setAddError("");
    try {
      const res = await fetch("/api/lead-sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientName, clientEmail, spreadsheetUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAddError(data.error || "Couldn't set that up.");
        return;
      }
      setSyncs((s) => [data.sync, ...s]);
      setClientName("");
      setClientEmail("");
      setSpreadsheetUrl("");
    } catch {
      setAddError("Couldn't set that up.");
    } finally {
      setAdding(false);
    }
  }

  async function syncNow(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/lead-sheets/${id}`, { method: "POST" });
      const data = await res.json();
      if (res.ok) setSyncs((s) => s.map((row) => (row.id === id ? data.sync : row)));
    } finally {
      setBusyId(null);
    }
  }

  async function saveEmail(id: string) {
    const res = await fetch(`/api/lead-sheets/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientEmail: editEmailValue }),
    });
    const data = await res.json();
    if (res.ok) setSyncs((s) => s.map((row) => (row.id === id ? data.sync : row)));
    setEditingEmailId(null);
  }

  async function remove(id: string) {
    if (!confirm("Stop syncing this client's leads?")) return;
    setBusyId(id);
    await fetch(`/api/lead-sheets/${id}`, { method: "DELETE" });
    setSyncs((s) => s.filter((row) => row.id !== id));
    setBusyId(null);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 10, padding: "20px 24px" }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: L.text, marginBottom: 4 }}>Add a client</h3>
        <p style={{ fontSize: 12.5, color: L.muted, marginBottom: 14 }}>
          Paste the client's Meta Lead Ads spreadsheet — this creates an "All Leads" call-tracking tab (Called?/Outcome/Notes/Booked Date/Time) without touching the raw ad-form tabs, and syncs new leads into it every 15 minutes. Client email is optional — if set, they get a digest email whenever you mark a lead "Booked" with a date/time filled in.
        </p>
        {addError && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 7, padding: "10px 14px", marginBottom: 12, fontSize: 13, color: "#991b1b" }}>
            {addError}
          </div>
        )}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            placeholder="Client name"
            style={{ flex: "1 1 160px", border: `1px solid ${L.border}`, borderRadius: 7, padding: "8px 12px", fontSize: 13 }}
          />
          <input
            value={clientEmail}
            onChange={(e) => setClientEmail(e.target.value)}
            placeholder="Client email (optional)"
            style={{ flex: "1 1 200px", border: `1px solid ${L.border}`, borderRadius: 7, padding: "8px 12px", fontSize: 13 }}
          />
          <input
            value={spreadsheetUrl}
            onChange={(e) => setSpreadsheetUrl(e.target.value)}
            placeholder="Google Sheets URL"
            style={{ flex: "2 1 300px", border: `1px solid ${L.border}`, borderRadius: 7, padding: "8px 12px", fontSize: 13 }}
          />
          <button
            type="button"
            onClick={addSheet}
            disabled={adding || !clientName.trim() || !spreadsheetUrl.trim()}
            style={{ padding: "9px 16px", background: adding ? "#fca5a5" : "var(--accent)", border: "none", borderRadius: 7, color: "#fff", fontSize: 13, fontWeight: 700, cursor: adding ? "default" : "pointer" }}
          >
            {adding ? "Setting up…" : "Add"}
          </button>
        </div>
      </div>

      <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 10, overflow: "hidden" }}>
        {syncs.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", fontSize: 13, color: L.muted }}>No clients set up yet.</div>
        ) : (
          syncs.map((s) => (
            <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", borderBottom: `1px solid ${L.border}` }}>
              <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: L.text }}>{s.client_name}</div>
                <a
                  href={`https://docs.google.com/spreadsheets/d/${s.spreadsheet_id}/edit`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: 12, color: L.muted }}
                >
                  {s.target_tab} →
                </a>
              </div>
              <div style={{ flex: "1 1 200px", minWidth: 0, fontSize: 12 }}>
                {editingEmailId === s.id ? (
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      value={editEmailValue}
                      onChange={(e) => setEditEmailValue(e.target.value)}
                      placeholder="client@email.com"
                      autoFocus
                      style={{ flex: 1, border: `1px solid ${L.border}`, borderRadius: 6, padding: "5px 8px", fontSize: 12 }}
                    />
                    <button
                      type="button"
                      onClick={() => saveEmail(s.id)}
                      style={{ padding: "5px 10px", background: "var(--accent)", border: "none", borderRadius: 6, color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
                    >
                      Save
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingEmailId(s.id);
                      setEditEmailValue(s.client_email || "");
                    }}
                    style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: s.client_email ? L.text : L.muted, textDecoration: "underline", fontSize: 12 }}
                  >
                    {s.client_email || "Add booking-notify email"}
                  </button>
                )}
              </div>
              <div style={{ flexShrink: 0, fontSize: 12, color: s.last_sync_error ? "#991b1b" : L.muted, minWidth: 160, textAlign: "right" }}>
                {s.last_sync_error
                  ? `Error: ${s.last_sync_error}`
                  : s.last_synced_at
                  ? `Synced ${new Date(s.last_synced_at).toLocaleString()} (+${s.last_sync_added ?? 0})`
                  : "Not synced yet"}
              </div>
              <button
                type="button"
                onClick={() => syncNow(s.id)}
                disabled={busyId === s.id}
                style={{ padding: "6px 12px", background: "#f8fafc", border: `1px solid ${L.border}`, borderRadius: 7, fontSize: 12, fontWeight: 600, color: L.text, cursor: "pointer" }}
              >
                Sync now
              </button>
              <button
                type="button"
                onClick={() => remove(s.id)}
                disabled={busyId === s.id}
                style={{ padding: "6px 12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 7, fontSize: 12, fontWeight: 600, color: "var(--red)", cursor: "pointer" }}
              >
                Remove
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
