"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { UserSearch, Square } from "lucide-react";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b" };

export default function BackfillNamesButton({ totalRemaining }: { totalRemaining: number }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [found, setFound] = useState(0);
  const [total, setTotal] = useState(totalRemaining);
  const [error, setError] = useState("");
  const stopRef = useRef(false);

  async function run() {
    setRunning(true);
    setError("");
    stopRef.current = false;
    let afterId = "";
    let totalDone = 0;
    let totalFound = 0;
    try {
      while (!stopRef.current) {
        const res = await fetch("/api/leads/backfill-names", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ afterId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed.");
        totalDone += data.processed;
        totalFound += data.namesFound;
        setDone(totalDone);
        setFound(totalFound);
        setTotal(data.total);
        afterId = data.afterId;
        if (data.done || data.processed === 0) break;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setRunning(false);
      router.refresh();
    }
  }

  if (total === 0 && !running && done === 0) return null;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <button
        onClick={running ? () => { stopRef.current = true; } : run}
        className="btn-lift"
        style={{
          display: "flex", alignItems: "center", gap: 6, background: L.surface, color: L.text,
          border: `1px solid ${L.border}`, padding: "8px 14px", fontSize: 11.5, fontWeight: 700, cursor: "pointer",
        }}
      >
        {running ? <Square style={{ width: 12, height: 12 }} /> : <UserSearch style={{ width: 13, height: 13 }} />}
        {running ? "Stop" : `Find Real Names (${total} leads)`}
      </button>
      {(running || done > 0) && (
        <span style={{ fontSize: 11.5, color: L.muted }}>
          {running ? "Researching… " : "Done — "}{done} checked, {found} name{found !== 1 ? "s" : ""} found
        </span>
      )}
      {error && <span style={{ fontSize: 11.5, color: "var(--red)" }}>{error}</span>}
    </div>
  );
}
