"use client";
import { useState } from "react";

interface Result {
  sent: number;
  failed: number;
  skipped: number;
  errors: string[];
}

export default function SendButton({ due, leadIds, label }: { due: number; leadIds?: string[]; label?: string }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function handleSend() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(leadIds ? { leadIds } : {}),
      });
      const data = await res.json();
      setResult(data);
    } catch {
      setResult({ sent: 0, failed: 1, skipped: 0, errors: ["Network error"] });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button
          onClick={handleSend}
          disabled={loading || due === 0}
          className="btn-lift"
          style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "11px 20px", background: loading || due === 0 ? "#fca5a5" : "var(--red)",
            color: "#fff", border: "none", borderRadius: 0, cursor: loading || due === 0 ? "default" : "pointer",
            fontSize: 14, fontWeight: 700,
          }}
        >
          {loading ? "Sending…" : (label || `Send due emails (${due})`)}
        </button>
        {result && !loading && (
          <span style={{ fontSize: 13, color: result.failed > 0 ? "var(--red)" : "var(--green)", fontWeight: 600 }}>
            {result.sent > 0 && `${result.sent} sent`}
            {result.failed > 0 && ` · ${result.failed} failed`}
            {result.sent === 0 && result.failed === 0 && "Nothing due"}
          </span>
        )}
      </div>
      {result?.errors && result.errors.length > 0 && (
        <div style={{
          marginTop: 10, background: "#0a0f1a", color: "#fca5a5",
          padding: 12, borderRadius: 0, fontSize: 12, fontFamily: "monospace",
        }}>
          {result.errors.map((e, i) => <div key={i}>{e}</div>)}
        </div>
      )}
    </div>
  );
}
