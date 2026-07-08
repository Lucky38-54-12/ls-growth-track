"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Circle, ChevronLeft, Trash2, Save, Phone } from "lucide-react";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };

type Step = { key: string; label: string };
type Client = {
  id: string; name: string; company: string;
  email: string | null; phone: string | null;
  completed_steps: string[]; notes: string; created_at: string;
  decision_status: "ready" | "thinking";
  follow_up_at: string | null;
  services: string[] | null;
  ads_manager_added: boolean;
  ad_budget: string | null;
  creatives_needed: string | null;
};

export default function OnboardingChecklist({ client, steps }: { client: Client; steps: Step[] }) {
  const router = useRouter();
  const [decisionStatus, setDecisionStatus] = useState(client.decision_status);
  const [done, setDone] = useState<string[]>(client.completed_steps || []);
  const [notes, setNotes] = useState(client.notes || "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [callNotes, setCallNotes] = useState("");
  const [sendingCall, setSendingCall] = useState(false);
  const [callSent, setCallSent] = useState<string | null>(null);
  const [callError, setCallError] = useState("");

  const [followUpAt, setFollowUpAt] = useState(client.follow_up_at || "");
  const [savingFollowUp, setSavingFollowUp] = useState(false);
  const [switchingStatus, setSwitchingStatus] = useState(false);

  const initialServices = client.services && client.services.length > 0 ? client.services : ["", "", ""];
  const [services, setServices] = useState<string[]>([initialServices[0] || "", initialServices[1] || "", initialServices[2] || ""]);
  const [adsManagerAdded, setAdsManagerAdded] = useState(client.ads_manager_added || false);
  const [adBudget, setAdBudget] = useState(client.ad_budget || "");
  const [creativesNeeded, setCreativesNeeded] = useState(client.creatives_needed || "");
  const [savingIntake, setSavingIntake] = useState(false);
  const [savedIntake, setSavedIntake] = useState(false);

  async function patch(body: Record<string, unknown>) {
    return fetch(`/api/onboarding/${client.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async function toggleStep(key: string) {
    const next = done.includes(key) ? done.filter(k => k !== key) : [...done, key];
    setDone(next);
    await patch({ completed_steps: next });
  }

  async function setStatus(next: "ready" | "thinking") {
    setSwitchingStatus(true);
    setDecisionStatus(next);
    await patch({ decision_status: next });
    setSwitchingStatus(false);
    router.refresh();
  }

  async function saveFollowUp() {
    setSavingFollowUp(true);
    await patch({ follow_up_at: followUpAt || null });
    setSavingFollowUp(false);
  }

  async function saveIntake() {
    setSavingIntake(true);
    await patch({
      services: services.filter(s => s.trim()),
      ads_manager_added: adsManagerAdded,
      ad_budget: adBudget || null,
      creatives_needed: creativesNeeded || null,
    });
    setSavingIntake(false);
    setSavedIntake(true);
    setTimeout(() => setSavedIntake(false), 2000);
  }

  async function logCall() {
    if (!callNotes.trim()) return;
    setSendingCall(true);
    setCallError("");
    setCallSent(null);
    const res = await fetch(`/api/onboarding/${client.id}/call-followup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callNotes }),
    });
    const data = await res.json();
    setSendingCall(false);
    if (data.error) { setCallError(data.error); return; }
    setCallSent(data.to);
    setCallNotes("");
  }

  async function saveNotes() {
    setSaving(true);
    await patch({ notes });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function deleteClient() {
    if (!confirm(`Remove ${client.company} from onboarding?`)) return;
    setDeleting(true);
    await fetch(`/api/onboarding/${client.id}`, { method: "DELETE" });
    router.push("/dashboard/onboarding");
    router.refresh();
  }

  const total = steps.length;
  const pct = Math.round((done.length / total) * 100);
  const complete = done.length === total;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Back */}
      <Link href="/dashboard/onboarding" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: L.muted, textDecoration: "none", fontWeight: 600 }}>
        <ChevronLeft style={{ width: 14, height: 14 }} /> All clients
      </Link>

      {/* Header card */}
      <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 10, padding: "20px 24px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: L.text }}>{client.company}</h2>
              <span style={{
                fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 999,
                background: decisionStatus === "ready" ? "#dcfce7" : "#fef9c3",
                color: decisionStatus === "ready" ? "#15803d" : "#854d0e",
              }}>
                {decisionStatus === "ready" ? "Ready to onboard" : "Still deciding"}
              </span>
            </div>
            <p style={{ fontSize: 13, color: L.muted, marginTop: 2 }}>{client.name}{client.email && ` · ${client.email}`}{client.phone && ` · ${client.phone}`}</p>
          </div>
          <button
            onClick={deleteClient}
            disabled={deleting}
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 7, color: "var(--red)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          >
            <Trash2 style={{ width: 12, height: 12 }} /> Remove
          </button>
        </div>

        {decisionStatus === "ready" && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: L.muted }}>{complete ? "Onboarding complete!" : `${done.length} of ${total} steps done`}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: complete ? "#16a34a" : "var(--red)" }}>{pct}%</span>
            </div>
            <div style={{ height: 8, background: "#f1f5f9", borderRadius: 4, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${pct}%`, background: complete ? "#16a34a" : "var(--red)", borderRadius: 4, transition: "width 0.3s ease" }} />
            </div>
          </div>
        )}
      </div>

      {decisionStatus === "thinking" ? (
        <>
          {/* Still deciding panel */}
          <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 10, padding: "20px 24px" }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: L.text, marginBottom: 10 }}>Follow up</h3>
            <p style={{ fontSize: 12.5, color: L.muted, marginBottom: 12 }}>
              Set a date to check back in with them.
            </p>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input
                type="date"
                value={followUpAt}
                onChange={e => setFollowUpAt(e.target.value)}
                style={{ border: `1px solid ${L.border}`, borderRadius: 7, padding: "8px 12px", fontSize: 13 }}
              />
              <button
                onClick={saveFollowUp}
                disabled={savingFollowUp}
                style={{ padding: "8px 14px", background: "#f8fafc", border: `1px solid ${L.border}`, borderRadius: 7, fontSize: 12, fontWeight: 600, color: L.muted, cursor: "pointer" }}
              >
                {savingFollowUp ? "Saving…" : "Save"}
              </button>
            </div>
            <button
              onClick={() => setStatus("ready")}
              disabled={switchingStatus}
              style={{ marginTop: 16, padding: "9px 16px", background: "var(--red)", border: "none", borderRadius: 7, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
            >
              {switchingStatus ? "Updating…" : "Mark as ready to move forward"}
            </button>
          </div>
        </>
      ) : (
        <>
          {/* Checklist */}
          <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 10, overflow: "hidden" }}>
            {steps.map((step, i) => {
              const isDone = done.includes(step.key);
              return (
                <button
                  key={step.key}
                  onClick={() => toggleStep(step.key)}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 14, padding: "14px 20px",
                    background: isDone ? "#f0fdf4" : "transparent",
                    border: "none",
                    borderBottom: i < steps.length - 1 ? `1px solid ${L.border}` : "none",
                    cursor: "pointer", textAlign: "left",
                  }}
                >
                  {isDone
                    ? <CheckCircle2 style={{ width: 20, height: 20, color: "#16a34a", flexShrink: 0 }} />
                    : <Circle style={{ width: 20, height: 20, color: L.dimmed, flexShrink: 0 }} />
                  }
                  <span style={{ fontSize: 13.5, fontWeight: isDone ? 600 : 500, color: isDone ? "#15803d" : L.text, textDecoration: isDone ? "line-through" : "none" }}>
                    {step.label}
                  </span>
                  <span style={{ marginLeft: "auto", fontSize: 11, color: L.dimmed, flexShrink: 0, fontWeight: 500 }}>Step {i + 1}</span>
                </button>
              );
            })}
          </div>

          {/* Intake */}
          <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 10, padding: "20px 24px" }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: L.text, marginBottom: 4 }}>Intake</h3>
            <p style={{ fontSize: 12.5, color: L.muted, marginBottom: 16 }}>What we need from them to get campaigns live.</p>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: L.text, marginBottom: 6 }}>3 services to start with</label>
              {[0, 1, 2].map(i => (
                <input
                  key={i}
                  value={services[i]}
                  onChange={e => setServices(s => s.map((v, idx) => idx === i ? e.target.value : v))}
                  placeholder={`Service ${i + 1}`}
                  style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${L.border}`, borderRadius: 7, padding: "8px 12px", fontSize: 13, marginBottom: 8 }}
                />
              ))}
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, cursor: "pointer" }}>
              <input type="checkbox" checked={adsManagerAdded} onChange={e => setAdsManagerAdded(e.target.checked)} />
              <span style={{ fontSize: 13, fontWeight: 600, color: L.text }}>Added us to their Ads Manager</span>
            </label>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: L.text, marginBottom: 6 }}>Ad budget</label>
              <input
                value={adBudget}
                onChange={e => setAdBudget(e.target.value)}
                placeholder="e.g. $1,500 NZD/mo"
                style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${L.border}`, borderRadius: 7, padding: "8px 12px", fontSize: 13 }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: L.text, marginBottom: 6 }}>Creatives needed</label>
              <textarea
                value={creativesNeeded}
                onChange={e => setCreativesNeeded(e.target.value)}
                placeholder="e.g. 3rd POV clean videos, before/after photos"
                rows={3}
                style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${L.border}`, borderRadius: 7, padding: "8px 12px", fontSize: 13, resize: "vertical", fontFamily: "inherit" }}
              />
            </div>

            <button
              onClick={saveIntake}
              disabled={savingIntake}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: savedIntake ? "#f0fdf4" : "#f8fafc", border: `1px solid ${savedIntake ? "#bbf7d0" : L.border}`, borderRadius: 7, fontSize: 12, fontWeight: 600, color: savedIntake ? "#16a34a" : L.muted, cursor: "pointer" }}
            >
              <Save style={{ width: 13, height: 13 }} />
              {savedIntake ? "Saved!" : savingIntake ? "Saving…" : "Save intake"}
            </button>

            <button
              onClick={() => setStatus("thinking")}
              disabled={switchingStatus}
              style={{ display: "block", marginTop: 14, fontSize: 12, color: L.muted, background: "none", border: "none", cursor: "pointer", textDecoration: "underline", padding: 0 }}
            >
              Actually, they're still deciding
            </button>
          </div>
        </>
      )}

      {/* Log a call */}
      <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 10, padding: "20px 24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <Phone style={{ width: 14, height: 14, color: L.muted }} />
          <h3 style={{ fontSize: 13, fontWeight: 700, color: L.text }}>Log a call</h3>
        </div>
        <p style={{ fontSize: 12.5, color: L.muted, marginBottom: 12 }}>
          Paste your Read.ai notes — a follow-up email will be written and sent to {client.email || "the client"} automatically.
        </p>
        {callSent && (
          <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 7, padding: "10px 14px", marginBottom: 12, fontSize: 13, color: "#15803d", fontWeight: 600 }}>
            Follow-up sent to {callSent}
          </div>
        )}
        {callError && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 7, padding: "10px 14px", marginBottom: 12, fontSize: 13, color: "#991b1b" }}>
            {callError}
          </div>
        )}
        <textarea
          value={callNotes}
          onChange={e => setCallNotes(e.target.value)}
          placeholder="Paste Read.ai summary here…"
          rows={5}
          style={{ width: "100%", border: `1px solid ${L.border}`, borderRadius: 7, padding: "10px 12px", fontSize: 13, color: L.text, resize: "vertical", outline: "none", fontFamily: "inherit", boxSizing: "border-box", marginBottom: 10 }}
        />
        <button
          onClick={logCall}
          disabled={sendingCall || !callNotes.trim()}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 18px", background: sendingCall ? "#fca5a5" : "var(--red)", border: "none", borderRadius: 7, color: "#fff", fontSize: 13, fontWeight: 700, cursor: sendingCall || !callNotes.trim() ? "default" : "pointer", opacity: !callNotes.trim() ? 0.5 : 1 }}
        >
          {sendingCall ? "Sending…" : "Generate & send follow-up"}
        </button>
      </div>

      {/* Notes */}
      <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 10, padding: "20px 24px" }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: L.text, marginBottom: 10 }}>Notes</h3>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Any notes about this client's onboarding…"
          rows={4}
          style={{ width: "100%", border: `1px solid ${L.border}`, borderRadius: 7, padding: "10px 12px", fontSize: 13, color: L.text, resize: "vertical", outline: "none", fontFamily: "inherit", boxSizing: "border-box" }}
        />
        <button
          onClick={saveNotes}
          disabled={saving}
          style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: saved ? "#f0fdf4" : "#f8fafc", border: `1px solid ${saved ? "#bbf7d0" : L.border}`, borderRadius: 7, fontSize: 12, fontWeight: 600, color: saved ? "#16a34a" : L.muted, cursor: "pointer" }}
        >
          <Save style={{ width: 13, height: 13 }} />
          {saved ? "Saved!" : saving ? "Saving…" : "Save notes"}
        </button>
      </div>

    </div>
  );
}
