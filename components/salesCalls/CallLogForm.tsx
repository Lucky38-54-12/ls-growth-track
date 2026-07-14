"use client";
import { useState } from "react";
import { CALL_OUTCOME_LABELS, SalesCall, ScriptProposal } from "@/lib/types";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b" };

export default function CallLogForm({ onSaved }: { onSaved: (call: SalesCall, proposal: ScriptProposal | null, backupUrl: string | null) => void }) {
  const [rawSummary, setRawSummary] = useState("");
  const [yourTake, setYourTake] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [lastSaved, setLastSaved] = useState<SalesCall | null>(null);

  async function handleSave() {
    if (!rawSummary.trim()) {
      setError("Paste the notes first.");
      return;
    }
    setSaving(true);
    setError("");
    setLastSaved(null);
    try {
      const res = await fetch("/api/sales-calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw_summary: rawSummary, your_take: yourTake }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Couldn't log this call. Try again.");
        return;
      }
      onSaved(data.call, data.proposal, data.backupUrl || null);
      setLastSaved(data.call);
      setRawSummary("");
      setYourTake("");
    } catch {
      setError("Couldn't log this call. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {error && <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", color: "#991b1b", padding: "10px 16px", marginBottom: 18, fontSize: 14 }}>{error}</div>}

      {lastSaved && (
        <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#15803d", padding: "14px 16px", marginBottom: 18, fontSize: 13 }}>
          Logged: {lastSaved.prospect_name || "unnamed"}{lastSaved.business_name ? ` (${lastSaved.business_name})` : ""}, {CALL_OUTCOME_LABELS[lastSaved.outcome]}
          {lastSaved.next_step_booked && lastSaved.next_step_detail ? ` — next step: ${lastSaved.next_step_detail}` : ""}.
          {" "}Wrong on something? Fix it in Call History. Check the Master Script tab if a proposal came out of it.
        </div>
      )}

      <div style={{ background: L.surface, border: `1px solid ${L.border}`, padding: 24, marginBottom: 20 }}>
        <div style={{ fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, fontWeight: 800, marginBottom: 4 }}>Raw call notes</div>
        <p style={{ fontSize: 13, color: L.muted, marginBottom: 12 }}>
          Paste the notetaker summary word for word. Date, prospect, business, outcome, objection, next step and what went well all get pulled from this automatically, stored in full, never truncated.
        </p>
        <textarea
          value={rawSummary}
          onChange={(e) => setRawSummary(e.target.value)}
          rows={10}
          placeholder="Paste the raw notetaker summary here..."
          style={{ display: "block", width: "100%", boxSizing: "border-box", resize: "vertical" }}
        />
      </div>

      <div style={{ background: L.surface, border: `1px solid ${L.border}`, padding: 24, marginBottom: 20 }}>
        <div style={{ fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, fontWeight: 800, marginBottom: 4 }}>Your take</div>
        <p style={{ fontSize: 13, color: L.muted, marginBottom: 12 }}>
          Your own honest read: where you mucked up, what you'd change next time. This is the one thing worth typing yourself, it's what the script review reads first.
        </p>
        <textarea
          value={yourTake}
          onChange={(e) => setYourTake(e.target.value)}
          rows={4}
          placeholder="e.g. Let the call end without pinning down a specific follow up day..."
          style={{ display: "block", width: "100%", boxSizing: "border-box", resize: "vertical" }}
        />
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="btn-lift"
        style={{ padding: "11px 24px", background: saving ? "#fca5a5" : "var(--red)", color: "#fff", border: "none", fontSize: 14, fontWeight: 700, cursor: saving ? "default" : "pointer" }}
      >
        {saving ? "Logging call…" : "Log this call"}
      </button>
    </div>
  );
}
