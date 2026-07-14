"use client";
import { useState } from "react";
import { SalesCall, ScriptVersion, ScriptProposal, Lead, EngagementSummary, OnboardingClient, PatternTracker } from "@/lib/types";
import { computeStats, computePatterns, CallStats, CallPatterns } from "@/lib/salesCallsStats";
import StatsBar from "./StatsBar";
import CallLogForm from "./CallLogForm";
import CallList from "./CallList";
import MasterScriptPanel from "./MasterScriptPanel";
import CallPrepPanel from "./CallPrepPanel";
import PatternsPanel from "./PatternsPanel";
import OnboardingTab from "./OnboardingTab";
import { Download, Cloud } from "lucide-react";

const L = { border: "#e2e8f0", text: "#0f172a", muted: "#64748b" };

const TABS = [
  { key: "log", label: "Log a Call" },
  { key: "history", label: "Call History" },
  { key: "script", label: "Master Script" },
  { key: "prep", label: "Call Prep" },
  { key: "patterns", label: "Patterns" },
  { key: "onboarding", label: "Onboarding" },
] as const;

type TabKey = typeof TABS[number]["key"];

interface Props {
  initialCalls: SalesCall[];
  initialVersions: ScriptVersion[];
  initialCurrentVersion: ScriptVersion | null;
  initialPendingProposals: ScriptProposal[];
  initialStats: CallStats;
  initialPatterns: CallPatterns;
  pipelineLeads: Lead[];
  engagement: Record<string, EngagementSummary>;
  onboardingClients: OnboardingClient[];
  scriptPatterns: PatternTracker[];
}

export default function SalesCallsClient({
  initialCalls, initialVersions, initialCurrentVersion, initialPendingProposals, initialStats, initialPatterns,
  pipelineLeads, engagement, onboardingClients, scriptPatterns,
}: Props) {
  const [tab, setTab] = useState<TabKey>("log");
  const [calls, setCalls] = useState<SalesCall[]>(initialCalls);
  const [versions, setVersions] = useState<ScriptVersion[]>(initialVersions);
  const [currentVersion, setCurrentVersion] = useState<ScriptVersion | null>(initialCurrentVersion);
  const [pendingProposals, setPendingProposals] = useState<ScriptProposal[]>(initialPendingProposals);
  const [stats, setStats] = useState<CallStats>(initialStats);
  const [patterns, setPatterns] = useState<CallPatterns>(initialPatterns);
  const [backingUp, setBackingUp] = useState(false);
  const [backupResult, setBackupResult] = useState("");

  function handleCallSaved(call: SalesCall, proposal: ScriptProposal | null, backupUrl: string | null) {
    const nextCalls = [call, ...calls];
    setCalls(nextCalls);
    setStats(computeStats(nextCalls));
    setPatterns(computePatterns(nextCalls));
    if (proposal) setPendingProposals((p) => [proposal, ...p]);
    setBackupResult(backupUrl ? `Backed up. Sheet: ${backupUrl}` : "");
    setTab(proposal ? "script" : "history");
  }

  function handleCallUpdated(updated: SalesCall) {
    const nextCalls = calls.map((c) => (c.id === updated.id ? updated : c));
    setCalls(nextCalls);
    setStats(computeStats(nextCalls));
    setPatterns(computePatterns(nextCalls));
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
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: "24px 28px 40px" }}>
      <StatsBar stats={stats} />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", gap: 4 }}>
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", border: "none",
                background: tab === t.key ? "var(--red)" : "#f1f5f9",
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

      {tab === "log" && <CallLogForm onSaved={handleCallSaved} />}
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
      {tab === "prep" && <CallPrepPanel />}
      {tab === "patterns" && <PatternsPanel patterns={patterns} />}
      {tab === "onboarding" && <OnboardingTab pipelineLeads={pipelineLeads} engagement={engagement} clients={onboardingClients} />}
    </div>
  );
}
