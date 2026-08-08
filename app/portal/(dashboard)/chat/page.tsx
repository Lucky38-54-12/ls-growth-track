"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Send, Sparkles } from "lucide-react";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b" };

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "How many leads came in this week?",
  "What's booked this week?",
  "Any leads I still need to follow up?",
];

function ChatInput({
  input,
  setInput,
  sending,
  onSend,
  large,
}: {
  input: string;
  setInput: (v: string) => void;
  sending: boolean;
  onSend: () => void;
  large?: boolean;
}) {
  return (
    <div
      style={{
        background: "#f8fafc",
        border: `1px solid ${L.border}`,
        borderRadius: 14,
        padding: large ? "18px 20px 14px" : "14px 16px 10px",
        boxShadow: large ? "0 1px 3px rgba(15, 23, 42, 0.06)" : "none",
      }}
    >
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSend();
          }
        }}
        placeholder="How can I help? Ask about your leads or pipeline…"
        rows={large ? 2 : 1}
        style={{
          width: "100%",
          resize: "none",
          border: "none",
          outline: "none",
          background: "transparent",
          fontSize: large ? 16 : 14,
          color: L.text,
          fontFamily: "inherit",
        }}
      />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
        <span style={{ fontSize: 12, color: "#94a3b8" }}>Answers come from your own leads and pipeline data.</span>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Mic style={{ width: 16, height: 16, color: "#94a3b8" }} />
          <button
            type="button"
            onClick={onSend}
            disabled={sending || !input.trim()}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34,
              color: "#fff", background: "var(--red)", border: "none", borderRadius: "50%",
              cursor: sending || !input.trim() ? "not-allowed" : "pointer", opacity: sending || !input.trim() ? 0.5 : 1,
            }}
          >
            <Send style={{ width: 15, height: 15 }} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PortalChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  async function sendMessage(text: string) {
    if (!text.trim() || sending) return;

    const next = [...messages, { role: "user" as const, content: text.trim() }];
    setMessages(next);
    setInput("");
    setSending(true);
    setError(null);

    try {
      const r = await fetch("/api/portal/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const body = await r.json();
      if (body.error) {
        setError(body.error);
        return;
      }
      setMessages((prev) => [...prev, { role: "assistant", content: body.reply }]);
    } catch {
      setError("Something went wrong sending that. Try again.");
    } finally {
      setSending(false);
    }
  }

  const started = messages.length > 0;

  if (!started) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
        <div className="portal-header-pad" style={{ background: "#fff", borderBottom: `1px solid ${L.border}`, padding: "18px 28px" }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: L.text }}>Chat</h1>
          <p style={{ fontSize: 13, color: L.muted }}>Ask about your leads and pipeline, in plain English.</p>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 28 }}>
          <div style={{ width: "100%", maxWidth: 620 }}>
            <div style={{ textAlign: "center", marginBottom: 22 }}>
              <div
                style={{
                  width: 44, height: 44, borderRadius: "50%", background: "var(--red)", display: "flex",
                  alignItems: "center", justifyContent: "center", margin: "0 auto 14px",
                }}
              >
                <Sparkles style={{ width: 20, height: 20, color: "#fff" }} />
              </div>
              <p style={{ fontSize: 15, fontWeight: 700, color: L.text }}>What do you want to know?</p>
            </div>

            <ChatInput input={input} setInput={setInput} sending={sending} onSend={() => sendMessage(input)} large />

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginTop: 16 }}>
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => sendMessage(s)}
                  style={{
                    fontSize: 12.5, color: L.muted, background: "#fff", border: `1px solid ${L.border}`,
                    borderRadius: 20, padding: "7px 14px", cursor: "pointer",
                  }}
                >
                  {s}
                </button>
              ))}
            </div>

            {error && <p style={{ fontSize: 13, color: "#b91c1c", textAlign: "center", marginTop: 14 }}>{error}</p>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <div className="portal-header-pad" style={{ background: "#fff", borderBottom: `1px solid ${L.border}`, padding: "18px 28px" }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: L.text }}>Chat</h1>
        <p style={{ fontSize: 13, color: L.muted }}>Ask about your leads and pipeline, in plain English.</p>
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "20px 28px", display: "flex", flexDirection: "column", gap: 14 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
            <div
              style={{
                maxWidth: 560,
                padding: "10px 14px",
                fontSize: 14,
                lineHeight: 1.5,
                whiteSpace: "pre-wrap",
                background: m.role === "user" ? "var(--red)" : L.surface,
                color: m.role === "user" ? "#fff" : L.text,
                border: m.role === "user" ? "none" : `1px solid ${L.border}`,
                borderRadius: 4,
              }}
            >
              {m.role === "assistant" && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, color: L.muted, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  <Sparkles style={{ width: 12, height: 12 }} /> Assistant
                </div>
              )}
              {m.content}
            </div>
          </div>
        ))}
        {sending && (
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <div style={{ padding: "10px 14px", fontSize: 14, color: L.muted, background: L.surface, border: `1px solid ${L.border}`, borderRadius: 4 }}>
              Thinking…
            </div>
          </div>
        )}
        {error && <p style={{ fontSize: 13, color: "#b91c1c" }}>{error}</p>}
      </div>

      <div style={{ padding: "16px 28px", borderTop: `1px solid ${L.border}`, background: "#fff" }}>
        <ChatInput input={input} setInput={setInput} sending={sending} onSend={() => sendMessage(input)} />
      </div>
    </div>
  );
}
