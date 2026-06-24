"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lead, EngagementSummary } from "@/lib/types";
import { SegmentSection } from "./LeadTable";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };

interface Section { key: string; label: string; leads: Lead[] }

export default function ContactsBatchPanel({
  sections, engagement,
}: { sections: Section[]; engagement: Record<string, EngagementSummary> }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function toggleLead(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll(ids: string[], select: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (select ? next.add(id) : next.delete(id)));
      return next;
    });
  }

  async function startCampaign() {
    if (!name.trim()) { setError("Name it first."); return; }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, leadIds: Array.from(selected) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create campaign.");
      setModalOpen(false);
      setSelected(new Set());
      setName("");
      router.push(`/dashboard/campaigns/${data.campaign.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {sections.length === 0 ? (
        <div style={{ background: L.surface, border: `1px solid ${L.border}`, padding: 40, textAlign: "center", color: L.dimmed, fontSize: 13 }}>
          No contacts match this view.
        </div>
      ) : (
        sections.map((s) => (
          <SegmentSection
            key={s.key}
            label={s.label}
            leads={s.leads}
            engagement={engagement}
            selectable
            selectedIds={selected}
            onToggleLead={toggleLead}
            onToggleAll={toggleAll}
          />
        ))
      )}

      {selected.size > 0 && (
        <div style={{
          position: "sticky", bottom: 16, marginTop: 8, alignSelf: "center",
          display: "flex", alignItems: "center", gap: 12, padding: "10px 16px",
          background: "#0f172a", borderRadius: 10, boxShadow: "0 8px 24px rgba(15,23,42,0.25)", zIndex: 10,
        }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: "#fff" }}>{selected.size} selected</span>
          <button
            onClick={() => setModalOpen(true)}
            style={{ background: "var(--red)", color: "#fff", border: "none", padding: "7px 14px", fontSize: 12, fontWeight: 700, borderRadius: 6, cursor: "pointer" }}
          >
            Start Campaign
          </button>
          <button
            onClick={() => setSelected(new Set())}
            style={{ background: "transparent", color: "rgba(255,255,255,0.6)", border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          >
            Clear
          </button>
        </div>
      )}

      {modalOpen && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50,
        }} onClick={() => !submitting && setModalOpen(false)}>
          <div style={{ background: "#fff", borderRadius: 10, padding: 24, width: 380 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: L.text, marginBottom: 4 }}>Name this campaign</h3>
            <p style={{ fontSize: 11.5, color: L.muted, marginBottom: 12 }}>
              {selected.size} lead{selected.size !== 1 ? "s" : ""} will be staged as a draft — nothing sends until you activate it.
            </p>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Wellington Sparkies Outreach"
              style={{ width: "100%", padding: "8px 10px", fontSize: 13, border: `1px solid ${L.border}`, borderRadius: 6, marginBottom: 10 }}
            />
            {error && <p style={{ fontSize: 11.5, color: "var(--red)", marginBottom: 10 }}>{error}</p>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => setModalOpen(false)}
                disabled={submitting}
                style={{ background: "transparent", color: L.muted, border: `1px solid ${L.border}`, padding: "7px 14px", fontSize: 12, fontWeight: 600, borderRadius: 6, cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={startCampaign}
                disabled={submitting}
                style={{ background: "var(--red)", color: "#fff", border: "none", padding: "7px 14px", fontSize: 12, fontWeight: 700, borderRadius: 6, cursor: "pointer", opacity: submitting ? 0.6 : 1 }}
              >
                {submitting ? "Creating…" : "Create draft"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
