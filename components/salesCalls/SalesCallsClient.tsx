"use client";
import { useState } from "react";
import { SalesCall, ScriptVersion, ScriptProposal, PatternTracker } from "@/lib/types";
import { CallPatterns } from "@/lib/salesCallsStats";
import CallList from "./CallList";
import MasterScriptPanel from "./MasterScriptPanel";
import PatternsPanel from "./PatternsPanel";
import { Download, Cloud } from "lucide-react";

const L = { border: "#e2e8f0", text: "#0f172a", muted: "#64748b" };

// "Log a Call" and "Call Prep" moved into the Brain chat (paste a
// transcript or ask it to prep you for a call — see app/api/brain/chat)
// which runs the exact same lib/logSalesCall.ts and lib/prepSalesCall.ts
// logic these tabs used to call directly. This page is now just the record
// of what that produced: history, the evolving script, and the patterns
// it's tracking.
const TABS = [
  { key: "history", label: "Call History" },
  { key: "script", label: "Master Script" },
  { key: "patterns", label: "Patterns" },
] as const;

type TabKey = typeof TABS[number]["key"];

interface Props {
  initialCalls: SalesCall[];
  initialVersions: ScriptVersion[];
  initialCurrentVersion: ScriptVersion | null;
  initialPendingProposals: ScriptProposal[];
  initialPatterns: CallPatterns;
  scriptPatterns: PatternTracker[];
}

export default function SalesCallsClient({
  initialCalls, initialVersions, initialCurrentVersion, initialPendingProposals, initialPatterns, scriptPatterns,
}: Props) {
  const [tab, setTab] = useState<TabKey>("history");
  const [calls, setCalls] = useState<SalesCall[]>(initialCalls);
  const [versions, setVersions] = useState<ScriptVersion[]>(initialVersions);
  const [currentVersion, setCurrentVersion] = useState<ScriptVersion | null>(initialCurrentVersion);
  const [pendingProposals, setPendingProposals] = useState<ScriptProposal[]>(initialPendingProposals);
  const [patterns] = useState<CallPatterns>(initialPatterns);
  const [backingUp, setBackingUp] = useState(false);
  const [backupResult, setBackupResult] = useState("");

  function handleCallUpdated(updated: SalesCall) {
    setCalls((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  }

  async function handleBackup() {
    setBackingUp(true);
    setBackupResult("");
    try {
      const res = await fetch("/api/sales-calls/backup", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setBackupResult(data.error || "Backup failed.");
        return;
      }
      setBackupResult(`Backed up. Sheet: ${data.url}`);
    } catch {
      setBackupResult("Backup failed.");
    } finally {
      setBackingUp(false);
    }
  }

  return (
    <div style={{ padding: "24px 28px 40px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", gap: 4 }}>
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", border: "none",
                background: tab === t.key ? "var(--accent)" : "#f1f5f9",
                color: tab === t.key ? "#fff" : L.muted,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <a
            href="/api/sales-calls/export"
            className="btn-lift"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "#fff", color: L.text, border: `1px solid ${L.border}`, fontSize: 12.5, fontWeight: 700, textDecoration: "none" }}
          >
            <Download style={{ width: 13, height: 13 }} /> Export CSV
          </a>
          <button
            onClick={handleBackup}
            disabled={backingUp}
            className="btn-lift"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "#fff", color: L.text, border: `1px solid ${L.border}`, fontSize: 12.5, fontWeight: 700, cursor: backingUp ? "default" : "pointer" }}
          >
            <Cloud style={{ width: 13, height: 13 }} /> {backingUp ? "Backing up…" : "Backup now"}
          </button>
        </div>
      </div>

      {backupResult && (
        <div style={{ background: backupResult.startsWith("Backed up") ? "#f0fdf4" : "#fee2e2", border: `1px solid ${backupResult.startsWith("Backed up") ? "#bbf7d0" : "#fca5a5"}`, color: backupResult.startsWith("Backed up") ? "#15803d" : "#991b1b", padding: "10px 16px", marginBottom: 18, fontSize: 13, wordBreak: "break-all" }}>
          {backupResult}
        </div>
      )}

      {tab === "history" && <CallList calls={calls} onUpdated={handleCallUpdated} />}
      {tab === "script" && (
        <MasterScriptPanel
          currentVersion={currentVersion}
          versions={versions}
          pendingProposals={pendingProposals}
          patterns={scriptPatterns}
          onCurrentVersionChange={setCurrentVersion}
          onVersionsChange={setVersions}
          onProposalsChange={setPendingProposals}
        />
      )}
      {tab === "patterns" && <PatternsPanel patterns={patterns} />}
    </div>
  );
}
