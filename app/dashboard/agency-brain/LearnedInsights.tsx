"use client";
import { useState } from "react";
import { X } from "lucide-react";
import { BrainLearning } from "@/lib/brainLearnings";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };

export default function LearnedInsights({ initialLearnings }: { initialLearnings: BrainLearning[] }) {
  const [learnings, setLearnings] = useState(initialLearnings);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function remove(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/brain-learnings/${id}`, { method: "DELETE" });
      if (res.ok) setLearnings((l) => l.filter((x) => x.id !== id));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div style={{ background: L.surface, border: `1px solid ${L.border}`, padding: 24 }}>
      <div style={{ fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, fontWeight: 800, marginBottom: 4 }}>Learned from experience</div>
      <p style={{ fontSize: 12.5, color: L.dimmed, marginBottom: 12 }}>
        Picked up automatically from what you approve and reject in the Brain — not something you write yourself. Delete anything that's wrong.
      </p>
      {learnings.length === 0 ? (
        <p style={{ fontSize: 13, color: L.dimmed }}>Nothing learned yet — this fills in as you approve or reject things the Brain proposes.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {learnings.map((l) => (
            <div key={l.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", background: "#f8fafc", border: `1px solid ${L.border}` }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: L.text }}>{l.insight}</div>
                <div style={{ fontSize: 11, color: L.dimmed, marginTop: 3 }}>
                  {new Date(l.created_at).toLocaleDateString("en-NZ")}{l.source_kind ? ` · from a ${l.source_kind.replace(/_/g, " ")} decision` : ""}
                </div>
              </div>
              <button
                onClick={() => remove(l.id)}
                disabled={busyId === l.id}
                className="pill-hover"
                style={{ background: "none", border: "none", cursor: busyId === l.id ? "default" : "pointer", color: L.dimmed, padding: 4, flexShrink: 0 }}
                title="Delete this"
              >
                <X style={{ width: 14, height: 14 }} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
