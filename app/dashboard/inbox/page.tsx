"use client";
import { useState, useEffect, useCallback } from "react";
import Topbar from "@/components/Topbar";
import { RefreshCw, Mail, MailOpen, Inbox } from "lucide-react";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };

interface InboxMessage {
  uid: number;
  messageId: string;
  from: string;
  fromEmail: string;
  subject: string;
  date: string;
  snippet: string;
  seen: boolean;
}

interface MessageDetail extends InboxMessage {
  bodyHtml: string;
  bodyText: string;
  to: string;
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

export default function InboxPage() {
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedUid, setSelectedUid] = useState<number | null>(null);
  const [detail, setDetail] = useState<MessageDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [seenSet, setSeenSet] = useState<Set<number>>(new Set());

  const loadInbox = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/inbox");
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      setMessages(data.messages || []);
      const seen = new Set<number>((data.messages as InboxMessage[]).filter(m => m.seen).map(m => m.uid));
      setSeenSet(seen);
    } catch {
      setError("Could not load inbox");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadInbox(); }, [loadInbox]);

  async function selectMessage(uid: number) {
    setSelectedUid(uid);
    setDetail(null);
    setDetailLoading(true);
    setSeenSet(s => new Set(s).add(uid));
    try {
      const res = await fetch(`/api/inbox?uid=${uid}`);
      const data = await res.json();
      if (data.message) setDetail(data.message);
    } catch {
      // keep detail null
    } finally {
      setDetailLoading(false);
    }
  }

  const unread = messages.filter(m => !seenSet.has(m.uid)).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <Topbar title="Inbox" subtitle={`${process.env.NEXT_PUBLIC_GMAIL_USER || "Gmail"} — ${unread} unread`} />

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* Message list */}
        <div style={{ width: 340, flexShrink: 0, borderRight: `1px solid ${L.border}`, display: "flex", flexDirection: "column", background: L.surface }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: `1px solid ${L.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Inbox style={{ width: 14, height: 14, color: L.muted }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: L.text }}>INBOX</span>
              {unread > 0 && <span style={{ fontSize: 10, fontWeight: 800, padding: "1px 6px", background: "var(--red)", color: "#fff" }}>{unread}</span>}
            </div>
            <button onClick={loadInbox} title="Refresh" style={{ background: "none", border: "none", cursor: "pointer", color: L.muted, display: "flex", padding: 4 }}>
              <RefreshCw style={{ width: 13, height: 13 }} />
            </button>
          </div>

          <div style={{ flex: 1, overflowY: "auto" }}>
            {loading ? (
              <div style={{ padding: 24, textAlign: "center", color: L.dimmed, fontSize: 12 }}>Loading…</div>
            ) : error ? (
              <div style={{ padding: 20, color: "var(--red)", fontSize: 12 }}>{error}</div>
            ) : messages.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: L.dimmed, fontSize: 12 }}>Inbox is empty.</div>
            ) : (
              messages.map((msg) => {
                const seen = seenSet.has(msg.uid);
                const isSelected = selectedUid === msg.uid;
                return (
                  <div
                    key={msg.uid}
                    onClick={() => selectMessage(msg.uid)}
                    className="row-hover"
                    style={{
                      display: "flex", alignItems: "flex-start", gap: 10, padding: "11px 14px",
                      borderBottom: `1px solid ${L.border}`, cursor: "pointer",
                      background: isSelected ? "#fef2f2" : seen ? L.surface : "#f0f7ff",
                      borderLeft: isSelected ? "2px solid var(--red)" : "2px solid transparent",
                    }}
                  >
                    <div style={{
                      width: 32, height: 32, flexShrink: 0, borderRadius: "50%",
                      background: seen ? "#e2e8f0" : "var(--blue)", color: seen ? L.muted : "#fff",
                      display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800,
                    }}>
                      {initials(msg.from || msg.fromEmail)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 6 }}>
                        <span style={{ fontSize: 12.5, fontWeight: seen ? 500 : 700, color: L.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {msg.from || msg.fromEmail}
                        </span>
                        <span style={{ fontSize: 10, color: L.dimmed, flexShrink: 0 }}>{relativeDate(msg.date)}</span>
                      </div>
                      <p style={{ fontSize: 12, color: seen ? L.muted : L.text, fontWeight: seen ? 400 : 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 1 }}>
                        {msg.subject}
                      </p>
                    </div>
                    {!seen && <div style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--blue)", flexShrink: 0, marginTop: 5 }} />}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Message detail */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, background: "#f8fafc" }}>
          {!selectedUid ? (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: L.dimmed }}>
              <Mail style={{ width: 40, height: 40, marginBottom: 12, opacity: 0.3 }} />
              <p style={{ fontSize: 13 }}>Select a message to read</p>
            </div>
          ) : detailLoading ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: L.dimmed, fontSize: 12 }}>Loading…</div>
          ) : detail ? (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
              {/* Header */}
              <div style={{ padding: "18px 24px 14px", borderBottom: `1px solid ${L.border}`, background: L.surface }}>
                <h2 style={{ fontSize: 17, fontWeight: 800, color: L.text, marginBottom: 10 }}>{detail.subject}</h2>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--blue)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, flexShrink: 0 }}>
                    {initials(detail.from || detail.fromEmail)}
                  </div>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 700, color: L.text }}>{detail.from || detail.fromEmail}</p>
                    <p style={{ fontSize: 11.5, color: L.dimmed }}>{detail.fromEmail}{detail.to ? ` → ${detail.to}` : ""}</p>
                  </div>
                  <span style={{ marginLeft: "auto", fontSize: 11.5, color: L.dimmed }}>
                    {new Date(detail.date).toLocaleString("en-NZ", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true })}
                  </span>
                </div>
              </div>

              {/* Body */}
              <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
                {detail.bodyHtml ? (
                  <div
                    className="email-preview"
                    style={{ background: L.surface, padding: "20px 24px", border: `1px solid ${L.border}`, fontSize: 14, lineHeight: 1.65, color: L.text, maxWidth: 720 }}
                    dangerouslySetInnerHTML={{ __html: detail.bodyHtml }}
                  />
                ) : (
                  <pre style={{ fontFamily: "inherit", fontSize: 13.5, lineHeight: 1.7, color: L.text, whiteSpace: "pre-wrap", wordBreak: "break-word", background: L.surface, padding: "20px 24px", border: `1px solid ${L.border}`, maxWidth: 720 }}>
                    {detail.bodyText || "No content"}
                  </pre>
                )}
              </div>
            </div>
          ) : (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--red)", fontSize: 12 }}>Could not load message.</div>
          )}
        </div>
      </div>
    </div>
  );
}
