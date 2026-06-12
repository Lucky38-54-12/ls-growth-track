"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SheetSyncButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSync() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/cron/sheet-sync", { method: "POST" });
      const data = await res.json();
      if (data.error) { setError(data.error); setLoading(false); return; }
      const parts = [`Imported ${data.imported} new lead(s).`];
      if (data.updated) parts.push(`${data.updated} updated with new call notes.`);
      if (data.skipped) parts.push(`${data.skipped} skipped.`);
      if (data.errors?.length) parts.push(`Errors: ${data.errors.join("; ")}`);
      router.push(`/dashboard?flash=${encodeURIComponent(parts.join(" "))}`);
      router.refresh();
    } catch {
      setError("Network error");
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={handleSync}
        disabled={loading}
        className="btn-lift"
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          width: "100%", padding: "9px 12px", background: "#f8fafc", borderRadius: 0,
          fontSize: 12.5, fontWeight: 600, color: "#0f172a", textDecoration: "none",
          border: "1px solid #e2e8f0", cursor: loading ? "default" : "pointer",
        }}
      >
        {loading ? "Syncing…" : "Sync from Google Sheet now"} <span style={{ color: "#94a3b8" }}>↻</span>
      </button>
      {error && <div style={{ color: "var(--red)", fontSize: 12, marginTop: 6 }}>{error}</div>}
    </div>
  );
}
