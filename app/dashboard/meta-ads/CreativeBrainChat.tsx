"use client";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowUp, Loader2, Plus, MessageSquare, Trash2, Bookmark } from "lucide-react";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8", panel: "#f8fafc" };

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  bankedLearning?: boolean;
}

interface ConversationSummary {
  id: string;
  title: string;
  updated_at: string;
}

const markdownComponents = {
  p: (props: React.HTMLAttributes<HTMLParagraphElement>) => <p style={{ margin: "0 0 8px", lineHeight: 1.6 }} {...props} />,
  ul: (props: React.HTMLAttributes<HTMLUListElement>) => <ul style={{ margin: "0 0 8px", paddingLeft: 18, lineHeight: 1.6 }} {...props} />,
  ol: (props: React.HTMLAttributes<HTMLOListElement>) => <ol style={{ margin: "0 0 8px", paddingLeft: 18, lineHeight: 1.6 }} {...props} />,
  li: (props: React.HTMLAttributes<HTMLLIElement>) => <li style={{ marginBottom: 3 }} {...props} />,
  strong: (props: React.HTMLAttributes<HTMLElement>) => <strong style={{ fontWeight: 700 }} {...props} />,
  a: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a style={{ color: "var(--accent)", textDecoration: "underline" }} target="_blank" rel="noreferrer" {...props} />,
  code: (props: React.HTMLAttributes<HTMLElement>) => <code style={{ background: "#f1f5f9", padding: "1px 5px", borderRadius: 4, fontSize: "0.9em" }} {...props} />,
};

