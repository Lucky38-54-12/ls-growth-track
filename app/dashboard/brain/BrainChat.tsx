"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowUp, Loader2, Paperclip, X, FileText, Image as ImageIcon, Plus, MessageSquare, Trash2 } from "lucide-react";
import { ChatDraft } from "@/lib/chatDrafts";
import { BrainAttachment, MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS_PER_MESSAGE, isAllowedAttachmentType } from "@/lib/brainAttachments";
import ApprovalQueue from "@/components/ApprovalQueue";

const L = { surface: "#ffffff", border: "#e5e7eb", text: "#111827", muted: "#6b7280", dimmed: "#9ca3af", panel: "#fafafa" };

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  attachmentNames?: string[];
}

interface PendingAttachment extends BrainAttachment {
  uploading: boolean;
}

interface ConversationSummary {
  id: string;
  title: string;
  updated_at: string;
}

// Renders an assistant reply's markdown (bold, headings, bullet/numbered
// lists, links) as real formatted text instead of a flat pre-wrap block —
// the model's replies read like ordinary prose with structure, so they
// should render that way instead of showing literal "**" and "- " markers.
const markdownComponents = {
  p: (props: React.HTMLAttributes<HTMLParagraphElement>) => <p style={{ margin: "0 0 10px", lineHeight: 1.65 }} {...props} />,
  h1: (props: React.HTMLAttributes<HTMLHeadingElement>) => <h1 style={{ fontSize: 17, fontWeight: 800, margin: "16px 0 8px" }} {...props} />,
  h2: (props: React.HTMLAttributes<HTMLHeadingElement>) => <h2 style={{ fontSize: 15, fontWeight: 800, margin: "14px 0 6px" }} {...props} />,
  h3: (props: React.HTMLAttributes<HTMLHeadingElement>) => <h3 style={{ fontSize: 13.5, fontWeight: 800, margin: "12px 0 6px" }} {...props} />,
  ul: (props: React.HTMLAttributes<HTMLUListElement>) => <ul style={{ margin: "0 0 10px", paddingLeft: 20, lineHeight: 1.65 }} {...props} />,
  ol: (props: React.HTMLAttributes<HTMLOListElement>) => <ol style={{ margin: "0 0 10px", paddingLeft: 20, lineHeight: 1.65 }} {...props} />,
  li: (props: React.HTMLAttributes<HTMLLIElement>) => <li style={{ marginBottom: 3 }} {...props} />,
  strong: (props: React.HTMLAttributes<HTMLElement>) => <strong style={{ fontWeight: 700 }} {...props} />,
  a: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a style={{ color: "var(--accent)", textDecoration: "underline" }} target="_blank" rel="noreferrer" {...props} />,
  code: (props: React.HTMLAttributes<HTMLElement>) => <code style={{ background: "#f1f5f9", padding: "1px 5px", borderRadius: 4, fontSize: "0.9em" }} {...props} />,
  hr: () => <hr style={{ border: "none", borderTop: `1px solid ${L.border}`, margin: "12px 0" }} />,
};

