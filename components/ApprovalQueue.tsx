"use client";
import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { ChatDraft } from "@/lib/chatDrafts";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };

const KIND_LABEL: Record<string, string> = {
  email: "Draft email",
  note: "Draft note",
  lead_update: "Update lead",
  calendar_booking: "Book meeting",
  reschedule_booking: "Reschedule meeting",
  sheet_update: "Update sheet",
};

const APPROVE_LABEL: Record<string, string> = {
  email: "Approve & send",
  calendar_booking: "Approve & book",
  reschedule_booking: "Approve & reschedule",
  sheet_update: "Approve & update",
};

export default function ApprovalQueue({ initialDrafts, emptyMessage }: { initialDrafts: ChatDraft[]; emptyMessage?: string }) {
  const [drafts, setDrafts] = useState(initialDrafts);
  const [busyDraftId, setBusyDraftId] = useState<string | null>(null);
  const [error, setError] = useState("");

  // initialDrafts is a fresh server-fetched prop after a router.refresh()
  // (e.g. right after the Brain chat creates a new draft) — without this,
  // this component's own useState would keep showing whatever it had on
  // first mount and silently miss anything created afterward.
  useEffect(() => setDrafts(initialDrafts), [initialDrafts]);

  async function decide(draftId: string, decision: "approved" | "rejected") {
    // Optional — a reason on reject is the single richest signal for the
    // Brain to actually learn from, so it's worth a light prompt rather than
    // a silent click. Blank/cancelled just skips it, same as before.
    const reason = decision === "rejected" ? window.prompt("Why? (optional — helps it learn for next time)") || undefined : undefined;

    setBusyDraftId(draftId);
    setError("");
    try {
      const res = await fetch(`/api/brain/drafts/${draftId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, reason }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Couldn't apply that decision.");
        return;
      }
      setDrafts((d) => d.filter((x) => x.id !== draftId));
    } catch {
      setError("Couldn't apply that decision.");
    } finally {
      setBusyDraftId(null);
    }
  }

  if (drafts.length === 0) {
    return emptyMessage ? <p style={{ fontSize: 13, color: L.dimmed }}>{emptyMessage}</p> : null;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {error && <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", color: "#991b1b", padding: "10px 16px", fontSize: 14 }}>{error}</div>}
      {drafts.map((d) => (
        <div key={d.id} style={{ background: "#fffbeb", border: "1px solid #fde68a", padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "#92400e" }}>
              {KIND_LABEL[d.kind] || "Draft"}{d.lead ? ` · ${d.lead.company}` : ""}
            </div>
          </div>
          <p style={{ fontSize: 13.5, fontWeight: 700, color: L.text, marginBottom: 6 }}>{d.title}</p>
          <div style={{ fontSize: 13, color: L.text, whiteSpace: "pre-wrap", lineHeight: 1.6, background: "#fff", border: `1px solid ${L.border}`, padding: 12, marginBottom: 14 }}>
            {d.content.replace(/<[^>]+>/g, "\n").replace(/\n{2,}/g, "\n").trim()}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={() => decide(d.id, "approved")}
              disabled={busyDraftId === d.id}
              className="btn-lift"
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", background: "#16a34a", color: "#fff", border: "none", fontSize: 12.5, fontWeight: 700, cursor: busyDraftId === d.id ? "default" : "pointer" }}
            >
              <Check style={{ width: 13, height: 13 }} /> {APPROVE_LABEL[d.kind] || "Approve"}
            </button>
            <button
              onClick={() => decide(d.id, "rejected")}
              disabled={busyDraftId === d.id}
              className="btn-lift"
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", background: "#fff", color: L.muted, border: `1px solid ${L.border}`, fontSize: 12.5, fontWeight: 700, cursor: busyDraftId === d.id ? "default" : "pointer" }}
            >
              <X style={{ width: 13, height: 13 }} /> Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
