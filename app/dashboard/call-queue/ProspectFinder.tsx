"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2 } from "lucide-react";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b" };

interface LogLine { type: string; msg: string }

export default function ProspectFinder() {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<LogLine[]>([]);
  const esRef = useRef<EventSource | null>(null);

  function appendLog(type: string, msg: string) {
    setLog((l) => [...l, { type, msg }]);
  }

  function findProspects() {
    setLog([]);
    setRunning(true);

    const es = new EventSource("/api/prospect?max=20");
    esRef.current = es;

    es.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data);
        if (ev.msg) appendLog(ev.type, ev.msg);
        if (ev.type === "done") {
          setRunning(false);
          es.close();
          router.refresh();
        } else if (ev.type === "error") {
          setRunning(false);
          es.close();
        }
      } catch {
        // skip malformed event
      }
    };

    es.onerror = () => {
      appendLog("error", "Could not connect to local scraper server. Make sure start_dashboard.bat is running.\n");
      setRunning(false);
      es.close();
    };
  }

  return (
    <div style={{ background: L.surface, border: `1px solid ${L.border}`, padding: 24, marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: L.muted, marginBottom: 4 }}>
            Auto-Prospector
          </div>
          <p style={{ fontSize: 13, color: L.muted, maxWidth: 480 }}>
            Picks the next under-covered NZ region, scrapes fencing companies there, writes cold-call prep notes for each new one, and drops them in the queue below.
          </p>
        </div>
        <button
          onClick={findProspects}
          disabled={running}
          className="btn-lift"
          style={{
            display: "flex", alignItems: "center", gap: 7, background: running ? "#fca5a5" : "var(--red)", color: "#fff",
            border: "none", padding: "10px 20px", fontSize: 13, fontWeight: 700, cursor: running ? "default" : "pointer", whiteSpace: "nowrap",
          }}
        >
          {running ? <Loader2 style={{ width: 13, height: 13 }} /> : <Search style={{ width: 13, height: 13 }} />}
          {running ? "Finding…" : "Find Prospects"}
        </button>
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
