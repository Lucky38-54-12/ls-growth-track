"use client";
import { useState } from "react";
import { CallOutcome, CALL_OUTCOME_LABELS, SalesCall, ScriptProposal } from "@/lib/types";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b" };

interface ParsedFields {
  call_date: string;
  prospect_name: string;
  business_name: string;
  outcome: CallOutcome;
  main_objection: string;
  next_step_booked: boolean;
  next_step_detail: string;
  went_well: string;
  work_ons: string;
}

const EMPTY_FIELDS: ParsedFields = {
  call_date: "", prospect_name: "", business_name: "", outcome: "undecided",
  main_objection: "", next_step_booked: false, next_step_detail: "", went_well: "", work_ons: "",
};

export default function CallLogForm({ onSaved }: { onSaved: (call: SalesCall, proposal: ScriptProposal | null) => void }) {
  const [rawSummary, setRawSummary] = useState("");
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [parsed, setParsed] = useState<ParsedFields | null>(null);
  const [fields, setFields] = useState<ParsedFields>(EMPTY_FIELDS);
  const [savedFlash, setSavedFlash] = useState(false);

  function update<K extends keyof ParsedFields>(key: K, value: ParsedFields[K]) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  async function handleParse() {
    if (!rawSummary.trim()) {
      setError("Paste the notetaker summary first.");
      return;
    }
    setParsing(true);
    setError("");
    setSavedFlash(false);
    try {
      const res = await fetch("/api/sales-calls/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw_summary: rawSummary }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Couldn't parse that call. Try again.");
        return;
      }
      setFields(data);
      setParsed(data);
    } catch {
      setError("Couldn't parse that call. Try again.");
    } finally {
      setParsing(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/sales-calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...fields, raw_summary: rawSummary }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Couldn't save this call. Try again.");
        return;
      }
      onSaved(data.call, data.proposal);
      setRawSummary("");
      setParsed(null);
      setFields(EMPTY_FIELDS);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 4000);
    } catch {
      setError("Couldn't save this call. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {error && <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", color: "#991b1b", padding: "10px 16px", marginBottom: 18, fontSize: 14 }}>{error}</div>}
      {savedFlash && <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#15803d", padding: "10px 16px", marginBottom: 18, fontSize: 14 }}>Call logged. Check the Master Script tab if a proposal came out of it.</div>}

      <div style={{ background: L.surface, border: `1px solid ${L.border}`, padding: 24, marginBottom: 20 }}>
        <div style={{ fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, fontWeight: 800, marginBottom: 4 }}>Raw call summary</div>
        <p style={{ fontSize: 13, color: L.muted, marginBottom: 12 }}>
          Paste the notetaker summary word for word. It gets stored in full alongside whatever gets parsed out, it's never truncated.
        </p>
        <textarea
          value={rawSummary}
          onChange={(e) => setRawSummary(e.target.value)}
          rows={10}
          placeholder="Paste the raw notetaker summary here..."
          style={{ display: "block", width: "100%", boxSizing: "border-box", resize: "vertical", marginBottom: 16 }}
        />
        <button
          type="button"
          onClick={handleParse}
          disabled={parsing}
          className="btn-lift"
          style={{ display: "inline-block", padding: "10px 20px", background: parsing ? "#fca5a5" : "var(--red)", color: "#fff", border: "none", fontSize: 13, fontWeight: 700, cursor: parsing ? "default" : "pointer" }}
        >
          {parsing ? "Reading the call…" : "Parse this call"}
        </button>
      </div>

      {parsed && (
        <>
          <div style={{ background: L.surface, border: `1px solid ${L.border}`, padding: 24, marginBottom: 20 }}>
            <div style={{ fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, fontWeight: 800, marginBottom: 4 }}>Confirm the details</div>
            <p style={{ fontSize: 13, color: L.muted, marginBottom: 16 }}>Pulled from the summary. Fix anything that's wrong before saving. "Went well" and "your take" below are a first guess, they're worth rewriting in your own words, this is what actually shapes your next script.</p>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                <div>
                  <label>Call date</label>
                  <input type="date" value={fields.call_date} onChange={(e) => update("call_date", e.target.value)} />
                </div>
                <div>
                  <label>Prospect name</label>
                  <input value={fields.prospect_name} onChange={(e) => update("prospect_name", e.target.value)} />
                </div>
                <div>
                  <label>Business</label>
                  <input value={fields.business_name} onChange={(e) => update("business_name", e.target.value)} />
                </div>
              </div>

              <div>
                <label>Outcome</label>
                <select value={fields.outcome} onChange={(e) => update("outcome", e.target.value as CallOutcome)}>
                  {Object.entries(CALL_OUTCOME_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label>Main objection</label>
                <input value={fields.main_objection} onChange={(e) => update("main_objection", e.target.value)} placeholder="Leave blank if none came up" />
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="checkbox" id="nextStepBooked" checked={fields.next_step_booked} onChange={(e) => update("next_step_booked", e.target.checked)} style={{ width: "auto" }} />
                <label htmlFor="nextStepBooked" style={{ marginBottom: 0 }}>A specific next step got booked</label>
              </div>

              {fields.next_step_booked && (
                <div>
                  <label>What's the next step</label>
                  <input value={fields.next_step_detail} onChange={(e) => update("next_step_detail", e.target.value)} />
                </div>
              )}

              <div>
                <label>What went well</label>
                <textarea rows={2} value={fields.went_well} onChange={(e) => update("went_well", e.target.value)} style={{ display: "block", width: "100%", boxSizing: "border-box", resize: "vertical" }} />
              </div>

              <div>
                <label>Your take: where did you muck up or what would you change</label>
                <p style={{ fontSize: 12, color: L.muted, margin: "0 0 6px" }}>Be honest here. This is what the script review reads first when deciding what to add to the objection cheat sheet or fix.</p>
                <textarea rows={2} value={fields.work_ons} onChange={(e) => update("work_ons", e.target.value)} style={{ display: "block", width: "100%", boxSizing: "border-box", resize: "vertical" }} />
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="btn-lift"
            style={{ padding: "11px 24px", background: saving ? "#fca5a5" : "var(--red)", color: "#fff", border: "none", fontSize: 14, fontWeight: 700, cursor: saving ? "default" : "pointer" }}
          >
            {saving ? "Saving…" : "Confirm & save call"}
          </button>
        </>
      )}
    </div>
  );
}
