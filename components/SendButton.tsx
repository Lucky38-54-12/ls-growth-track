"use client";
import { useState } from "react";

interface Result {
  sent: number;
  failed: number;
  skipped: number;
  errors: string[];
}

interface SendResponse extends Result {
  ranOutOfTime?: boolean;
}

// Vercel's function timeout means one /api/send call only gets through a
// batch of leads in ~45s (see app/api/send/route.ts's TIME_BUDGET_MS) before
// it has to stop and report ranOutOfTime — previously that meant clicking
// the button again and again by hand to clear a 50-lead batch. Looping here
// instead: keep re-calling with the same leadIds (safe — nextStepFor skips
// anything no longer due, so a lead already sent this run is just a no-op
// on the next round) until a round comes back with ranOutOfTime false,
// which means everything in this list that could be processed, was.
// ROUND_CAP is a safety backstop against looping forever on some future bug
// that always reports ranOutOfTime true with no progress.
const ROUND_CAP = 30;

export default function SendButton({ due, leadIds, label }: { due: number; leadIds?: string[]; label?: string }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [round, setRound] = useState(0);

  async function handleSend() {
    setLoading(true);
    setResult(null);
    setRound(0);

    const totals: Result = { sent: 0, failed: 0, skipped: 0, errors: [] };
    try {
      for (let i = 0; i < ROUND_CAP; i++) {
        setRound(i + 1);
        const res = await fetch("/api/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(leadIds ? { leadIds } : {}),
        });
        const data: SendResponse = await res.json();
        totals.sent += data.sent || 0;
        totals.failed += data.failed || 0;
        totals.skipped += data.skipped || 0;
        totals.errors.push(...(data.errors || []));
        setResult({ ...totals });
        if (!data.ranOutOfTime) break;
      }
    } catch {
      totals.failed += 1;
      totals.errors.push("Network error");
      setResult({ ...totals });
    } finally {
      setLoading(false);
      setRound(0);
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
            padding: "11px 20px", background: loading || due === 0 ? "#fca5a5" : "var(--accent)",
            color: "#fff", border: "none", borderRadius: 0, cursor: loading || due === 0 ? "default" : "pointer",
            fontSize: 14, fontWeight: 700,
          }}
        >
          {loading ? `Sending… (round ${round})` : (label || `Send due emails (${due})`)}
        </button>
        {loading && result && (
          <span style={{ fontSize: 13, color: "var(--muted)" }}>
            {result.sent} sent so far{result.failed > 0 ? ` · ${result.failed} failed` : ""}
          </span>
        )}
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
