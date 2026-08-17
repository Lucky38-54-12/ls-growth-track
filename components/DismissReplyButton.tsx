"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DismissReplyButton({ id }: { id: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDismiss(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setLoading(true);
    try {
      await fetch(`/api/leads/${id}/dismiss-attention`, { method: "PATCH" });
      router.refresh();
    } catch {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleDismiss}
      disabled={loading}
      className="pill-hover"
      style={{
        padding: "5px 10px", background: "#fff", border: "1px solid #e2e8f0",
        fontSize: 11, fontWeight: 700, color: "#64748b", cursor: loading ? "default" : "pointer", flexShrink: 0,
      }}
    >
      {loading ? "…" : "Dismiss"}
    </button>
  );
}
