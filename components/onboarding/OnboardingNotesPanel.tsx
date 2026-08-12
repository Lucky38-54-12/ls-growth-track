"use client";
import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { OnboardingNote } from "@/lib/types";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b" };

export default function OnboardingNotesPanel() {
  const [notes, setNotes] = useState<OnboardingNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/onboarding-notes")
      .then((res) => res.json())
      .then((data) => { if (Array.isArray(data)) setNotes(data); })
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    if (!draft.trim()) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/onboarding-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: draft }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Couldn't save that note. Try again.");
        return;
      }
      setNotes((prev) => [data, ...prev]);
      setDraft("");
    } catch {
      setError("Couldn't save that note. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await fetch(`/api/onboarding-notes/${id}`, { method: "DELETE" });
      setNotes((prev) => prev.filter((n) => n.id !== id));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div>
      <div style={{ background: L.surface, border: `1px solid ${L.border}`, padding: 24, marginBottom: 20 }}>
        <div style={{ fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, fontWeight: 800, marginBottom: 4 }}>Onboarding call notes</div>
        <p style={{ fontSize: 13, color: L.muted, marginBottom: 12 }}>
          Paste or type whatever you took out of the call — how it went, what they want to do, next steps. No format required.
        </p>
        {error && <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", color: "#991b1b", padding: "10px 16px", marginBottom: 12, fontSize: 13 }}>{error}</div>}
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={8}
          placeholder="e.g. Hrc Electrical - Charl&#10;&#10;Next touch point Sunday 11am. Has a commercial job till end of August..."
          style={{ display: "block", width: "100%", boxSizing: "border-box", resize: "vertical", marginBottom: 12 }}
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !draft.trim()}
          className="btn-lift"
          style={{ padding: "10px 20px", background: saving ? "#fca5a5" : "var(--accent)", color: "#fff", border: "none", fontSize: 13, fontWeight: 700, cursor: saving || !draft.trim() ? "default" : "pointer", opacity: !draft.trim() ? 0.6 : 1 }}
        >
          {saving ? "Saving…" : "Save note"}
        </button>
      </div>

      {loading ? (
        <p style={{ fontSize: 13, color: L.muted }}>Loading…</p>
      ) : notes.length === 0 ? (
        <p style={{ fontSize: 13, color: L.muted }}>No notes yet — add one above.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {notes.map((n) => (
            <div key={n.id} style={{ background: L.surface, border: `1px solid ${L.border}`, padding: "16px 20px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
                <span style={{ fontSize: 11.5, color: L.muted, fontWeight: 600 }}>
                  {new Date(n.created_at).toLocaleString("en-NZ", { timeZone: "Pacific/Auckland", dateStyle: "medium", timeStyle: "short" })}
                </span>
                <button
                  type="button"
                  onClick={() => handleDelete(n.id)}
                  disabled={deletingId === n.id}
                  style={{ background: "none", border: "none", cursor: deletingId === n.id ? "default" : "pointer", color: L.muted, display: "flex", padding: 2, flexShrink: 0 }}
                >
                  <Trash2 style={{ width: 14, height: 14 }} />
                </button>
              </div>
              <p style={{ fontSize: 13.5, color: L.text, lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{n.note}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
