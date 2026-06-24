"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ActivateCampaignButton({ campaignId, leadCount }: { campaignId: string; leadCount: number }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function activate() {
    if (!confirm(`Activate this campaign and start emailing ${leadCount} lead${leadCount !== 1 ? "s" : ""}?`)) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/activate`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to activate.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <button
        onClick={activate}
        disabled={loading}
        style={{ background: "var(--red)", color: "#fff", border: "none", padding: "7px 14px", fontSize: 12, fontWeight: 700, borderRadius: 6, cursor: "pointer", opacity: loading ? 0.6 : 1 }}
      >
        {loading ? "Activating…" : "Activate Campaign"}
      </button>
      {error && <span style={{ fontSize: 11, color: "var(--red)" }}>{error}</span>}
    </div>
  );
}
