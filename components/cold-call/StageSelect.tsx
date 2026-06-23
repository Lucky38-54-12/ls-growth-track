"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

const STAGES: { key: string; label: string }[] = [
  { key: "called", label: "Called" },
  { key: "emailed", label: "Emailed" },
  { key: "meeting_booked", label: "Meeting Booked" },
  { key: "replied", label: "Replied" },
  { key: "closed", label: "Closed" },
  { key: "not_interested", label: "Not Interested" },
];

export default function StageSelect({ leadId, status }: { leadId: string; status: string }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [value, setValue] = useState(STAGES.some(s => s.key === status) ? status : "called");

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    setValue(next);
    setSaving(true);
    try {
      await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <select
      value={value}
      onChange={handleChange}
      disabled={saving}
      onClick={e => e.stopPropagation()}
      style={{
        fontSize: 11, fontWeight: 700, padding: "3px 8px", border: "1px solid #e2e8f0",
        background: saving ? "#f1f5f9" : "#fff", color: "#0f172a", cursor: saving ? "default" : "pointer",
      }}
    >
      {STAGES.map(s => (
        <option key={s.key} value={s.key}>{s.label}</option>
      ))}
    </select>
  );
}
