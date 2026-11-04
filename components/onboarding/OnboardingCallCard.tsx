"use client";
import { useState } from "react";
import { OnboardingClient } from "@/lib/types";
import { TRADES } from "@/lib/tradeList";
import { creativeAsksFor } from "@/lib/creativeAskExamples";
import { ONBOARDING_CALL_AGENDA as AGENDA } from "@/lib/onboardingCallAgenda";
import OnboardingCallRecapPanel from "./OnboardingCallRecapPanel";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b" };

export default function OnboardingCallCard({ client: initialClient }: { client: OnboardingClient }) {
  const [client, setClient] = useState(initialClient);
  const [trade, setTrade] = useState(client.trade || "");
  const [firstReviewDate, setFirstReviewDate] = useState(client.first_review_date || "");
  const [campaignStartDate, setCampaignStartDate] = useState(client.campaign_start_date || "");
  const [checkinScheduleNote, setCheckinScheduleNote] = useState(client.checkin_schedule_note || "");
  const [creativesReceived, setCreativesReceived] = useState(Boolean(client.creatives_received_at));
  const [notes, setNotes] = useState(client.onboarding_call_notes || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const alreadyDone = Boolean(client.onboarding_call_completed_at);
  const asks = creativeAsksFor(trade);

  async function markDone() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/onboarding/${client.id}/onboarding-call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trade, firstReviewDate, campaignStartDate: creativesReceived ? campaignStartDate : "", checkinScheduleNote, creativesReceived, notes }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Couldn't save the onboarding call.");
        return;
      }
      setClient(data.client);
    } catch {
      setError("Couldn't save the onboarding call.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 10, padding: "20px 24px", marginBottom: 20 }}>
      <h3 style={{ fontSize: 13, fontWeight: 700, color: L.text, marginBottom: 4 }}>Onboarding call</h3>
      <p style={{ fontSize: 12.5, color: L.muted, marginBottom: 14 }}>
        Second call, after the proposal's gone out. The proposal is the contract — this is where the content gets handed over, that same document gets signed, and expectations get set.
      </p>

      <div style={{ background: "#f8fafc", border: `1px solid ${L.border}`, borderRadius: 7, padding: "14px 16px", marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: L.muted, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.04em" }}>Call script</div>
        {AGENDA.map((section, i) => (
          <div key={section.heading} style={{ marginBottom: i < AGENDA.length - 1 ? 12 : 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: L.text, marginBottom: 2 }}>{section.heading}</div>
            <div style={{ fontSize: 12.5, color: L.text, lineHeight: 1.6 }}>{section.body}</div>
          </div>
        ))}
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: L.text, marginBottom: 6 }}>Trade</label>
        <select
          value={trade}
          onChange={(e) => setTrade(e.target.value)}
          disabled={alreadyDone}
          style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${L.border}`, borderRadius: 7, padding: "8px 12px", fontSize: 13 }}
        >
          <option value="">Pick a trade for the creative example list</option>
          {TRADES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 7, padding: "12px 16px", marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#92400e", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.04em" }}>
          Creatives to ask for{trade ? ` — ${trade}` : ""}
        </div>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: "#78350f", lineHeight: 1.6 }}>
          {asks.map((a, i) => <li key={i} style={{ marginBottom: 4 }}>{a}</li>)}
        </ul>
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, cursor: alreadyDone ? "default" : "pointer" }}>
        <input
          type="checkbox"
          checked={creativesReceived}
          disabled={alreadyDone}
          onChange={(e) => {
            setCreativesReceived(e.target.checked);
            if (!e.target.checked) setCampaignStartDate("");
          }}
        />
        <span style={{ fontSize: 13, fontWeight: 600, color: L.text }}>{"Creatives already received — safe to launch"}</span>
      </label>
      <p style={{ fontSize: 11.5, color: L.muted, margin: "0 0 14px 24px" }}>
        {creativesReceived ? "Content's in hand, a start date can be set below." : "No content yet, so no start date gets set below — that's the rule."}
      </p>

      <div style={{ marginBottom: 14 }}>
        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: creativesReceived ? L.text : L.muted, marginBottom: 6 }}>Campaign start date</label>
        <input
          type="date"
          value={campaignStartDate}
          onChange={(e) => setCampaignStartDate(e.target.value)}
          disabled={alreadyDone || !creativesReceived}
          style={{ border: `1px solid ${L.border}`, borderRadius: 7, padding: "8px 12px", fontSize: 13, background: !creativesReceived ? "#f1f5f9" : "#fff" }}
        />
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: L.text, marginBottom: 6 }}>First results review date</label>
        <input
          type="date"
          value={firstReviewDate}
          onChange={(e) => setFirstReviewDate(e.target.value)}
          disabled={alreadyDone}
          style={{ border: `1px solid ${L.border}`, borderRadius: 7, padding: "8px 12px", fontSize: 13 }}
        />
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: L.text, marginBottom: 6 }}>Recurring check-in (every 2 weeks)</label>
        <input
          value={checkinScheduleNote}
          onChange={(e) => setCheckinScheduleNote(e.target.value)}
          disabled={alreadyDone}
          placeholder="e.g. every second Tuesday, 10am"
          style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${L.border}`, borderRadius: 7, padding: "8px 12px", fontSize: 13 }}
        />
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: L.text, marginBottom: 6 }}>Notes from the call</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={alreadyDone}
          rows={3}
          style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${L.border}`, borderRadius: 7, padding: "8px 12px", fontSize: 13, resize: "vertical", fontFamily: "inherit" }}
        />
      </div>

      {error && <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", color: "#991b1b", padding: "8px 12px", fontSize: 13, marginBottom: 10 }}>{error}</div>}

      {!alreadyDone ? (
        <button
          onClick={markDone}
          disabled={busy}
          style={{ padding: "9px 16px", background: busy ? "#fca5a5" : "var(--accent)", border: "none", borderRadius: 7, color: "#fff", fontSize: 13, fontWeight: 700, cursor: busy ? "default" : "pointer" }}
        >
          {busy ? "Saving…" : "Mark onboarding call done & draft recap"}
        </button>
      ) : (
        <div style={{ marginTop: 6, paddingTop: 16, borderTop: `1px solid ${L.border}` }}>
          <OnboardingCallRecapPanel client={client} onUpdated={setClient} />
        </div>
      )}
    </div>
  );
}
