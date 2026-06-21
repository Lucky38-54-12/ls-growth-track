"use client";
import { useState, useRef, useEffect } from "react";
import Topbar from "@/components/Topbar";
import { Play, StopCircle, Download, Search, Hash, Database } from "lucide-react";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };
const SCRAPER_URL = process.env.NEXT_PUBLIC_SCRAPER_URL || "http://localhost:5050";
const LOCAL_SCRAPER = `${SCRAPER_URL}/scraper/run`;

interface LogLine { type: string; msg: string }

export default function ScraperPage() {
  const [query, setQuery]       = useState("");
  const [max, setMax]           = useState("50");
  const [sheetId, setSheetId]   = useState("");

  const [running, setRunning]       = useState(false);
  const [done, setDone]             = useState(false);
  const [exitCode, setExitCode]     = useState<number | null>(null);
  const [log, setLog]               = useState<LogLine[]>([]);
  const [importing, setImporting]   = useState(false);
  const [importResult, setImportResult] = useState("");

  const logRef   = useRef<HTMLDivElement>(null);
  const esRef    = useRef<EventSource | null>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  function appendLog(type: string, msg: string) {
    setLog(l => [...l, { type, msg }]);
  }

  function runScraper(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;

    setLog([]);
    setDone(false);
    setExitCode(null);
    setImportResult("");
    setRunning(true);

    const params = new URLSearchParams({
      query: query.trim(),
      max: String(Number(max) || 50),
    });
    if (sheetId.trim()) params.set("sheet_id", sheetId.trim());

    const es = new EventSource(`${LOCAL_SCRAPER}?${params}`);
    esRef.current = es;

    es.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data);
        if (ev.msg) appendLog(ev.type, ev.msg);
        if (ev.type === "done") {
          setDone(true);
          setExitCode(ev.code ?? 0);
          setRunning(false);
          es.close();
        } else if (ev.type === "error") {
          setRunning(false);
          es.close();
        }
      } catch { /* skip malformed */ }
    };

    es.onerror = () => {
      appendLog("error", "Could not connect to local scraper server (localhost:5050).\nMake sure start_dashboard.bat is running.\n");
      setRunning(false);
      es.close();
    };
  }

  function stopScraper() {
    esRef.current?.close();
    esRef.current = null;
    setRunning(false);
    appendLog("error", "Scraper stopped by user.\n");
  }

  async function importToDashboard() {
    if (!sheetId.trim()) {
      setImportResult("No Sheet ID — enter one above to import scraped leads into the dashboard.");
      return;
    }
    setImporting(true);
    setImportResult("");
    try {
      const res = await fetch("/api/leads/sheet-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheetId: sheetId.trim(),
          tradeDefault: query.trim(),
          locationDefault: "",
          personalize: false,
          sendFresh: false,
        }),
      });
      const data = await res.json();
      if (data.error) { setImportResult(`Error: ${data.error}`); return; }
      const parts = [`Imported ${data.imported} new lead(s).`];
      if (data.detectedTrade || data.detectedLocation) parts.push(`Tagged as ${[data.detectedTrade, data.detectedLocation].filter(Boolean).join(" / ")}.`);
      if (data.updated) parts.push(`${data.updated} updated.`);
      if (data.skipped) parts.push(`${data.skipped} skipped.`);
      if (data.errors?.length) parts.push(`Errors: ${data.errors.join("; ")}`);

      // Register this sheet so future rows added to it keep flowing in
      // automatically via the daily cron, without coming back here.
      const trackRes = await fetch("/api/tracked-sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheetId: sheetId.trim(),
          tradeDefault: data.detectedTrade || query.trim(),
          locationDefault: data.detectedLocation || "",
          personalize: false,
          sendFresh: false,
        }),
      });
      const trackData = await trackRes.json();
      if (!trackData.error) parts.push("This sheet will now auto-sync daily.");

      setImportResult(parts.join(" "));
    } catch {
      setImportResult("Import failed — check server logs.");
    } finally {
      setImporting(false);
    }
  }

  const success = done && exitCode === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <Topbar title="Scraper" subtitle="Google Maps lead scraper — runs locally" />

      <div style={{ maxWidth: 860, margin: "28px auto", padding: "0 28px", display: "flex", flexDirection: "column", gap: 20, width: "100%" }}>

        {/* Config card */}
        <div style={{ background: L.surface, border: `1px solid ${L.border}`, padding: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: L.muted, marginBottom: 18 }}>Scraper Config</div>

          <form onSubmit={runScraper} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: L.muted, letterSpacing: "0.06em", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 5 }}>
                <Search style={{ width: 11, height: 11 }} /> Search Query
              </span>
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="e.g. fencing companies wellington"
                required
                disabled={running}
                style={{ padding: "9px 12px", border: `1px solid ${L.border}`, fontSize: 13, color: L.text, fontFamily: "inherit", background: L.surface, outline: "none" }}
              />
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: L.muted, letterSpacing: "0.06em", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 5 }}>
                <Hash style={{ width: 11, height: 11 }} /> Max Leads
              </span>
              <input
                type="number"
                value={max}
                onChange={e => setMax(e.target.value)}
                min={1}
                max={200}
                disabled={running}
                style={{ padding: "9px 12px", border: `1px solid ${L.border}`, fontSize: 13, color: L.text, fontFamily: "inherit", background: L.surface, outline: "none" }}
              />
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: L.muted, letterSpacing: "0.06em", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 5 }}>
                <Database style={{ width: 11, height: 11 }} /> Google Sheet ID <span style={{ fontSize: 10, fontWeight: 500, color: L.dimmed }}>(optional)</span>
              </span>
              <input
                value={sheetId}
                onChange={e => setSheetId(e.target.value)}
                placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
                disabled={running}
                style={{ padding: "9px 12px", border: `1px solid ${L.border}`, fontSize: 13, color: L.text, fontFamily: "inherit", background: L.surface, outline: "none" }}
              />
            </label>

            <div style={{ gridColumn: "1 / -1", display: "flex", gap: 10, alignItems: "center", marginTop: 4 }}>
              {!running ? (
                <button
                  type="submit"
                  className="btn-lift"
                  style={{ display: "flex", alignItems: "center", gap: 7, background: "var(--red)", color: "#fff", border: "none", padding: "10px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
                >
                  <Play style={{ width: 13, height: 13 }} />
                  Run Scraper
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopScraper}
                  style={{ display: "flex", alignItems: "center", gap: 7, background: "#64748b", color: "#fff", border: "none", padding: "10px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
                >
                  <StopCircle style={{ width: 13, height: 13 }} />
                  Stop
                </button>
              )}
              <span style={{ fontSize: 12, color: L.dimmed }}>
                {process.env.NEXT_PUBLIC_SCRAPER_URL ? "Runs on cloud scraper server." : "Runs via local dashboard — keep start_dashboard.bat open."}
              </span>
            </div>
          </form>
        </div>

        {/* Terminal output */}
        {(log.length > 0 || running) && (
          <div style={{ background: "#0f172a", border: `1px solid #1e293b` }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px", borderBottom: "1px solid #1e293b" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Output{" "}
                {running && <span style={{ color: "#22c55e" }}>● running</span>}
                {done && <span style={{ color: success ? "#22c55e" : "#ef4444" }}>{success ? "● done" : "● failed"}</span>}
              </span>
            </div>
            <div ref={logRef} style={{ height: 320, overflowY: "auto", padding: "12px 16px", fontFamily: "monospace", fontSize: 12, lineHeight: 1.6 }}>
              {log.map((line, i) => (
                <div key={i} style={{ color: line.type === "error" || line.type === "stderr" ? "#f87171" : "#94a3b8", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                  {line.msg}
                </div>
              ))}
              {running && <div style={{ color: "#22c55e" }}>_</div>}
            </div>
          </div>
        )}

        {/* Import section — shows after successful scrape */}
        {done && (
          <div style={{ background: L.surface, border: `1px solid ${success ? "#bbf7d0" : L.border}`, padding: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: success ? "#16a34a" : L.muted, marginBottom: 12 }}>
              {success ? "Scrape Complete" : "Scrape Finished with Errors"}
            </div>
            {success && sheetId && (
              <p style={{ fontSize: 13, color: L.muted, marginBottom: 14 }}>
                Leads pushed to your Google Sheet. Click below to bring them into the dashboard and put this
                sheet on daily auto-sync — see all auto-synced sheets on the{" "}
                <a href="/dashboard/import" style={{ color: "var(--red)", fontWeight: 600 }}>Lead Sheets</a> page.
              </p>
            )}
            {success && !sheetId && (
              <p style={{ fontSize: 13, color: L.muted, marginBottom: 14 }}>
                No Sheet ID was provided — results weren&apos;t saved. Enter a Sheet ID above and run again to persist the data.
              </p>
            )}
            {sheetId && (
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <button
                  onClick={importToDashboard}
                  disabled={importing}
                  className="btn-lift"
                  style={{ display: "flex", alignItems: "center", gap: 7, background: "#0f172a", color: "#fff", border: "none", padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: importing ? "default" : "pointer", opacity: importing ? 0.6 : 1 }}
                >
                  <Download style={{ width: 13, height: 13 }} />
                  {importing ? "Importing…" : "Import to Dashboard"}
                </button>
                {importResult && (
                  <span style={{ fontSize: 13, color: importResult.startsWith("Error") ? "var(--red)" : "#16a34a", fontWeight: 600 }}>
                    {importResult}
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
