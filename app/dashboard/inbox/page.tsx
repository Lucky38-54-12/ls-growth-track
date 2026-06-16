"use client";
import { useState, useEffect, useCallback } from "react";
import Topbar from "@/components/Topbar";
import { RefreshCw, Mail, Send, Inbox, Paperclip, Reply, Archive, Trash2, MailOpen, Pencil, X } from "lucide-react";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };

type Mailbox = "inbox" | "sent";

interface InboxMessage {
  uid: number;
  messageId: string;
  from: string;
  fromEmail: string;
  to: string;
  subject: string;
  date: string;
  snippet: string;
  seen: boolean;
  hasAttachment: boolean;
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

function btnStyle(variant: "primary" | "ghost" | "danger" | "outline"): React.CSSProperties {
  const base: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 5, padding: "6px 12px",
    fontSize: 12, fontWeight: 700, borderRadius: 6, cursor: "pointer",
    border: "none", letterSpacing: "0.02em",
  };
  if (variant === "primary") return { ...base, background: "var(--red)", color: "#fff" };
  if (variant === "danger")  return { ...base, background: "#fee2e2", color: "#dc2626" };
  if (variant === "outline") return { ...base, background: L.surface, color: L.muted, border: `1px solid ${L.border}` };
  return { ...base, background: "transparent", color: L.muted };
}

