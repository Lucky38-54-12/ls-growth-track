"use client";
import { useState } from "react";
import { ReplyCategory, REPLY_CATEGORY_LABELS, REPLY_CATEGORY_COLORS } from "@/lib/types";

const ALL_CATEGORIES: ReplyCategory[] = ["interested", "bad_timing", "not_interested", "has_someone"];

export default function ReplyTagPicker({
  leadId,
  current,
}: {
  leadId: string;
  current: ReplyCategory | null;
}) {
  const [selected, setSelected] = useState<ReplyCategory | null>(current);
  const [saving, setSaving] = useState(false);

  async function pick(cat: ReplyCategory) {
    if (saving) return;
    setSaving(true);
    const prev = selected;
    setSelected(cat);
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reply_category: cat }),
      });
      if (!res.ok) setSelected(prev);
    } catch {
      setSelected(prev);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
      {ALL_CATEGORIES.map((cat) => {
        const active = selected === cat;
        const c = REPLY_CATEGORY_COLORS[cat];
        return (
          <button
            key={cat}
            onClick={() => pick(cat)}
            disabled={saving}
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              padding: "2px 8px",
              border: `1px solid ${active ? "transparent" : "#e2e8f0"}`,
              background: active ? c.bg : "#f8fafc",
              color: active ? c.text : "#94a3b8",
              cursor: saving ? "default" : "pointer",
              opacity: saving ? 0.6 : 1,
              fontFamily: "inherit",
            }}
          >
            {REPLY_CATEGORY_LABELS[cat]}
          </button>
        );
      })}
    </div>
  );
}
