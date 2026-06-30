"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Circle, ChevronLeft, Trash2, Save } from "lucide-react";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };

type Step = { key: string; label: string };
type Client = {
  id: string; name: string; company: string;
  email: string | null; phone: string | null;
  completed_steps: string[]; notes: string; created_at: string;
};

export default function OnboardingChecklist({ client, steps }: { client: Client; steps: Step[] }) {
  const router = useRouter();
  const [done, setDone] = useState<string[]>(client.completed_steps || []);
  const [notes, setNotes] = useState(client.notes || "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saved, setSaved] = useState(false);

  async function toggleStep(key: string) {
    const next = done.includes(key) ? done.filter(k => k !== key) : [...done, key];
    setDone(next);
    await fetch(`/api/onboarding/${client.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed_steps: next }),
    });
  }

  async function saveNotes() {
    setSaving(true);
    await fetch(`/api/onboarding/${client.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes }),
    });
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
            <h2 style={{ fontSize: 20, fontWeight: 800, color: L.text }}>{client.company}</h2>
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

        {/* Progress bar */}
        <div style={{ marginTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: L.muted }}>{complete ? "Onboarding complete!" : `${done.length} of ${total} steps done`}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: complete ? "#16a34a" : "var(--red)" }}>{pct}%</span>
          </div>
          <div style={{ height: 8, background: "#f1f5f9", borderRadius: 4, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: complete ? "#16a34a" : "var(--red)", borderRadius: 4, transition: "width 0.3s ease" }} />
          </div>
        </div>
      </div>

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
