"use client";
import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Send, Mail } from "lucide-react";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };

interface ResendSend {
  id: number;
  leadId: string;
  step: string;
  subject: string;
  bodyHtml: string;
  sentAt: string;
  company: string;
  email: string;
}

function relativeDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString("en-NZ", { day: "numeric", month: "short" });
}

function initials(name: string): string {
  return (name || "?").split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

export default function ResendSentList() {
  const [sends, setSends] = useState<ResendSend[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/resend-sends");
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      setSends(data.messages || []);
    } catch {
      setError("Could not load Resend sends.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const selected = sends.find(s => s.id === selectedId) || null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "72vh", border: `1px solid ${L.border}` }}>
      <div className={`resend-body${selectedId ? " has-selection" : ""}`} style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <div className="resend-list" style={{ width: 340, flexShrink: 0, borderRight: `1px solid ${L.border}`, display: "flex", flexDirection: "column", background: L.surface }}>
          <div style={{ display: "flex", alignItems: "center", borderBottom: `1px solid ${L.border}`, background: "#f8fafc", padding: "8px 12px" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: L.text }}>
              <Send style={{ width: 13, height: 13 }} /> RESEND SENT
            </span>
            <div style={{ flex: 1 }} />
            <button onClick={load} title="Refresh" style={{ background: "none", border: "none", cursor: "pointer", color: L.dimmed, padding: "0 4px", display: "flex", alignItems: "center" }}>
              <RefreshCw style={{ width: 13, height: 13 }} />
            </button>
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {loading ? (
              <div style={{ padding: 24, textAlign: "center", color: L.dimmed, fontSize: 12 }}>Loading…</div>
            ) : error ? (
              <div style={{ padding: 20, color: "var(--red)", fontSize: 12 }}>{error}</div>
            ) : sends.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: L.dimmed, fontSize: 12 }}>No Resend sends yet.</div>
            ) : (
              sends.map(s => {
                const isSelected = selectedId === s.id;
                return (
                  <div
                    key={s.id}
                    onClick={() => setSelectedId(s.id)}
                    className="row-hover"
                    style={{
                      display: "flex", alignItems: "flex-start", gap: 10, padding: "11px 14px",
                      borderBottom: `1px solid ${L.border}`, cursor: "pointer",
                      background: isSelected ? "var(--accent-tint)" : L.surface,
                      borderLeft: isSelected ? "2px solid var(--accent)" : "2px solid transparent",
                    }}
                  >
                    <div style={{
                      width: 32, height: 32, flexShrink: 0, borderRadius: "50%",
                      background: "#e2e8f0", color: L.muted,
                      display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800,
                    }}>
                      {initials(s.company || s.email)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 6 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 500, color: L.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {s.company || s.email || "Unknown"}
                        </span>
                        <span style={{ fontSize: 10, color: L.dimmed, flexShrink: 0 }}>{relativeDate(s.sentAt)}</span>
                      </div>
                      <p style={{ fontSize: 12, color: L.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 1 }}>
                        {s.subject}
                      </p>
                      <span style={{ fontSize: 9.5, color: L.dimmed, textTransform: "uppercase", letterSpacing: "0.04em" }}>{s.step}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="resend-detail" style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, background: "#f8fafc" }}>
          {!selected ? (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: L.dimmed }}>
              <Mail style={{ width: 40, height: 40, marginBottom: 12, opacity: 0.3 }} />
              <p style={{ fontSize: 13 }}>Select a sent email to read</p>
            </div>
          ) : (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
              <div style={{ padding: "18px 24px 14px", borderBottom: `1px solid ${L.border}`, background: L.surface }}>
                <h2 style={{ fontSize: 17, fontWeight: 800, color: L.text, marginBottom: 10 }}>{selected.subject}</h2>
                <p style={{ fontSize: 13, fontWeight: 700, color: L.text }}>To: {selected.company || selected.email}</p>
                <p style={{ fontSize: 11.5, color: L.dimmed }}>
                  {selected.email}{" "}·{" "}
                  {new Date(selected.sentAt).toLocaleString("en-NZ", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true })}
                  {" "}· step: {selected.step}
                </p>
              </div>
              <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
                <div
                  className="email-preview"
                  style={{ background: L.surface, padding: "20px 24px", border: `1px solid ${L.border}`, fontSize: 14, lineHeight: 1.65, color: L.text, maxWidth: 720 }}
                  dangerouslySetInnerHTML={{ __html: selected.bodyHtml || "<p><em>No content</em></p>" }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
