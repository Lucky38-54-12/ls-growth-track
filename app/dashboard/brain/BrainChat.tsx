"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send, Check, X, Loader2 } from "lucide-react";
import { ChatDraft } from "./page";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };

const KIND_LABEL: Record<string, string> = {
  email: "Draft email",
  note: "Draft note",
  lead_update: "Update lead",
  calendar_booking: "Book meeting",
  sheet_update: "Update sheet",
};

const APPROVE_LABEL: Record<string, string> = {
  email: "Approve & send",
  calendar_booking: "Approve & book",
  sheet_update: "Approve & update",
};

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export default function BrainChat({ initialDrafts }: { initialDrafts: ChatDraft[] }) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [drafts, setDrafts] = useState(initialDrafts);
  const [busyDraftId, setBusyDraftId] = useState<string | null>(null);

  async function send() {
    const message = input.trim();
    if (!message || sending) return;
    setInput("");
    setError("");
    const history = messages;
    setMessages([...history, { role: "user", content: message }]);
    setSending(true);
    try {
      const res = await fetch("/api/brain/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        return;
      }
      setMessages((m) => [...m, { role: "assistant", content: data.reply }]);
      if (data.draftCreated) router.refresh();
    } catch {
      setError("Couldn't reach the brain — try again.");
    } finally {
      setSending(false);
    }
  }

  async function decide(draftId: string, decision: "approved" | "rejected") {
    setBusyDraftId(draftId);
    setError("");
    try {
      const res = await fetch(`/api/brain/drafts/${draftId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Couldn't apply that decision.");
        return;
      }
      setDrafts((d) => d.filter((x) => x.id !== draftId));
    } catch {
      setError("Couldn't apply that decision.");
    } finally {
      setBusyDraftId(null);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {error && <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", color: "#991b1b", padding: "10px 16px", fontSize: 14 }}>{error}</div>}

      {drafts.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {drafts.map((d) => (
            <div key={d.id} style={{ background: "#fffbeb", border: "1px solid #fde68a", padding: 20 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "#92400e" }}>
                  {KIND_LABEL[d.kind] || "Draft"}{d.lead ? ` · ${d.lead.company}` : ""}
                </div>
              </div>
              <p style={{ fontSize: 13.5, fontWeight: 700, color: L.text, marginBottom: 6 }}>{d.title}</p>
              <div style={{ fontSize: 13, color: L.text, whiteSpace: "pre-wrap", lineHeight: 1.6, background: "#fff", border: `1px solid ${L.border}`, padding: 12, marginBottom: 14 }}>
                {d.content.replace(/<[^>]+>/g, "\n").replace(/\n{2,}/g, "\n").trim()}
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={() => decide(d.id, "approved")}
                  disabled={busyDraftId === d.id}
                  className="btn-lift"
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", background: "#16a34a", color: "#fff", border: "none", fontSize: 12.5, fontWeight: 700, cursor: busyDraftId === d.id ? "default" : "pointer" }}
                >
                  <Check style={{ width: 13, height: 13 }} /> {APPROVE_LABEL[d.kind] || "Approve"}
                </button>
                <button
                  onClick={() => decide(d.id, "rejected")}
                  disabled={busyDraftId === d.id}
                  className="btn-lift"
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", background: "#fff", color: L.muted, border: `1px solid ${L.border}`, fontSize: 12.5, fontWeight: 700, cursor: busyDraftId === d.id ? "default" : "pointer" }}
                >
                  <X style={{ width: 13, height: 13 }} /> Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ background: L.surface, border: `1px solid ${L.border}`, display: "flex", flexDirection: "column", height: 560 }}>
        <div style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          {messages.length === 0 && (
            <p style={{ fontSize: 13, color: L.dimmed }}>Ask about the pipeline, automations, or your Google Docs — or ask it to draft a follow-up for a specific lead.</p>
          )}
          {messages.map((m, i) => (
            <div key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "80%" }}>
              <div style={{
                padding: "10px 14px", fontSize: 13.5, lineHeight: 1.55, whiteSpace: "pre-wrap",
                background: m.role === "user" ? "var(--accent)" : "#f1f5f9",
                color: m.role === "user" ? "#fff" : L.text,
              }}>
                {m.content}
              </div>
            </div>
          ))}
          {sending && (
            <div style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 6, color: L.dimmed, fontSize: 12.5 }}>
              <Loader2 style={{ width: 13, height: 13, animation: "spin 1s linear infinite" }} /> Thinking…
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 10, padding: 16, borderTop: `1px solid ${L.border}` }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Ask the brain something…"
            style={{ flex: 1, border: `1px solid ${L.border}`, padding: "10px 12px", fontSize: 13.5, outline: "none" }}
          />
          <button
            onClick={send}
            disabled={sending || !input.trim()}
            className="btn-lift"
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 18px", background: "var(--accent)", color: "#fff", border: "none", fontSize: 13, fontWeight: 700, cursor: sending || !input.trim() ? "default" : "pointer" }}
          >
            <Send style={{ width: 14, height: 14 }} /> Send
          </button>
        </div>
      </div>
    </div>
  );
}