export default function BrainChat({ initialDrafts, initialInput }: { initialDrafts: ChatDraft[]; initialInput?: string }) {
  const router = useRouter();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [input, setInput] = useState(initialInput || "");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const dragDepth = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const TEXTAREA_MAX_HEIGHT = 200;
  const activeTitle = conversations.find((c) => c.id === conversationId)?.title || "New chat";

  function resizeTextarea(el: HTMLTextAreaElement | null) {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, TEXTAREA_MAX_HEIGHT)}px`;
  }

  async function loadConversations() {
    try {
      const res = await fetch("/api/brain/conversations");
      const data = await res.json();
      if (res.ok) setConversations(data.conversations || []);
    } catch {
      // Sidebar list failing to load shouldn't block using the chat itself.
    }
  }

  useEffect(() => {
    loadConversations();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  useEffect(() => {
    resizeTextarea(textareaRef.current);
    // Only needs to run once, for a prefilled initialInput (e.g. "Prep this
    // call" from the pipeline) — resizeTextarea itself handles later typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openConversation(id: string) {
    if (id === conversationId) return;
    setLoadingThread(true);
    setError("");
    try {
      const res = await fetch(`/api/brain/conversations/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't load that conversation.");
      setConversationId(id);
      setMessages((data.messages || []).map((m: { role: "user" | "assistant"; content: string; attachment_names?: string[] }) => ({
        role: m.role,
        content: m.content,
        attachmentNames: m.attachment_names,
      })));
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

  async function handleFilesSelected(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError("");
    const room = MAX_ATTACHMENTS_PER_MESSAGE - attachments.length;
    const picked = Array.from(files).slice(0, Math.max(room, 0));
    if (picked.length < files.length) setError(`Only ${MAX_ATTACHMENTS_PER_MESSAGE} attachments per message.`);

    for (const file of picked) {
      if (!isAllowedAttachmentType(file.type)) {
        setError(`"${file.name}" isn't a supported file type (PDF, image, or text).`);
        continue;
      }
      if (file.size > MAX_ATTACHMENT_BYTES) {
        setError(`"${file.name}" is too big (max ${Math.floor(MAX_ATTACHMENT_BYTES / 1024 / 1024)}MB).`);
        continue;
      }

      const placeholder: PendingAttachment = { url: "", name: file.name, mediaType: file.type, uploading: true };
      setAttachments((a) => [...a, placeholder]);

      try {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/brain/upload", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Upload failed.");
        setAttachments((a) => a.map((x) => (x === placeholder ? { url: data.url, name: data.name, mediaType: data.mediaType, uploading: false } : x)));
      } catch (e) {
        setError(e instanceof Error ? e.message : `Couldn't upload "${file.name}".`);
        setAttachments((a) => a.filter((x) => x !== placeholder));
      }
    }
  }

  function removeAttachment(target: PendingAttachment) {
    setAttachments((a) => a.filter((x) => x !== target));
  }

  // Drag depth counted rather than just on/off — a drag over a child element
  // fires leave-then-enter on the parent, which would otherwise flicker the
  // drop overlay off mid-drag.
  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    if (!Array.from(e.dataTransfer.types).includes("Files")) return;
    dragDepth.current += 1;
    setDragActive(true);
  }
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
  }
  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragActive(false);
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    dragDepth.current = 0;
    setDragActive(false);
    handleFilesSelected(e.dataTransfer.files);
  }

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    if (e.clipboardData.files.length > 0) {
      e.preventDefault();
      handleFilesSelected(e.clipboardData.files);
    }
  }

  async function send() {
    const message = input.trim();
    const readyAttachments = attachments.filter((a) => !a.uploading);
    if ((!message && readyAttachments.length === 0) || sending || attachments.some((a) => a.uploading)) return;
    setInput("");
    setError("");
    setMessages((m) => [...m, { role: "user", content: message || "(attached file, no message)", attachmentNames: readyAttachments.map((a) => a.name) }]);
    setAttachments([]);
    setSending(true);
    requestAnimationFrame(() => resizeTextarea(textareaRef.current));
    try {
      const res = await fetch("/api/brain/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, conversationId, attachments: readyAttachments.map(({ url, name, mediaType }) => ({ url, name, mediaType })) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        return;
      }
      setMessages((m) => [...m, { role: "assistant", content: data.reply }]);
      // The chat route returns 200 even when a proposed action itself
      // failed (e.g. "no matching event found to reschedule", "unknown
      // lead_id") — that's a soft per-draft error alongside a real reply,
      // not a hard request failure, but it still needs to reach Lucky:
      // otherwise the model's reply can claim something happened ("moving
      // the call...") while nothing actually got queued, with no visible
      // sign anything went wrong.
      if (data.error) setError(data.error);
      const isNewConversation = !conversationId;
      if (data.conversationId) setConversationId(data.conversationId);
      if (data.draftCreated) router.refresh();
      if (isNewConversation || data.draftCreated) loadConversations();
    } catch {
      setError("Couldn't reach the brain — try again.");
    } finally {
      setSending(false);
    }
  }

  const canSend = !sending && (!!input.trim() || attachments.length > 0) && !attachments.some((a) => a.uploading);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, flex: 1, minHeight: 0 }}>
      {error && <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", color: "#991b1b", padding: "10px 16px", borderRadius: 10, fontSize: 14 }}>{error}</div>}

      <ApprovalQueue initialDrafts={initialDrafts} />

      <div className="brain-chat-row" style={{ display: "flex", gap: 16, flex: 1, minHeight: 0 }}>
        <div className="brain-chat-sidebar" style={{ width: 240, flexShrink: 0, background: L.panel, border: `1px solid ${L.border}`, borderRadius: 14, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: 12 }}>
            <button
              onClick={startNewChat}
              style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", padding: "9px 12px", background: "#fff", border: `1px solid ${L.border}`, borderRadius: 10, fontSize: 12.5, fontWeight: 700, color: L.text, cursor: "pointer" }}
            >
              <Plus style={{ width: 13, height: 13 }} /> New chat
            </button>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "0 8px 8px" }}>
            {conversations.length === 0 && (
              <p style={{ fontSize: 11.5, color: L.dimmed, padding: "6px 8px" }}>No past chats yet.</p>
            )}
            {conversations.map((c) => (
              <div
                key={c.id}
                onClick={() => openConversation(c.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", cursor: "pointer", fontSize: 12, borderRadius: 8, marginBottom: 2,
                  background: c.id === conversationId ? "#fff" : "transparent",
                  boxShadow: c.id === conversationId ? `0 0 0 1px ${L.border}` : "none",
                }}
              >
                <MessageSquare style={{ width: 12, height: 12, color: L.dimmed, flexShrink: 0 }} />
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: L.text }}>{c.title}</span>
                <button
                  onClick={(e) => deleteConversation(c.id, e)}
                  title="Delete"
                  style={{ display: "flex", border: "none", background: "none", cursor: "pointer", padding: 2, color: L.dimmed, flexShrink: 0 }}
                >
                  <Trash2 style={{ width: 11, height: 11 }} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          style={{
            flex: 1, background: L.surface, borderRadius: 14, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, position: "relative",
            border: `1px solid ${dragActive ? "var(--accent)" : L.border}`,
          }}
        >
          <div style={{ padding: "14px 22px", borderBottom: `1px solid ${L.border}`, fontSize: 14, fontWeight: 800, color: L.text }}>
            {activeTitle}
          </div>

          {dragActive && (
            <div style={{ position: "absolute", inset: 0, background: "rgba(59,130,246,0.06)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1, pointerEvents: "none", borderRadius: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff", border: `1px solid var(--accent)`, borderRadius: 10, padding: "10px 18px", fontSize: 13, fontWeight: 700, color: L.text }}>
                <Paperclip style={{ width: 14, height: 14 }} /> Drop to attach
              </div>
            </div>
          )}

          <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "24px 28px", display: "flex", flexDirection: "column", gap: 20 }}>
            {loadingThread && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, color: L.dimmed, fontSize: 12.5 }}>
                <Loader2 style={{ width: 13, height: 13, animation: "spin 1s linear infinite" }} /> Loading…
              </div>
            )}
            {!loadingThread && messages.length === 0 && (
              <p style={{ fontSize: 13.5, color: L.dimmed, maxWidth: 480 }}>Ask about the pipeline, automations, or your Google Docs — attach a PDF or image with the paperclip, or ask it to draft a follow-up for a specific lead.</p>
            )}
            {!loadingThread && messages.map((m, i) => (
              m.role === "user" ? (
                <div key={i} style={{ alignSelf: "flex-end", maxWidth: "78%" }}>
                  {!!m.attachmentNames?.length && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 5, justifyContent: "flex-end" }}>
                      {m.attachmentNames.map((name, j) => (
                        <span key={j} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: L.muted, background: L.panel, border: `1px solid ${L.border}`, borderRadius: 8, padding: "3px 8px" }}>
                          <FileText style={{ width: 11, height: 11 }} /> {name}
                        </span>
                      ))}
                    </div>
                  )}
                  <div style={{ padding: "11px 16px", fontSize: 13.5, lineHeight: 1.55, whiteSpace: "pre-wrap", background: L.panel, color: L.text, borderRadius: 16, borderBottomRightRadius: 4 }}>
                    {m.content}
                  </div>
                </div>
              ) : (
                <div key={i} style={{ alignSelf: "flex-start", maxWidth: "88%", fontSize: 13.5, color: L.text }}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{m.content}</ReactMarkdown>
                </div>
              )
            ))}
            {sending && (
              <div style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 6, color: L.dimmed, fontSize: 12.5 }}>
                <Loader2 style={{ width: 13, height: 13, animation: "spin 1s linear infinite" }} /> Thinking…
              </div>
            )}
          </div>

          <div style={{ padding: "0 22px 18px" }}>
            {attachments.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                {attachments.map((a, i) => (
                  <span key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: L.text, background: L.panel, border: `1px solid ${L.border}`, borderRadius: 8, padding: "4px 8px 4px 10px" }}>
                    {a.mediaType.startsWith("image/") ? <ImageIcon style={{ width: 12, height: 12 }} /> : <FileText style={{ width: 12, height: 12 }} />}
                    {a.name}
                    {a.uploading ? <Loader2 style={{ width: 11, height: 11, animation: "spin 1s linear infinite" }} /> : (
                      <button onClick={() => removeAttachment(a)} style={{ display: "flex", border: "none", background: "none", cursor: "pointer", padding: 0, color: L.muted }}>
                        <X style={{ width: 12, height: 12 }} />
                      </button>
                    )}
                  </span>
                ))}
              </div>
            )}

            <div style={{ display: "flex", alignItems: "flex-end", gap: 4, border: `1px solid ${L.border}`, borderRadius: 22, padding: "6px 8px 6px 8px", background: "#fff" }}>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.txt,.md,.csv,.json,application/pdf,image/*,text/plain,text/markdown,text/csv,application/json"
                onChange={(e) => { handleFilesSelected(e.target.files); e.target.value = ""; }}
                style={{ display: "none" }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={sending || attachments.length >= MAX_ATTACHMENTS_PER_MESSAGE}
                title="Attach a file"
                style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, flexShrink: 0, borderRadius: "50%", border: "none", background: "transparent", color: L.muted, cursor: sending ? "default" : "pointer" }}
              >
                <Paperclip style={{ width: 16, height: 16 }} />
              </button>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => { setInput(e.target.value); resizeTextarea(e.target); }}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                onPaste={handlePaste}
                placeholder="Write a message…"
                rows={1}
                style={{
                  flex: 1, border: "none", padding: "8px 4px", fontSize: 13.5, outline: "none",
                  resize: "none", fontFamily: "inherit", lineHeight: 1.4, maxHeight: TEXTAREA_MAX_HEIGHT, overflowY: "auto", background: "transparent",
                }}
              />
              <button
                onClick={send}
                disabled={!canSend}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, flexShrink: 0, borderRadius: "50%", border: "none",
                  background: canSend ? "var(--accent)" : "#e5e7eb", color: "#fff", cursor: canSend ? "pointer" : "default",
                }}
              >
                <ArrowUp style={{ width: 16, height: 16 }} />
              </button>
            </div>
            <p style={{ textAlign: "center", fontSize: 10.5, color: L.dimmed, margin: "8px 0 0" }}>
              The Brain can make mistakes — double check anything before approving it.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
