"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CheckRepliesButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleCheck() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/campaigns/check-replies", { method: "POST" });
      const data = await res.json();
      if (data.error) { setError(data.error); setLoading(false); return; }
      router.push(`/dashboard/today?flash=${encodeURIComponent(`Found ${data.repliedUpdated} new campaign repl${data.repliedUpdated === 1 ? "y" : "ies"} (scanned ${data.scanned} inbox message(s)).`)}`);
      router.refresh();
    } catch {
      setError("Network error");
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={handleCheck}
        disabled={loading}
        className="pill-hover"
        style={{
          padding: "6px 12px", background: "#fff", border: "1px solid #fecdd3",
          fontSize: 11, fontWeight: 700, color: "#be123c", cursor: loading ? "default" : "pointer",
        }}
      >
        {loading ? "Checking…" : "Check for replies"}
      </button>
      {error && <div style={{ color: "var(--red)", fontSize: 11.5, marginTop: 4 }}>{error}</div>}
    </div>
  );
}
