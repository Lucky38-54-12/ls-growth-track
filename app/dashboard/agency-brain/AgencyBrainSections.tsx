"use client";
import { useState } from "react";
import { AgencyBrainSection } from "@/lib/agencyBrain";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };

const SECTION_HINTS: Record<string, string> = {
  services_offer: "What LS Growth actually sells, how it's packaged, pricing if relevant.",
  target_trades: "Which trades/industries you go after, and which ones to avoid or handle differently.",
  standing_policies: "Hard rules — things that should never happen automatically, exceptions, edge cases.",
  how_i_operate: "Anything else — how you like to work, recurring judgment calls, things you find yourself explaining over and over.",
};

function SectionCard({ section }: { section: AgencyBrainSection }) {
  const [value, setValue] = useState(section.content);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const dirty = value !== section.content;

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    const res = await fetch("/api/agency-brain", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: section.key, content: value }),
    });
    setSaving(false);
    if (res.ok) {
      section.content = value;
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  }

  return (
    <div style={{ background: L.surface, border: `1px solid ${L.border}`, padding: 24 }}>
      <div style={{ fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, fontWeight: 800, marginBottom: 4 }}>{section.title}</div>
      {SECTION_HINTS[section.key] && (
        <p style={{ fontSize: 12.5, color: L.dimmed, marginBottom: 12 }}>{SECTION_HINTS[section.key]}</p>
      )}
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={6}
        placeholder="Not filled in yet — write in plain language, this gets read directly by the AI before it drafts anything."
        style={{ width: "100%", boxSizing: "border-box" }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || saving}
          className="btn-lift"
          style={{
            padding: "8px 16px", background: !dirty ? "#e2e8f0" : saving ? "#fca5a5" : "var(--red)", color: !dirty ? L.muted : "#fff",
            border: "none", fontSize: 13, fontWeight: 700, cursor: !dirty || saving ? "default" : "pointer",
          }}
        >{saving ? "Saving…" : "Save"}</button>
        {saved && <span style={{ fontSize: 12, color: "#16a34a", fontWeight: 700 }}>Saved</span>}
      </div>
    </div>
  );
}

export default function AgencyBrainSections({ sections }: { sections: AgencyBrainSection[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {sections.map((s) => <SectionCard key={s.key} section={s} />)}
    </div>
  );
}
