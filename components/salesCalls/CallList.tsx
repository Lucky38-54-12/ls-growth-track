"use client";
import { useState } from "react";
import { SalesCall, CALL_OUTCOME_LABELS, CALL_OUTCOME_COLORS } from "@/lib/types";
import { ChevronDown, ChevronUp } from "lucide-react";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };

export default function CallList({ calls }: { calls: SalesCall[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

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

            {open && (
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
                    <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: L.muted, marginBottom: 3 }}>Work ons</div>
                    <div style={{ fontSize: 13, color: L.text }}>{c.work_ons}</div>
                  </div>
                )}
                <div>
                  <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: L.muted, marginBottom: 3 }}>Full raw summary</div>
                  <div style={{ fontSize: 12.5, color: L.text, whiteSpace: "pre-wrap", background: "#f8fafc", border: `1px solid ${L.border}`, padding: 12, maxHeight: 260, overflowY: "auto" }}>
                    {c.raw_summary}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
