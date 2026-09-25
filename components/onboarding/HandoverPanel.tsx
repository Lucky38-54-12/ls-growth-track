"use client";
import { useState } from "react";
import { CheckCircle2, Circle } from "lucide-react";
import { OnboardingClient } from "@/lib/types";
import { HANDOVER_STEPS } from "@/lib/handoverSteps";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b" };

// Fires once a client is actually signed & closed (a separate real-world
// moment from "deal agreed on the call") — see
// app/api/onboarding/[id]/handover/route.ts for what this triggers. Sharing
// with marketing is a deliberately separate, later step (the
// "Hand off to marketing" button below) since Lucky runs the campaign
// himself first — see app/api/onboarding/[id]/handover/notify-marketing.
export default function HandoverPanel({ client: initialClient }: { client: OnboardingClient }) {
  const [client, setClient] = useState(initialClient);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notifyBusy, setNotifyBusy] = useState(false);
  const [notifyError, setNotifyError] = useState("");
  const [checklistDone, setChecklistDone] = useState<string[]>(initialClient.handover_checklist_steps || []);

  async function toggleChecklistStep(key: string) {
    const next = checklistDone.includes(key) ? checklistDone.filter((k) => k !== key) : [...checklistDone, key];
    setChecklistDone(next);
    await fetch(`/api/onboarding/${client.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handover_checklist_steps: next }),
    });
  }

  async function trigger() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/onboarding/${client.id}/handover`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Couldn't run the handover.");
        return;
      }
      setClient(data.client);
      if (data.errors?.length) setError(`Partial failure: ${data.errors.join(", ")} didn't complete — you can try again.`);
    } catch {
      setError("Couldn't run the handover.");
    } finally {
      setBusy(false);
    }
  }

  async function notifyMarketing() {
    setNotifyBusy(true);
    setNotifyError("");
    try {
      const res = await fetch(`/api/onboarding/${client.id}/handover/notify-marketing`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setNotifyError(data.error || "Couldn't notify marketing.");
        return;
      }
      setClient(data.client);
    } catch {
      setNotifyError("Couldn't notify marketing.");
    } finally {
      setNotifyBusy(false);
    }
  }

  const done = client.handover_status === "sent";
  const marketingNotified = !!client.marketing_notified_at;

  return (
    <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 10, padding: "20px 24px", marginBottom: 20 }}>
      <h3 style={{ fontSize: 13, fontWeight: 700, color: L.text, marginBottom: 4 }}>Client signed & closed</h3>
      <p style={{ fontSize: 12.5, color: L.muted, marginBottom: 14 }}>
        Creates the client's Drive folder (photos/videos subfolder, handover doc, leads sheet) — not shared with marketing yet.
      </p>

      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 7, padding: "10px 14px", marginBottom: 12, fontSize: 13, color: "#991b1b" }}>
          {error}
        </div>
      )}

      {done && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
          {client.client_folder_url && (
            <a href={client.client_folder_url} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, fontWeight: 700 }}>
              Client folder →
            </a>
          )}
          {client.handover_doc_url && (
            <a href={client.handover_doc_url} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, fontWeight: 600, marginLeft: 12 }}>
              Handover doc →
            </a>
          )}
          {client.client_drive_folder_url && (
            <a href={client.client_drive_folder_url} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, fontWeight: 600, marginLeft: 12 }}>
              Photos & videos subfolder (not shared with client yet) →
            </a>
          )}
          {client.leads_sheet_url && (
            <a href={client.leads_sheet_url} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, fontWeight: 600, marginLeft: 12 }}>
              Leads sheet →
            </a>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={trigger}
        disabled={busy}
        style={{ padding: "9px 16px", background: busy ? "#fca5a5" : "var(--accent)", border: "none", borderRadius: 7, color: "#fff", fontSize: 13, fontWeight: 700, cursor: busy ? "default" : "pointer" }}
      >
        {busy ? "Running…" : done ? "Re-run handover" : "Mark signed & closed"}
      </button>

      {done && (
        <div style={{ marginTop: 14 }}>
          {notifyError && (
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 7, padding: "10px 14px", marginBottom: 10, fontSize: 13, color: "#991b1b" }}>
              {notifyError}
            </div>
          )}
          <button
            type="button"
            onClick={notifyMarketing}
            disabled={notifyBusy}
            style={{
              padding: "9px 16px",
              background: marketingNotified ? "#f0fdf4" : "#fff",
              border: `1px solid ${marketingNotified ? "#bbf7d0" : L.border}`,
              borderRadius: 7,
              color: marketingNotified ? "#16a34a" : L.text,
              fontSize: 13,
              fontWeight: 700,
              cursor: notifyBusy ? "default" : "pointer",
            }}
          >
            {notifyBusy ? "Sharing…" : marketingNotified ? `Marketing notified (${new Date(client.marketing_notified_at!).toLocaleDateString()}) — re-notify` : "Hand off to marketing (shares folder + emails Harris)"}
          </button>
        </div>
      )}

      {done && (
        <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${L.border}` }}>
          <h4 style={{ fontSize: 12, fontWeight: 700, color: L.text, marginBottom: 10 }}>What happens next</h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {HANDOVER_STEPS.map((step) => {
              const isDone = checklistDone.includes(step.key);
              return (
                <button
                  key={step.key}
                  type="button"
                  onClick={() => toggleChecklistStep(step.key)}
                  style={{ display: "flex", alignItems: "center", gap: 10, background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}
                >
                  {isDone
                    ? <CheckCircle2 style={{ width: 17, height: 17, color: "#16a34a", flexShrink: 0 }} />
                    : <Circle style={{ width: 17, height: 17, color: "#94a3b8", flexShrink: 0 }} />}
                  <span style={{ fontSize: 12.5, fontWeight: isDone ? 600 : 500, color: isDone ? "#15803d" : L.text, textDecoration: isDone ? "line-through" : "none" }}>
                    {step.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