// Chat surface for the Creative Brain employee, scoped to one client at a
// time — separate history/table row per client (kind="creative_brain",
// client_id) from the general /dashboard/brain chat. Unlike that chat, this
// one never queues an approval: when it decides to bank a learning it
// writes it immediately (see lib/creativeBrainChat.ts) since Lucky
// confirmed this flow never takes a real external action.
export default function CreativeBrainChat({ clientId, clientName }: { clientId: string; clientName: string }) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const TEXTAREA_MAX_HEIGHT = 160;

  const activeTitle = conversations.find((c) => c.id === conversationId)?.title || "New chat";

  function resizeTextarea(el: HTMLTextAreaElement | null) {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, TEXTAREA_MAX_HEIGHT)}px`;
  }

  async function loadConversations() {
    try {
      const res = await fetch(`/api/brain/conversations?kind=creative_brain&clientId=${clientId}`);
      const data = await res.json();
      if (res.ok) setConversations(data.conversations || []);
    } catch {
      // Sidebar list failing to load shouldn't block using the chat itself.
    }
  }

  // Switching client resets the thread entirely — a conversation about one
  // client's creative should never bleed into another's.
  useEffect(() => {
    setConversationId(null);
    setMessages([]);
    setError("");
    loadConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  async function openConversation(id: string) {
    if (id === conversationId) return;
    setLoadingThread(true);
    setError("");
    try {
      const res = await fetch(`/api/brain/conversations/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't load that conversation.");
      setConversationId(id);
      setMessages((data.messages || []).map((m: { role: "user" | "assistant"; content: string }) => ({ role: m.role, content: m.content })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load that conversation.");
    } finally {
      setLoadingThread(false);
    }
  }

  function startNewChat() {
    setConversationId(null);
    setMessages([]);
    setError("");
  }

  async function deleteConversation(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setConversations((c) => c.filter((x) => x.id !== id));
    if (id === conversationId) startNewChat();
    try {
      await fetch(`/api/brain/conversations/${id}`, { method: "DELETE" });
    } catch {
      loadConversations();
    }
  }

  async function send() {
    const message = input.trim();
    if (!message || sending) return;
    setInput("");
    setError("");
    setMessages((m) => [...m, { role: "user", content: message }]);
    setSending(true);
    requestAnimationFrame(() => resizeTextarea(textareaRef.current));
    try {
      const res = await fetch("/api/meta-ads/creative-brain-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, conversationId, clientId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        return;
      }
      setMessages((m) => [...m, { role: "assistant", content: data.reply, bankedLearning: data.bankedLearning }]);
      const isNewConversation = !conversationId;
      if (data.conversationId) setConversationId(data.conversationId);
      if (isNewConversation) loadConversations();
    } catch {
      setError("Couldn't reach the Creative Brain — try again.");
    } finally {
      setSending(false);
    }
  }

  const canSend = !sending && !!input.trim();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {error && <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", color: "#991b1b", padding: "9px 14px", borderRadius: 8, fontSize: 13 }}>{error}</div>}

      <div style={{ display: "flex", gap: 12, height: 480 }}>
        <div style={{ width: 200, flexShrink: 0, background: L.panel, border: `1px solid ${L.border}`, borderRadius: 10, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: 10 }}>
            <button
              onClick={startNewChat}
              style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", padding: "8px 10px", background: "#fff", border: `1px solid ${L.border}`, borderRadius: 8, fontSize: 11.5, fontWeight: 700, color: L.text, cursor: "pointer" }}
            >
              <Plus style={{ width: 12, height: 12 }} /> New chat
            </button>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "0 6px 6px" }}>
            {conversations.length === 0 && <p style={{ fontSize: 11, color: L.dimmed, padding: "6px 8px" }}>No past chats for {clientName} yet.</p>}
            {conversations.map((c) => (
              <div
                key={c.id}
                onClick={() => openConversation(c.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "7px 9px", cursor: "pointer", fontSize: 11.5, borderRadius: 7, marginBottom: 2,
                  background: c.id === conversationId ? "#fff" : "transparent",
                  boxShadow: c.id === conversationId ? `0 0 0 1px ${L.border}` : "none",
                }}
              >
                <MessageSquare style={{ width: 11, height: 11, color: L.dimmed, flexShrink: 0 }} />
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: L.text }}>{c.title}</span>
                <button onClick={(e) => deleteConversation(c.id, e)} title="Delete" style={{ display: "flex", border: "none", background: "none", cursor: "pointer", padding: 2, color: L.dimmed, flexShrink: 0 }}>
                  <Trash2 style={{ width: 10, height: 10 }} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, background: L.surface, borderRadius: 10, display: "flex", flexDirection: "column", minWidth: 0, border: `1px solid ${L.border}` }}>
          <div style={{ padding: "11px 16px", borderBottom: `1px solid ${L.border}`, fontSize: 13, fontWeight: 800, color: L.text }}>
            {activeTitle} <span style={{ fontWeight: 600, color: L.dimmed }}>· {clientName}</span>
          </div>

          <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "18px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
            {loadingThread && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, color: L.dimmed, fontSize: 12 }}>
                <Loader2 style={{ width: 12, height: 12, animation: "spin 1s linear infinite" }} /> Loading…
              </div>
            )}
            {!loadingThread && messages.length === 0 && (
              <p style={{ fontSize: 12.5, color: L.dimmed, maxWidth: 460 }}>
                Ask this Creative Brain anything about {clientName}&apos;s ads, angles, or account history — it has the client&apos;s Client Brain, live Meta data, banked learnings, hypotheses, and past decisions. Tell it to remember something and it&apos;ll bank it straight into their creative memory, no approval needed.
              </p>
            )}
            {!loadingThread && messages.map((m, i) => (
              m.role === "user" ? (
                <div key={i} style={{ alignSelf: "flex-end", maxWidth: "80%", padding: "10px 14px", fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap", background: L.panel, color: L.text, borderRadius: 14, borderBottomRightRadius: 4 }}>
                  {m.content}
                </div>
              ) : (
                <div key={i} style={{ alignSelf: "flex-start", maxWidth: "90%", fontSize: 13, color: L.text }}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{m.content}</ReactMarkdown>
                  {m.bankedLearning && (
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 4, fontSize: 10.5, fontWeight: 700, color: "#16a34a", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 6, padding: "3px 8px" }}>
                      <Bookmark style={{ width: 10, height: 10 }} /> Banked to creative memory
                    </div>
                  )}
                </div>
              )
            ))}
            {sending && (
              <div style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 6, color: L.dimmed, fontSize: 12 }}>
                <Loader2 style={{ width: 12, height: 12, animation: "spin 1s linear infinite" }} /> Thinking…
              </div>
            )}
          </div>

          <div style={{ padding: "0 14px 12px" }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 4, border: `1px solid ${L.border}`, borderRadius: 18, padding: "5px 6px", background: "#fff" }}>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => { setInput(e.target.value); resizeTextarea(e.target); }}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder={`Ask about ${clientName}'s creative…`}
                rows={1}
                style={{ flex: 1, border: "none", padding: "7px 6px", fontSize: 13, outline: "none", resize: "none", fontFamily: "inherit", lineHeight: 1.4, maxHeight: TEXTAREA_MAX_HEIGHT, overflowY: "auto", background: "transparent" }}
              />
              <button
                onClick={send}
                disabled={!canSend}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, flexShrink: 0, borderRadius: "50%", border: "none", background: canSend ? "var(--accent)" : "#e5e7eb", color: "#fff", cursor: canSend ? "pointer" : "default" }}
              >
                <ArrowUp style={{ width: 14, height: 14 }} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