export default function InboxPage() {
  const [tab, setTab] = useState<Mailbox>("inbox");
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedUid, setSelectedUid] = useState<number | null>(null);
  const [detail, setDetail] = useState<MessageDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [seenSet, setSeenSet] = useState<Set<number>>(new Set());

  // Reply state
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [replySending, setReplySending] = useState(false);

  // Compose state
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeSending, setComposeSending] = useState(false);

  const [toast, setToast] = useState("");

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }

  const loadMessages = useCallback(async (mailbox: Mailbox) => {
    setLoading(true);
    setError("");
    setSelectedUid(null);
    setDetail(null);
    setReplyOpen(false);
    try {
      const url = mailbox === "sent" ? "/api/inbox?mailbox=sent" : "/api/inbox";
      const res = await fetch(url);
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      const msgs: InboxMessage[] = data.messages || [];
      setMessages(msgs);
      setSeenSet(new Set(msgs.filter(m => m.seen).map(m => m.uid)));
    } catch {
      setError("Could not connect to Gmail. Check GMAIL_USER and GMAIL_APP_PASSWORD env vars.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadMessages(tab); }, [tab, loadMessages]);

  async function selectMessage(uid: number) {
    setSelectedUid(uid);
    setDetail(null);
    setDetailLoading(true);
    setReplyOpen(false);
    setReplyBody("");
    setSeenSet(s => new Set(s).add(uid));
    try {
      const mailboxParam = tab === "sent" ? "&mailbox=sent" : "";
      const res = await fetch(`/api/inbox?uid=${uid}${mailboxParam}`);
      const data = await res.json();
      if (data.message) setDetail(data.message);
    } catch {
      // keep detail null
    } finally {
      setDetailLoading(false);
    }
  }

  async function sendReply() {
    if (!detail || !replyBody.trim() || replySending) return;
    setReplySending(true);
    try {
      const res = await fetch("/api/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: detail.fromEmail,
          subject: detail.subject.startsWith("Re:") ? detail.subject : `Re: ${detail.subject}`,
          body: replyBody,
          inReplyTo: detail.messageId,
          references: detail.messageId,
        }),
      });
      const data = await res.json();
      if (data.error) { showToast(`Error: ${data.error}`); return; }
      setReplyOpen(false);
      setReplyBody("");
      showToast("Reply sent!");
    } finally {
      setReplySending(false);
    }
  }

  async function handleArchive() {
    if (!selectedUid) return;
    await fetch("/api/inbox", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "archive", uid: selectedUid }),
    });
    setMessages(msgs => msgs.filter(m => m.uid !== selectedUid));
    setSelectedUid(null);
    setDetail(null);
    showToast("Archived.");
  }

  async function handleTrash() {
    if (!selectedUid) return;
    await fetch("/api/inbox", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "trash", uid: selectedUid, mailbox: tab }),
    });
    setMessages(msgs => msgs.filter(m => m.uid !== selectedUid));
    setSelectedUid(null);
    setDetail(null);
    showToast("Moved to trash.");
  }

  async function handleMarkUnread() {
    if (!selectedUid) return;
    await fetch("/api/inbox", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "markUnread", uid: selectedUid, mailbox: tab }),
    });
    setSeenSet(s => { const n = new Set(s); n.delete(selectedUid!); return n; });
    setMessages(msgs => msgs.map(m => m.uid === selectedUid ? { ...m, seen: false } : m));
    showToast("Marked as unread.");
  }

  async function sendCompose() {
    if (!composeTo.trim() || !composeSubject.trim() || !composeBody.trim() || composeSending) return;
    setComposeSending(true);
    try {
      const res = await fetch("/api/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: composeTo, subject: composeSubject, body: composeBody }),
      });
      const data = await res.json();
      if (data.error) { showToast(`Error: ${data.error}`); return; }
      setComposeOpen(false);
      setComposeTo("");
      setComposeSubject("");
      setComposeBody("");
      showToast("Email sent!");
    } finally {
      setComposeSending(false);
    }
  }

  const unread = tab === "inbox" ? messages.filter(m => !seenSet.has(m.uid)).length : 0;

  const tabStyle = (active: boolean) => ({
    display: "flex", alignItems: "center", gap: 6,
    padding: "6px 12px", fontSize: 12, fontWeight: 700,
    background: active ? "#fef2f2" : "transparent",
    color: active ? "var(--red)" : L.muted,
    border: "none", borderBottom: active ? "2px solid var(--red)" : "2px solid transparent",
    cursor: "pointer", letterSpacing: "0.04em",
  } as React.CSSProperties);

  const inputStyle: React.CSSProperties = {
    width: "100%", fontSize: 13, padding: "6px 8px",
    border: `1px solid ${L.border}`, borderRadius: 4,
    fontFamily: "inherit", outline: "none", color: L.text,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <Topbar title="Inbox" subtitle={`Gmail — ${unread > 0 ? `${unread} unread` : "all read"}`} />

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* Message list */}
        <div style={{ width: 340, flexShrink: 0, borderRight: `1px solid ${L.border}`, display: "flex", flexDirection: "column", background: L.surface }}>
          {/* Tab bar + compose button */}
          <div style={{ display: "flex", alignItems: "stretch", borderBottom: `1px solid ${L.border}`, background: "#f8fafc" }}>
            <button style={tabStyle(tab === "inbox")} onClick={() => setTab("inbox")}>
              <Inbox style={{ width: 13, height: 13 }} />
              INBOX
              {unread > 0 && <span style={{ fontSize: 9, fontWeight: 800, padding: "1px 5px", background: "var(--red)", color: "#fff", borderRadius: 99 }}>{unread}</span>}
            </button>
            <button style={tabStyle(tab === "sent")} onClick={() => setTab("sent")}>
              <Send style={{ width: 13, height: 13 }} />
              SENT
            </button>
            <div style={{ flex: 1 }} />
            <button
              onClick={() => loadMessages(tab)}
              title="Refresh"
              style={{ background: "none", border: "none", cursor: "pointer", color: L.dimmed, padding: "0 8px", display: "flex", alignItems: "center" }}
            >
              <RefreshCw style={{ width: 13, height: 13 }} />
            </button>
            <button
              onClick={() => setComposeOpen(true)}
              title="Compose"
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--red)", padding: "0 10px", display: "flex", alignItems: "center" }}
            >
              <Pencil style={{ width: 13, height: 13 }} />
            </button>
          </div>

          <div style={{ flex: 1, overflowY: "auto" }}>
            {loading ? (
              <div style={{ padding: 24, textAlign: "center", color: L.dimmed, fontSize: 12 }}>Loading…</div>
            ) : error ? (
              <div style={{ padding: 20, color: "var(--red)", fontSize: 12 }}>{error}</div>
            ) : messages.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: L.dimmed, fontSize: 12 }}>{tab === "sent" ? "No sent mail found." : "Inbox is empty."}</div>
            ) : (
              messages.map((msg) => {
                const seen = tab === "sent" || seenSet.has(msg.uid);
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
                      {initials(tab === "sent" ? (msg.to || msg.fromEmail) : (msg.from || msg.fromEmail))}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 6 }}>
                        <span style={{ fontSize: 12.5, fontWeight: seen ? 500 : 700, color: L.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {tab === "sent" ? (msg.to || msg.fromEmail) : (msg.from || msg.fromEmail)}
                        </span>
                        <span style={{ fontSize: 10, color: L.dimmed, flexShrink: 0 }}>{relativeDate(msg.date)}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 1 }}>
                        <p style={{ fontSize: 12, color: seen ? L.muted : L.text, fontWeight: seen ? 400 : 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>
                          {msg.subject}
                        </p>
                        {msg.hasAttachment && <Paperclip style={{ width: 10, height: 10, color: L.dimmed, flexShrink: 0 }} />}
                      </div>
                    </div>
                    {!seen && tab === "inbox" && <div style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--blue)", flexShrink: 0, marginTop: 5 }} />}
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
                    {initials(tab === "sent" ? detail.to : (detail.from || detail.fromEmail))}
                  </div>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 700, color: L.text }}>
                      {tab === "sent" ? `To: ${detail.to || detail.fromEmail}` : (detail.from || detail.fromEmail)}
                    </p>
                    <p style={{ fontSize: 11.5, color: L.dimmed }}>
                      {tab === "sent" ? `From: ${detail.fromEmail}` : `${detail.fromEmail}${detail.to ? ` → ${detail.to}` : ""}`}
                    </p>
                  </div>
                  <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
                    {detail.hasAttachment && (
                      <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: L.dimmed }}>
                        <Paperclip style={{ width: 12, height: 12 }} /> Attachment
                      </span>
                    )}
                    <span style={{ fontSize: 11.5, color: L.dimmed }}>
                      {new Date(detail.date).toLocaleString("en-NZ", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true })}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action toolbar */}
              <div style={{ display: "flex", gap: 6, padding: "8px 24px", borderBottom: `1px solid ${L.border}`, background: L.surface }}>
                {tab === "inbox" && (
                  <button style={btnStyle("primary")} onClick={() => { setReplyOpen(r => !r); setReplyBody(""); }}>
                    <Reply style={{ width: 12, height: 12 }} /> Reply
                  </button>
                )}
                {tab === "inbox" && (
                  <button style={btnStyle("outline")} onClick={handleArchive}>
                    <Archive style={{ width: 12, height: 12 }} /> Archive
                  </button>
                )}
                <button style={btnStyle("danger")} onClick={handleTrash}>
                  <Trash2 style={{ width: 12, height: 12 }} /> Delete
                </button>
                {tab === "inbox" && (
                  <button style={btnStyle("ghost")} onClick={handleMarkUnread}>
                    <MailOpen style={{ width: 12, height: 12 }} /> Mark unread
                  </button>
                )}
              </div>

              {/* Body */}
              <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
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

                {/* Inline reply compose */}
                {replyOpen && (
                  <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 8, maxWidth: 720, overflow: "hidden" }}>
                    <div style={{ padding: "10px 16px", borderBottom: `1px solid ${L.border}`, background: "#f8fafc", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: L.text }}>
                        Reply to: {detail.fromEmail}
                      </span>
                      <button onClick={() => setReplyOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: L.dimmed, padding: 2 }}>
                        <X style={{ width: 14, height: 14 }} />
                      </button>
                    </div>
                    <div style={{ padding: "10px 16px", borderBottom: `1px solid ${L.border}`, fontSize: 12, color: L.muted }}>
                      Subject: {detail.subject.startsWith("Re:") ? detail.subject : `Re: ${detail.subject}`}
                    </div>
                    <textarea
                      value={replyBody}
                      onChange={e => setReplyBody(e.target.value)}
                      placeholder="Write your reply…"
                      autoFocus
                      rows={6}
                      style={{ width: "100%", border: "none", outline: "none", padding: "14px 16px", fontSize: 13.5, fontFamily: "inherit", lineHeight: 1.65, color: L.text, resize: "vertical" }}
                    />
                    <div style={{ padding: "10px 16px", borderTop: `1px solid ${L.border}`, display: "flex", gap: 8, alignItems: "center" }}>
                      <button style={btnStyle("primary")} onClick={sendReply} disabled={replySending || !replyBody.trim()}>
                        <Send style={{ width: 12, height: 12 }} />
                        {replySending ? "Sending…" : "Send"}
                      </button>
                      <button style={btnStyle("ghost")} onClick={() => { setReplyOpen(false); setReplyBody(""); }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--red)", fontSize: 12 }}>Could not load message.</div>
          )}
        </div>
      </div>

      {/* Floating compose window */}
      {composeOpen && (
        <div style={{
          position: "fixed", bottom: 20, right: 24, width: 420, background: L.surface,
          border: `1px solid ${L.border}`, borderRadius: 10, boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
          display: "flex", flexDirection: "column", zIndex: 1000,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "#0f172a", borderRadius: "10px 10px 0 0" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>New Message</span>
            <button onClick={() => setComposeOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: 2 }}>
              <X style={{ width: 14, height: 14 }} />
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            <div style={{ display: "flex", alignItems: "center", borderBottom: `1px solid ${L.border}`, padding: "8px 14px", gap: 8 }}>
              <span style={{ fontSize: 12, color: L.dimmed, width: 48, flexShrink: 0 }}>To</span>
              <input
                value={composeTo}
                onChange={e => setComposeTo(e.target.value)}
                placeholder="recipient@email.com"
                style={{ ...inputStyle, border: "none", padding: "2px 0" }}
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", borderBottom: `1px solid ${L.border}`, padding: "8px 14px", gap: 8 }}>
              <span style={{ fontSize: 12, color: L.dimmed, width: 48, flexShrink: 0 }}>Subject</span>
              <input
                value={composeSubject}
                onChange={e => setComposeSubject(e.target.value)}
                placeholder="Subject"
                style={{ ...inputStyle, border: "none", padding: "2px 0" }}
              />
            </div>
            <textarea
              value={composeBody}
              onChange={e => setComposeBody(e.target.value)}
              placeholder="Write your message…"
              rows={8}
              style={{ border: "none", outline: "none", padding: "12px 14px", fontSize: 13.5, fontFamily: "inherit", lineHeight: 1.65, color: L.text, resize: "none" }}
            />
          </div>
          <div style={{ padding: "10px 14px", borderTop: `1px solid ${L.border}`, display: "flex", gap: 8 }}>
            <button style={btnStyle("primary")} onClick={sendCompose} disabled={composeSending || !composeTo.trim() || !composeSubject.trim() || !composeBody.trim()}>
              <Send style={{ width: 12, height: 12 }} />
              {composeSending ? "Sending…" : "Send"}
            </button>
            <button style={btnStyle("ghost")} onClick={() => setComposeOpen(false)}>Discard</button>
          </div>
        </div>
      )}

      {/* Toast notification */}
      {toast && (
        <div style={{
          position: "fixed", bottom: composeOpen ? 300 : 24, left: "50%", transform: "translateX(-50%)",
          background: "#0f172a", color: "#fff", padding: "10px 20px", borderRadius: 8,
          fontSize: 13, fontWeight: 600, zIndex: 1001, pointerEvents: "none",
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}
