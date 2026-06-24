"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2 } from "lucide-react";
import { CoverageGap } from "@/lib/prospecting";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b" };

interface LogLine { type: string; msg: string }

export default function SuggestionsPanel({ suggestions }: { suggestions: CoverageGap[] }) {
  const router = useRouter();
  const [running, setRunning] = useState<string | null>(null);
  const [log, setLog] = useState<LogLine[]>([]);
  const esRef = useRef<EventSource | null>(null);

  function appendLog(type: string, msg: string) {
    setLog((l) => [...l, { type, msg }]);
  }

  function runSuggestion(gap: CoverageGap) {
    const key = `${gap.trade}|${gap.city}`;
    setLog([]);
    setRunning(key);

    const es = new EventSource(`/api/prospect?trade=${encodeURIComponent(gap.trade)}&region=${encodeURIComponent(gap.city)}&max=20`);
    esRef.current = es;

    es.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data);
        if (ev.msg) appendLog(ev.type, ev.msg);
        if (ev.type === "done") {
          setRunning(null);
          es.close();
          router.refresh();
        } else if (ev.type === "error") {
          setRunning(null);
          es.close();
        }
      } catch {
        // skip malformed event
      }
    };

    es.onerror = () => {
      appendLog("error", "Could not connect to local scraper server. Make sure start_dashboard.bat is running.\n");
      setRunning(null);
      es.close();
    };
  }

  return (
    <div style={{ background: L.surface, border: `1px solid ${L.border}`, padding: 24, marginBottom: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: L.muted, marginBottom: 4 }}>
        Auto-Prospector
      </div>
      <p style={{ fontSize: 13, color: L.muted, maxWidth: 560, marginBottom: 16 }}>
        These are the trade + major-city combos with the least coverage in your Email Outreach Drive folder. Pick one to scrape companies, create a sheet for it, write cold-call prep notes, and drop them in the queue.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {suggestions.map((gap) => {
          const key = `${gap.trade}|${gap.city}`;
          const isRunning = running === key;
          const disabled = running !== null && !isRunning;
          return (
            <div
              key={key}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                padding: "12px 16px", border: `1px solid ${L.border}`, background: "#f8fafc",
              }}
            >
              <span style={{ fontSize: 13.5, fontWeight: 700, color: L.text }}>
                {gap.trade} <span style={{ color: L.muted, fontWeight: 500 }}>—</span> {gap.city}
              </span>
              <button
                onClick={() => runSuggestion(gap)}
                disabled={disabled || isRunning}
                className="btn-lift"
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  background: isRunning ? "#fca5a5" : disabled ? "#e2e8f0" : "var(--red)",
                  color: disabled && !isRunning ? L.muted : "#fff",
                  border: "none", padding: "8px 16px", fontSize: 12.5, fontWeight: 700,
                  cursor: disabled || isRunning ? "default" : "pointer", whiteSpace: "nowrap",
                }}
              >
                {isRunning ? <Loader2 style={{ width: 12, height: 12 }} /> : <Search style={{ width: 12, height: 12 }} />}
                {isRunning ? "Running…" : "Run"}
              </button>
            </div>
          );
        })}
      </div>

      {(log.length > 0 || running) && (
        <div style={{ background: "#0f172a", border: "1px solid #1e293b", marginTop: 16 }}>
          <div style={{ height: 220, overflowY: "auto", padding: "12px 16px", fontFamily: "monospace", fontSize: 12, lineHeight: 1.6 }}>
            {log.map((line, i) => (
              <div key={i} style={{ color: line.type === "error" || line.type === "stderr" ? "#f87171" : "#94a3b8", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                {line.msg}
              </div>
            ))}
            {running && <div style={{ color: "#22c55e" }}>_</div>}
          </div>
        </div>
      )}
    </div>
  );
}
