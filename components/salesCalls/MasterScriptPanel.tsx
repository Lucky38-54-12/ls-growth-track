"use client";
import { useState } from "react";
import { ScriptVersion, ScriptProposal, PatternTracker } from "@/lib/types";
import { History, RotateCcw, Check, X, AlertTriangle } from "lucide-react";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };

const COST_COLORS: Record<string, { bg: string; text: string }> = {
  high: { bg: "#fee2e2", text: "#991b1b" },
  medium: { bg: "#fef9c3", text: "#854d0e" },
  low: { bg: "#f1f5f9", text: "#64748b" },
};

interface Props {
  currentVersion: ScriptVersion | null;
  versions: ScriptVersion[];
  pendingProposals: ScriptProposal[];
  patterns: PatternTracker[];
  onCurrentVersionChange: (v: ScriptVersion) => void;
  onVersionsChange: (v: ScriptVersion[]) => void;
  onProposalsChange: (p: ScriptProposal[]) => void;
}

export default function MasterScriptPanel({ currentVersion, versions, pendingProposals, patterns, onCurrentVersionChange, onVersionsChange, onProposalsChange }: Props) {
  const [showHistory, setShowHistory] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function decide(proposalId: string, decision: "approved" | "rejected") {
    setBusyId(proposalId);
    setError("");
    try {
      const res = await fetch(`/api/sales-calls/script/proposals/${proposalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Couldn't apply that decision.");
        return;
      }
      onProposalsChange(pendingProposals.filter((p) => p.id !== proposalId));
      if (decision === "approved" && data.version) {
        onCurrentVersionChange(data.version);
        onVersionsChange([data.version, ...versions.map((v) => ({ ...v, is_current: false }))]);
      }
    } catch {
      setError("Couldn't apply that decision.");
    } finally {
      setBusyId(null);
    }
  }

  async function rollback(versionId: string) {
    setBusyId(versionId);
    setError("");
    try {
      const res = await fetch("/api/sales-calls/script/rollback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version_id: versionId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Couldn't roll back.");
        return;
      }
      onCurrentVersionChange(data.version);
      onVersionsChange([data.version, ...versions.map((v) => ({ ...v, is_current: false }))]);
    } catch {
      setError("Couldn't roll back.");
    } finally {
      setBusyId(null);
    }
  }

  const openPatterns = patterns.filter((p) => p.status === "open").sort((a, b) => {
    const costRank = { high: 0, medium: 1, low: 2 };
    return costRank[a.cost] - costRank[b.cost] || b.occurrences - a.occurrences;
  });
  const closedPatterns = patterns.filter((p) => p.status === "closed");
  const notLanding = openPatterns.filter((p) => p.fix_landing_status === "not_landing");

  return (
    <div>
      {error && <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", color: "#991b1b", padding: "10px 16px", marginBottom: 18, fontSize: 14 }}>{error}</div>}

      {notLanding.length > 0 && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", padding: 20, marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <AlertTriangle style={{ width: 15, height: 15, color: "#991b1b" }} />
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "#991b1b" }}>The fix isn't landing</div>
          </div>
          {notLanding.map((p) => (
            <p key={p.id} style={{ fontSize: 13, color: "#991b1b", marginBottom: 6 }}>
              {p.pattern_summary} It's happened again since the script was fixed for it. This is an execution problem under pressure, not a wording problem. Rewording the script again won't fix this, something different is needed, a mid-call checklist, a pre-call reminder, or a change to how the call opens rather than closes.
            </p>
          ))}
        </div>
      )}

      {patterns.length > 0 && (
        <div style={{ background: L.surface, border: `1px solid ${L.border}`, padding: 24, marginBottom: 20 }}>
          <div style={{ fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, fontWeight: 800, marginBottom: 14 }}>Recurring patterns</div>

          {openPatterns.length === 0 && closedPatterns.length === 0 && (
            <p style={{ fontSize: 13, color: L.dimmed }}>Nothing tracked yet.</p>
          )}

          {openPatterns.length > 0 && (
            <div style={{ marginBottom: closedPatterns.length > 0 ? 18 : 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: L.muted, marginBottom: 8 }}>Open ({openPatterns.length})</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {openPatterns.map((p) => (
                  <div key={p.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", background: "#f8fafc", border: `1px solid ${L.border}` }}>
                    <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 20, background: COST_COLORS[p.cost].bg, color: COST_COLORS[p.cost].text, flexShrink: 0, marginTop: 1 }}>
                      {p.cost}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: L.text }}>{p.pattern_summary}</div>
                      <div style={{ fontSize: 11, color: L.dimmed, marginTop: 3 }}>
                        {p.occurrences} call{p.occurrences === 1 ? "" : "s"}
                        {p.fix_applied_at ? p.fix_landing_status === "not_landing" ? " · fix not landing" : " · fix applied, waiting on the next call to confirm" : " · no fix applied yet"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {closedPatterns.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: L.muted, marginBottom: 8 }}>Closed ({closedPatterns.length})</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {closedPatterns.map((p) => (
                  <div key={p.id} style={{ padding: "10px 12px", background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
                    <div style={{ fontSize: 13, color: "#15803d", textDecoration: "line-through" }}>{p.pattern_summary}</div>
                    {p.closed_reason && <div style={{ fontSize: 11, color: "#166534", marginTop: 3 }}>{p.closed_reason}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {pendingProposals.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          {pendingProposals.map((p) => (
            <div key={p.id} style={{ background: "#fffbeb", border: "1px solid #fde68a", padding: 20, marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "#92400e", marginBottom: 6 }}>
                {p.needs_changes ? "Proposed script update" : "No changes needed"}
              </div>
              <p style={{ fontSize: 13, color: L.text, marginBottom: p.needs_changes ? 14 : 0 }}>{p.summary}</p>

              {p.needs_changes && (
                <>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
                    {p.diffs.map((d, i) => (
                      <div key={i} style={{ background: "#fff", border: `1px solid ${L.border}`, padding: 12 }}>
                        <div style={{ fontSize: 11, color: "#991b1b", marginBottom: 4 }}><strong>Before:</strong> {d.before}</div>
                        <div style={{ fontSize: 11, color: "#15803d", marginBottom: 6 }}><strong>After:</strong> {d.after}</div>
                        <div style={{ fontSize: 11, color: L.muted }}>{d.reason}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button
                      onClick={() => decide(p.id, "approved")}
                      disabled={busyId === p.id}
                      className="btn-lift"
                      style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", background: "#16a34a", color: "#fff", border: "none", fontSize: 12.5, fontWeight: 700, cursor: busyId === p.id ? "default" : "pointer" }}
                    >
                      <Check style={{ width: 13, height: 13 }} /> Approve
                    </button>
                    <button
                      onClick={() => decide(p.id, "rejected")}
                      disabled={busyId === p.id}
                      className="btn-lift"
                      style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", background: "#fff", color: L.muted, border: `1px solid ${L.border}`, fontSize: 12.5, fontWeight: 700, cursor: busyId === p.id ? "default" : "pointer" }}
                    >
                      <X style={{ width: 13, height: 13 }} /> Dismiss
                    </button>
                  </div>
                </>
              )}
              {!p.needs_changes && (
                <button
                  onClick={() => decide(p.id, "rejected")}
                  disabled={busyId === p.id}
                  style={{ marginTop: 10, padding: "6px 14px", background: "none", color: L.muted, border: `1px solid ${L.border}`, fontSize: 12, fontWeight: 600, cursor: busyId === p.id ? "default" : "pointer" }}
                >
                  Okay, dismiss
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ background: L.surface, border: `1px solid ${L.border}`, padding: 24 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <div style={{ fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, fontWeight: 800 }}>
            Master script {currentVersion ? `· v${currentVersion.version}` : ""}
          </div>
          <button
            onClick={() => setShowHistory((s) => !s)}
            className="pill-hover"
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", background: "none", border: `1px solid ${L.border}`, fontSize: 12, fontWeight: 700, color: L.muted, cursor: "pointer" }}
          >
            <History style={{ width: 13, height: 13 }} /> Version history
          </button>
        </div>
        <div style={{ fontSize: 13.5, color: L.text, whiteSpace: "pre-wrap", lineHeight: 1.6, marginTop: 16 }}>
          {currentVersion?.content || "No script saved yet."}
        </div>
      </div>

      {showHistory && (
        <div style={{ background: L.surface, border: `1px solid ${L.border}`, marginTop: 16 }}>
          {versions.map((v) => (
            <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", borderBottom: `1px solid ${L.border}` }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: L.text, width: 60, flexShrink: 0 }}>v{v.version}</span>
              <span style={{ fontSize: 12, color: L.muted, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.changelog || "No changelog"}</span>
              <span style={{ fontSize: 11, color: L.dimmed, flexShrink: 0 }}>{new Date(v.created_at).toLocaleDateString("en-NZ")}</span>
              {v.is_current ? (
                <span style={{ fontSize: 11, fontWeight: 700, color: "#15803d", flexShrink: 0 }}>Current</span>
              ) : (
                <button
                  onClick={() => rollback(v.id)}
                  disabled={busyId === v.id}
                  className="pill-hover"
                  style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", background: "none", border: `1px solid ${L.border}`, fontSize: 11, fontWeight: 700, color: L.muted, cursor: busyId === v.id ? "default" : "pointer", flexShrink: 0 }}
                >
                  <RotateCcw style={{ width: 11, height: 11 }} /> Roll back to this
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
