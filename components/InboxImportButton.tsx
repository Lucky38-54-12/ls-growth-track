"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function InboxImportButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleImport() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/leads/from-inbox", { method: "POST" });
      const data = await res.json();
      if (data.error) { setError(data.error); setLoading(false); return; }
      router.push(`/dashboard?flash=${encodeURIComponent(`Imported ${data.imported} new lead(s), marked ${data.repliedUpdated || 0} existing lead(s) as replied (scanned ${data.scanned}).`)}`);
      router.refresh();
    } catch {
      setError("Network error");
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={handleImport}
        disabled={loading}
        className="pill-hover"
        style={{
          padding: "8px 14px", background: "#fff", border: "1px solid #e2e8f0",
          fontSize: 11.5, fontWeight: 600, color: "#64748b", cursor: loading ? "default" : "pointer",
        }}
      >
        {loading ? "Importing…" : "Import from Inbox (last 2 weeks)"}
      </button>
      {error && <div style={{ color: "var(--red)", fontSize: 12, marginTop: 6 }}>{error}</div>}
    </div>
  );
}
