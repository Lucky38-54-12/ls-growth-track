"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Topbar from "@/components/Topbar";
import { Send } from "lucide-react";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };

interface Faq {
  question: string;
  answer: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface Lead {
  id: string;
  outcome: string;
  score: number | null;
  booking_status: string | null;
  contact_email: string | null;
  created_at: string;
  lq_conversations: { extracted_fields: Record<string, unknown> } | null;
}

const OUTCOME_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  qualified: { bg: "#f0fdf4", color: "#15803d", label: "Interested — qualified" },
  nurture: { bg: "#fffbeb", color: "#b45309", label: "Interested — not ready yet" },
  disqualified: { bg: "#fef2f2", color: "#b91c1c", label: "Not interested" },
};

export default function ClientDetailPage() {
  return (
    <Suspense fallback={null}>
      <ClientDetailPageInner />
    </Suspense>
  );
}

function ClientDetailPageInner() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const fbPending = searchParams.get("fbPending");

  const [fbPages, setFbPages] = useState<{ id: string; name: string }[]>([]);
  const [fbConnecting, setFbConnecting] = useState(false);
  const [fbError, setFbError] = useState<string | null>(null);
  const [fbConnected, setFbConnected] = useState(false);

  useEffect(() => {
    if (!fbPending) return;
    fetch(`/api/lead-qual/oauth/facebook/pending/${fbPending}`)
      .then((r) => r.json())
      .then((body) => {
        if (body.pages) setFbPages(body.pages);
        else setFbError(body.error || "Could not load Facebook Pages");
      });
  }, [fbPending]);

  async function handleChoosePage(pageId: string) {
    setFbConnecting(true);
    setFbError(null);
    const res = await fetch("/api/lead-qual/oauth/facebook/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pendingId: fbPending, clientId: id, pageId }),
    });
    const body = await res.json();
    setFbConnecting(false);
    if (!res.ok) {
      setFbError(body.error);
      return;
    }
    setFbPages([]);
    setFbConnected(true);
  }

  const [description, setDescription] = useState("");
  const [services, setServices] = useState("");
  const [serviceAreas, setServiceAreas] = useState("");
  const [responseCommitment, setResponseCommitment] = useState("");
  const [proofPoint, setProofPoint] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [extraContext, setExtraContext] = useState("");
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [rulesJson, setRulesJson] = useState("[]");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [chatBusy, setChatBusy] = useState(false);
  const [lastResult, setLastResult] = useState<{ status: string; outcome?: string; bookingStatus?: string; extractedFields: Record<string, unknown> } | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(true);

  function loadLeads() {
    setLeadsLoading(true);
    fetch(`/api/lead-qual/clients/${id}/leads`)
      .then((r) => r.json())
      .then(({ leads }) => {
        setLeads(leads || []);
        setLeadsLoading(false);
      });
  }

  useEffect(() => {
    fetch(`/api/lead-qual/clients/${id}/config`)
      .then((r) => r.json())
      .then(({ config }) => {
        setDescription(config.business_info?.description || "");
        setResponseCommitment(config.business_info?.response_commitment || "");
        setProofPoint(config.business_info?.proof_point || "");
        setWebsiteUrl(config.business_info?.website_url || "");
        setExtraContext(config.business_info?.extra_context || "");
        setServices((config.services || []).join(", "));
        setServiceAreas((config.service_areas || []).join(", "));
        setFaqs(config.faqs?.length ? config.faqs : [{ question: "", answer: "" }]);
        setRulesJson(JSON.stringify(config.qualification_rules || [], null, 2));
        setLoading(false);
      });
    loadLeads();
  }, [id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSaveConfig() {
    setSaving(true);
    setSaveError(null);
    let parsedRules;
    try {
      parsedRules = JSON.parse(rulesJson);
    } catch {
      setSaveError("Qualification rules must be valid JSON");
      setSaving(false);
      return;
    }

    const res = await fetch(`/api/lead-qual/clients/${id}/config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        business_info: {
          description,
          response_commitment: responseCommitment,
          proof_point: proofPoint,
          website_url: websiteUrl,
          extra_context: extraContext,
        },
        services: services.split(",").map((s) => s.trim()).filter(Boolean),
        service_areas: serviceAreas.split(",").map((s) => s.trim()).filter(Boolean),
        faqs: faqs.filter((f) => f.question.trim() || f.answer.trim()),
        qualification_rules: parsedRules,
      }),
    });
    const body = await res.json();
    if (!res.ok) setSaveError(body.error);
    setSaving(false);
  }

  async function handleSendChat(e: React.FormEvent) {
    e.preventDefault();
    if (!chatInput.trim() || chatBusy) return;
    const userMessage = chatInput.trim();
    setMessages((m) => [...m, { role: "user", content: userMessage }]);
    setChatInput("");
    setChatBusy(true);

    const res = await fetch("/api/lead-qual/playground", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: id, conversationId, message: userMessage }),
    });
    const body = await res.json();
    setChatBusy(false);

    if (!res.ok) {
      setMessages((m) => [...m, { role: "assistant", content: `[error: ${body.error}]` }]);
      return;
    }
    setConversationId(body.conversationId);
    setMessages((m) => [...m, { role: "assistant", content: body.reply }]);
    setLastResult({ status: body.status, outcome: body.outcome, bookingStatus: body.bookingStatus, extractedFields: body.extractedFields });
    if (body.outcome) loadLeads();
  }

  function resetChat() {
    setMessages([]);
    setConversationId(null);
    setLastResult(null);
  }

  if (loading) return <div style={{ padding: 40, color: L.dimmed, fontSize: 13 }}>Loading…</div>;

  return (
    <div style={{ background: "#f1f5f9", minHeight: "100vh" }}>
      <Topbar title="Client Config" subtitle="Edit business info + test the AI qualifier before going live" />

      {fbPages.length > 0 && (
        <div style={{ margin: "20px 28px 0", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: 16 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: "#92400e", marginBottom: 8 }}>
            Which Facebook Page should send leads to this client?
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {fbPages.map((page) => (
              <button
                key={page.id}
                onClick={() => handleChoosePage(page.id)}
                disabled={fbConnecting}
                style={{ background: "#fff", border: "1px solid #fde68a", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              >
                {page.name}
              </button>
            ))}
          </div>
        </div>
      )}
      {fbError && (
        <div style={{ margin: "20px 28px 0", background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", padding: "10px 14px", fontSize: 13, borderRadius: 8 }}>
          {fbError}
        </div>
      )}
      {fbConnected && (
        <div style={{ margin: "20px 28px 0", background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#15803d", padding: "10px 14px", fontSize: 13, borderRadius: 8 }}>
          Facebook Page connected — Messenger leads for this page will now flow into this client&apos;s AI qualifier.
        </div>
      )}

      <div style={{ padding: "20px 28px 60px", display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
        {/* Config editor */}
        <div style={{ flex: "1 1 380px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 10, padding: 18 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: L.muted, marginBottom: 6 }}>BUSINESS DESCRIPTION</p>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. residential and commercial electrician based in Auckland"
              rows={2}
              style={{ width: "100%", padding: "8px 10px", fontSize: 13, border: `1px solid ${L.border}`, borderRadius: 8, fontFamily: "inherit" }}
            />

            <p style={{ fontSize: 12, fontWeight: 700, color: L.muted, margin: "14px 0 6px" }}>
              WEBSITE URL (pulled in automatically as context for the AI)
            </p>
            <input
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://theirbusiness.co.nz"
              style={{ width: "100%", padding: "8px 10px", fontSize: 13, border: `1px solid ${L.border}`, borderRadius: 8 }}
            />

            <p style={{ fontSize: 12, fontWeight: 700, color: L.muted, margin: "14px 0 6px" }}>
              ADDITIONAL CONTEXT (anything else the AI should know — promos, policies, quirks)
            </p>
            <textarea
              value={extraContext}
              onChange={(e) => setExtraContext(e.target.value)}
              placeholder="e.g. we don't do jobs under $200, currently booked out 2 weeks for anything outside Queenstown CBD"
              rows={3}
              style={{ width: "100%", padding: "8px 10px", fontSize: 13, border: `1px solid ${L.border}`, borderRadius: 8, fontFamily: "inherit" }}
            />

            <p style={{ fontSize: 12, fontWeight: 700, color: L.muted, margin: "14px 0 6px" }}>SERVICES (comma separated)</p>
            <input
              value={services}
              onChange={(e) => setServices(e.target.value)}
              placeholder="heat pumps, switchboard upgrades, LED lighting"
              style={{ width: "100%", padding: "8px 10px", fontSize: 13, border: `1px solid ${L.border}`, borderRadius: 8 }}
            />

            <p style={{ fontSize: 12, fontWeight: 700, color: L.muted, margin: "14px 0 6px" }}>SERVICE AREAS (comma separated)</p>
            <input
              value={serviceAreas}
              onChange={(e) => setServiceAreas(e.target.value)}
              placeholder="Auckland CBD, North Shore, West Auckland"
              style={{ width: "100%", padding: "8px 10px", fontSize: 13, border: `1px solid ${L.border}`, borderRadius: 8 }}
            />

            <p style={{ fontSize: 12, fontWeight: 700, color: L.muted, margin: "14px 0 6px" }}>
              RESPONSE COMMITMENT (used to close the chat with urgency — be specific)
            </p>
            <input
              value={responseCommitment}
              onChange={(e) => setResponseCommitment(e.target.value)}
              placeholder="e.g. within 30 minutes, or by end of day"
              style={{ width: "100%", padding: "8px 10px", fontSize: 13, border: `1px solid ${L.border}`, borderRadius: 8 }}
            />

            <p style={{ fontSize: 12, fontWeight: 700, color: L.muted, margin: "14px 0 6px" }}>
              PROOF POINT (optional — a stat/result the AI can drop in naturally)
            </p>
            <input
              value={proofPoint}
              onChange={(e) => setProofPoint(e.target.value)}
              placeholder="e.g. we've done 40+ deep cleans in Queenstown this year"
              style={{ width: "100%", padding: "8px 10px", fontSize: 13, border: `1px solid ${L.border}`, borderRadius: 8 }}
            />

            <p style={{ fontSize: 12, fontWeight: 700, color: L.muted, margin: "14px 0 6px" }}>FAQs</p>
            {faqs.map((faq, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
                <input
                  value={faq.question}
                  onChange={(e) => setFaqs((f) => f.map((x, j) => (j === i ? { ...x, question: e.target.value } : x)))}
                  placeholder="Question"
                  style={{ padding: "6px 10px", fontSize: 12.5, border: `1px solid ${L.border}`, borderRadius: 8 }}
                />
                <input
                  value={faq.answer}
                  onChange={(e) => setFaqs((f) => f.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)))}
                  placeholder="Answer"
                  style={{ padding: "6px 10px", fontSize: 12.5, border: `1px solid ${L.border}`, borderRadius: 8 }}
                />
              </div>
            ))}
            <button
              onClick={() => setFaqs((f) => [...f, { question: "", answer: "" }])}
              style={{ fontSize: 12, color: "var(--red)", background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}
            >
              + Add FAQ
            </button>

            <p style={{ fontSize: 12, fontWeight: 700, color: L.muted, margin: "14px 0 6px" }}>
              QUALIFICATION RULES (advanced — JSON)
            </p>
            <textarea
              value={rulesJson}
              onChange={(e) => setRulesJson(e.target.value)}
              rows={8}
              style={{ width: "100%", padding: "8px 10px", fontSize: 11.5, fontFamily: "monospace", border: `1px solid ${L.border}`, borderRadius: 8 }}
            />

            {saveError && <p style={{ color: "#b91c1c", fontSize: 12.5, marginTop: 8 }}>{saveError}</p>}
            <button
              onClick={handleSaveConfig}
              disabled={saving}
              style={{ marginTop: 12, background: "var(--red)", color: "#fff", border: "none", padding: "8px 16px", fontSize: 13, fontWeight: 700, borderRadius: 8, cursor: "pointer" }}
            >
              {saving ? "Saving…" : "Save config"}
            </button>
          </div>
        </div>

        {/* Test chat */}
        <div style={{ flex: "1 1 340px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 10, display: "flex", flexDirection: "column", height: 480 }}>
            <div style={{ padding: "10px 14px", borderBottom: `1px solid ${L.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: L.text }}>Test chat — pretend to be a lead</span>
              <button onClick={resetChat} style={{ fontSize: 11.5, color: L.muted, background: "none", border: "none", cursor: "pointer" }}>Reset</button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
              {messages.length === 0 && (
                <p style={{ fontSize: 12.5, color: L.dimmed }}>Send a message as if you were a lead who just messaged in about a job — e.g. &quot;hey do you do heat pump installs?&quot;</p>
              )}
              {messages.map((m, i) => (
                <div
                  key={i}
                  style={{
                    alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                    background: m.role === "user" ? "var(--red)" : "#f1f5f9",
                    color: m.role === "user" ? "#fff" : L.text,
                    padding: "8px 12px", borderRadius: 12, fontSize: 13, maxWidth: "85%",
                  }}
                >
                  {m.content}
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <form onSubmit={handleSendChat} style={{ display: "flex", gap: 8, padding: 10, borderTop: `1px solid ${L.border}` }}>
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Type a message…"
                disabled={chatBusy}
                style={{ flex: 1, padding: "8px 12px", fontSize: 13, border: `1px solid ${L.border}`, borderRadius: 8 }}
              />
              <button
                type="submit"
                disabled={chatBusy}
                style={{ background: "var(--red)", color: "#fff", border: "none", width: 36, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
              >
                <Send style={{ width: 14, height: 14 }} />
              </button>
            </form>
          </div>

          {lastResult && (
            <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 10, padding: 14, fontSize: 12.5 }}>
              <p><strong>Status:</strong> {lastResult.status}</p>
              {lastResult.outcome && <p><strong>Outcome:</strong> {lastResult.outcome}</p>}
              {lastResult.bookingStatus && <p><strong>Booking:</strong> {lastResult.bookingStatus}</p>}
              <p><strong>Extracted so far:</strong> {JSON.stringify(lastResult.extractedFields)}</p>
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: "0 28px 60px" }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: L.text, marginBottom: 10 }}>Leads</h2>
        {leadsLoading ? (
          <p style={{ fontSize: 13, color: L.dimmed }}>Loading…</p>
        ) : leads.length === 0 ? (
          <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 10, padding: 24, textAlign: "center", color: L.dimmed, fontSize: 13 }}>
            No leads yet — they'll show up here as conversations get qualified.
          </div>
        ) : (
          <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 10, overflow: "hidden" }}>
            {leads.map((lead) => {
              const style = OUTCOME_STYLE[lead.outcome] || { bg: "#f1f5f9", color: L.muted, label: lead.outcome };
              const fields = lead.lq_conversations?.extracted_fields || {};
              return (
                <div key={lead.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: `1px solid ${L.border}`, gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: L.text }}>
                      {String(fields.job_type || "Job type unknown")} — {String(fields.location || "location unknown")}
                    </p>
                    <p style={{ fontSize: 11.5, color: L.muted }}>
                      {lead.contact_email || "no email captured"} · {new Date(lead.created_at).toLocaleString()}
                      {lead.outcome === "qualified" && lead.booking_status && ` · booking: ${lead.booking_status}`}
                    </p>
                  </div>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: style.color, background: style.bg, padding: "4px 10px", borderRadius: 20, flexShrink: 0 }}>
                    {style.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
