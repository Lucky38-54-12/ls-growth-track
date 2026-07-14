"use client";
import { useState } from "react";
import { SalesCall, CallOutcome, CALL_OUTCOME_LABELS, CALL_OUTCOME_COLORS } from "@/lib/types";
import { ChevronDown, ChevronUp } from "lucide-react";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };

type EditableFields = Pick<SalesCall,
  "call_date" | "prospect_name" | "business_name" | "outcome" | "main_objection" |
  "next_step_booked" | "next_step_detail" | "went_well" | "work_ons">;

function toEditable(c: SalesCall): EditableFields {
  return {
    call_date: c.call_date, prospect_name: c.prospect_name, business_name: c.business_name,
    outcome: c.outcome, main_objection: c.main_objection, next_step_booked: c.next_step_booked,
    next_step_detail: c.next_step_detail, went_well: c.went_well, work_ons: c.work_ons,
  };
}

export default function CallList({ calls, onUpdated }: { calls: SalesCall[]; onUpdated: (call: SalesCall) => void }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditableFields | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function startEdit(c: SalesCall) {
    setEditingId(c.id);
    setDraft(toEditable(c));
    setError("");
  }

  function update<K extends keyof EditableFields>(key: K, value: EditableFields[K]) {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  }

  async function saveEdit(id: string) {
    if (!draft) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/sales-calls/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Couldn't save that edit.");
        return;
      }
      onUpdated(data.call);
      setEditingId(null);
      setDraft(null);
    } catch {
      setError("Couldn't save that edit.");
    } finally {
      setSaving(false);
    }
  }

  if (calls.length === 0) {
    return (
      <div style={{ background: L.surface, border: `1px solid ${L.border}`, padding: 32, textAlign: "center" }}>
        <p style={{ fontSize: 13, color: L.dimmed }}>No calls logged yet. Paste your first one above.</p>
      </div>
    );
  }

  return (
    <div style={{ background: L.surface, border: `1px solid ${L.border}` }}>
      {calls.map((c) => {
        const open = openId === c.id;
        const editing = editingId === c.id;
        const colors = CALL_OUTCOME_COLORS[c.outcome];
        return (
          <div key={c.id} style={{ borderBottom: `1px solid ${L.border}` }}>
            <button
              onClick={() => setOpenId(open ? null : c.id)}
              className="row-hover"
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
            >
              <span style={{ fontSize: 12, color: L.muted, width: 90, flexShrink: 0 }}>{c.call_date}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: L.text, minWidth: 0, flex: 1 }}>
                {c.prospect_name || "Unknown"} <span style={{ fontWeight: 500, color: L.muted }}>· {c.business_name || "Unknown business"}</span>
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: colors.bg, color: colors.text, flexShrink: 0 }}>
                {CALL_OUTCOME_LABELS[c.outcome]}
              </span>
              {c.next_step_booked && (
                <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: "#f1f5f9", color: L.muted, flexShrink: 0, whiteSpace: "nowrap" }}>
                  Next step booked
                </span>
              )}
              {open ? <ChevronUp style={{ width: 14, height: 14, color: L.dimmed, flexShrink: 0 }} /> : <ChevronDown style={{ width: 14, height: 14, color: L.dimmed, flexShrink: 0 }} />}
            </button>

            {open && !editing && (
              <div style={{ padding: "0 18px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
                {c.main_objection && (
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: L.muted, marginBottom: 3 }}>Main objection</div>
                    <div style={{ fontSize: 13, color: L.text }}>{c.main_objection}</div>
                  </div>
                )}
                {c.next_step_booked && c.next_step_detail && (
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: L.muted, marginBottom: 3 }}>Next step</div>
                    <div style={{ fontSize: 13, color: L.text }}>{c.next_step_detail}</div>
                  </div>
                )}
                {c.went_well && (
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: L.muted, marginBottom: 3 }}>What went well</div>
                    <div style={{ fontSize: 13, color: L.text }}>{c.went_well}</div>
                  </div>
                )}
                {c.work_ons && (
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: L.muted, marginBottom: 3 }}>Your take</div>
                    <div style={{ fontSize: 13, color: L.text }}>{c.work_ons}</div>
                  </div>
                )}
                <div>
                  <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: L.muted, marginBottom: 3 }}>Full raw summary</div>
                  <div style={{ fontSize: 12.5, color: L.text, whiteSpace: "pre-wrap", background: "#f8fafc", border: `1px solid ${L.border}`, padding: 12, maxHeight: 260, overflowY: "auto" }}>
                    {c.raw_summary}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => startEdit(c)}
                  style={{ alignSelf: "flex-start", padding: "6px 14px", background: "#fff", color: L.text, border: `1px solid ${L.border}`, fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                >
                  Edit
                </button>
              </div>
            )}

            {open && editing && draft && (
              <div style={{ padding: "0 18px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
                {error && <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", color: "#991b1b", padding: "8px 12px", fontSize: 13 }}>{error}</div>}

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                  <div>
                    <label>Call date</label>
                    <input type="date" value={draft.call_date} onChange={(e) => update("call_date", e.target.value)} />
                  </div>
                  <div>
                    <label>Prospect name</label>
                    <input value={draft.prospect_name} onChange={(e) => update("prospect_name", e.target.value)} />
                  </div>
                  <div>
                    <label>Business</label>
                    <input value={draft.business_name} onChange={(e) => update("business_name", e.target.value)} />
                  </div>
                </div>

                <div>
                  <label>Outcome</label>
                  <select value={draft.outcome} onChange={(e) => update("outcome", e.target.value as CallOutcome)}>
                    {Object.entries(CALL_OUTCOME_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label>Main objection</label>
                  <input value={draft.main_objection} onChange={(e) => update("main_objection", e.target.value)} placeholder="Leave blank if none came up" />
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input type="checkbox" id={`nsb-${c.id}`} checked={draft.next_step_booked} onChange={(e) => update("next_step_booked", e.target.checked)} style={{ width: "auto" }} />
                  <label htmlFor={`nsb-${c.id}`} style={{ marginBottom: 0 }}>A specific next step got booked</label>
                </div>

                {draft.next_step_booked && (
                  <div>
                    <label>What's the next step</label>
                    <input value={draft.next_step_detail} onChange={(e) => update("next_step_detail", e.target.value)} />
                  </div>
                )}

                <div>
                  <label>What went well</label>
                  <textarea rows={2} value={draft.went_well} onChange={(e) => update("went_well", e.target.value)} style={{ display: "block", width: "100%", boxSizing: "border-box", resize: "vertical" }} />
                </div>

                <div>
                  <label>Your take</label>
                  <textarea rows={2} value={draft.work_ons} onChange={(e) => update("work_ons", e.target.value)} style={{ display: "block", width: "100%", boxSizing: "border-box", resize: "vertical" }} />
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => saveEdit(c.id)}
                    disabled={saving}
                    style={{ padding: "8px 16px", background: saving ? "#fca5a5" : "var(--red)", color: "#fff", border: "none", fontSize: 13, fontWeight: 700, cursor: saving ? "default" : "pointer" }}
                  >
                    {saving ? "Saving…" : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEditingId(null); setDraft(null); setError(""); }}
                    style={{ padding: "8px 16px", background: "#fff", color: L.text, border: `1px solid ${L.border}`, fontSize: 13, fontWeight: 700, cursor: "pointer" }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
