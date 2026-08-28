"use client";
import { useState } from "react";
import { SalesCall, CALL_OUTCOME_LABELS, CALL_OUTCOME_COLORS } from "@/lib/types";
import RecapAgreementPanel from "./RecapAgreementPanel";

const L = { border: "#e2e8f0", text: "#0f172a", muted: "#64748b" };

// Client-side wrapper so the onboarding detail page (a server component) can
// still show the full call → recap → agreement picture and let Lucky act on
// it (edit/send recap) without needing its own page reload.
export default function ClientCallPanel({ call: initialCall }: { call: SalesCall }) {
  const [call, setCall] = useState(initialCall);
  const colors = CALL_OUTCOME_COLORS[call.outcome];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: L.muted }}>Sales call</span>
        <span style={{ fontSize: 12, color: L.muted }}>{call.call_date}</span>
        <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: colors.bg, color: colors.text }}>
          {CALL_OUTCOME_LABELS[call.outcome]}
        </span>
      </div>
      <RecapAgreementPanel call={call} onUpdated={setCall} />
    </div>
  );
}
