"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Topbar from "@/components/Topbar";
import { Send, Sparkles } from "lucide-react";

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

const QUALITY_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  qualified: { bg: "#f0fdf4", color: "#15803d", label: "HIGH" },
  nurture: { bg: "#fffbeb", color: "#b45309", label: "MEDIUM" },
  disqualified: { bg: "#fef2f2", color: "#b91c1c", label: "LOW" },
  needs_human: { bg: "#eff6ff", color: "#1d4ed8", label: "NEEDS REVIEW" },
};

function qualityFromOutcome(outcome: string) {
  return QUALITY_STYLE[outcome] || { bg: "#f1f5f9", color: "#64748b", label: outcome.toUpperCase() };
}

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

  const [backfilling, setBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState<string | null>(null);
  const [backfillError, setBackfillError] = useState<string | null>(null);

  async function handleBackfillLeads() {
    setBackfilling(true);
    setBackfillError(null);
    setBackfillResult(null);
    try {
      const res = await fetch(`/api/lead-qual/clients/${id}/backfill-leads`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        setBackfillError(body.error || "Backfill failed");
        return;
      }
      setBackfillResult(
        `Checked ${body.formsFound} form(s), found ${body.leadsFound} lead(s) — imported ${body.leadsImported}, already had ${body.leadsSkipped}.`
      );
      loadLeads();
    } catch {
      setBackfillError("Something went wrong running the backfill.");
    } finally {
      setBackfilling(false);
    }
  }

  const [description, setDescription] = useState("");
  const [services, setServices] = useState("");
  const [serviceAreas, setServiceAreas] = useState("");
  const [responseCommitment, setResponseCommitment] = useState("");
  const [proofPoint, setProofPoint] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [extraContext, setExtraContext] = useState("");
  const [pricing, setPricing] = useState("");
  const [competitors, setCompetitors] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [rulesJson, setRulesJson] = useState("[]");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [autofilling, setAutofilling] = useState(false);
  const [autofillError, setAutofillError] = useState<string | null>(null);
  const [autofillingSite, setAutofillingSite] = useState(false);
  const [autofillSiteError, setAutofillSiteError] = useState<string | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [chatBusy, setChatBusy] = useState(false);
  const [lastResult, setLastResult] = useState<{ status: string; outcome?: string; bookingStatus?: string; extractedFields: Record<string, unknown> } | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(true);

  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState("");
  const [analyzeResult, setAnalyzeResult] = useState<{ inserted: number; recommendations: { title: string; priority: number }[] } | null>(null);

  async function analyzePerformance() {
    setAnalyzing(true);
    setAnalyzeError("");
    setAnalyzeResult(null);
    try {
      const res = await fetch("/api/performance-brain/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: id }),
      });
      const data = await res.json();
      if (!res.ok) { setAnalyzeError(data.error || "Failed to analyze performance."); return; }
      setAnalyzeResult({ inserted: data.inserted, recommendations: data.recommendations || [] });
    } catch {
      setAnalyzeError("Failed to analyze performance.");
    } finally {
      setAnalyzing(false);
    }
  }

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
        setPricing(config.business_info?.pricing || "");
        setCompetitors(config.business_info?.competitors || "");
        setTargetAudience(config.business_info?.target_audience || "");
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
          pricing,
          competitors,
          target_audience: targetAudience,
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

  // Drafts description/services/service_areas/faqs/extra_context from the
  // client's connected Facebook Page and drops them into the form fields for
  // review — nothing is saved until the human clicks "Save config" below.
  async function handleAutofill() {
    setAutofilling(true);
    setAutofillError(null);
    const res = await fetch(`/api/lead-qual/clients/${id}/autofill`, { method: "POST" });
    const body = await res.json();
    setAutofilling(false);
    if (!res.ok) {
      setAutofillError(body.error);
      return;
    }
    const draft = body.draft;
    setDescription(draft.description || "");
    setServices((draft.services || []).join(", "));
    setServiceAreas((draft.service_areas || []).join(", "));
    setFaqs(draft.faqs?.length ? draft.faqs : [{ question: "", answer: "" }]);
    setExtraContext(draft.extra_context || "");
  }

  // Same idea as handleAutofill, but scrapes the website URL typed into the
  // form instead of a connected Facebook Page — this is the primary path
  // since most clients do have a website.
  async function handleAutofillFromWebsite() {
    setAutofillingSite(true);
    setAutofillSiteError(null);
    const res = await fetch(`/api/lead-qual/clients/${id}/autofill-website`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: websiteUrl }),
    });
    const body = await res.json();
    setAutofillingSite(false);
    if (!res.ok) {
      setAutofillSiteError(body.error);
      return;
    }
    const draft = body.draft;
    setDescription(draft.description || "");
    setServices((draft.services || []).join(", "));
    setServiceAreas((draft.service_areas || []).join(", "));
    setFaqs(draft.faqs?.length ? draft.faqs : [{ question: "", answer: "" }]);
    setExtraContext(draft.extra_context || "");
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
    if (body.reply) {
      setMessages((m) => [...m, { role: "assistant", content: body.reply }]);
    } else {
      setMessages((m) => [...m, { role: "assistant", content: "(no reply — nothing worth responding to)" }]);
    }
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

      <div style={{ margin: "20px 28px 0", background: L.surface, border: `1px solid ${L.border}`, borderRadius: 10, padding: 16, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div>
          <p style={{ fontSize: 13, fontWeight: 700, color: L.text }}>Backfill Facebook Lead Ad submissions</p>
          <p style={{ fontSize: 12, color: L.muted }}>
            Pulls in historical Lead Ad form submissions this client&apos;s connected Page received before now — requires the leads_retrieval permission to be approved.
          </p>
        </div>
        <button
          onClick={handleBackfillLeads}
          disabled={backfilling}
          style={{
            flexShrink: 0, background: backfilling ? L.dimmed : "var(--accent)", color: "#fff", border: "none",
            padding: "8px 16px", fontSize: 12.5, fontWeight: 700, borderRadius: 8, cursor: backfilling ? "default" : "pointer",
          }}
        >
          {backfilling ? "Backfilling…" : "Run backfill"}
        </button>
      </div>
      {backfillResult && (
        <div style={{ margin: "10px 28px 0", background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#15803d", padding: "10px 14px", fontSize: 13, borderRadius: 8 }}>
          {backfillResult}
        </div>
      )}
      {backfillError && (
        <div style={{ margin: "10px 28px 0", background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", padding: "10px 14px", fontSize: 13, borderRadius: 8 }}>
          {backfillError}
        </div>
      )}

      <div style={{ padding: "20px 28px 60px", display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
        {/* Config editor */}
        <div style={{ flex: "1 1 380px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 10, padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <p style={{ fontSize: 12.5, color: L.muted }}>
                No website? Draft this from their connected Facebook Page instead.
              </p>
              <button
                onClick={handleAutofill}
                disabled={autofilling}
                style={{
                  flexShrink: 0, background: autofilling ? L.dimmed : "var(--accent)", color: "#fff", border: "none",
                  padding: "7px 14px", fontSize: 12.5, fontWeight: 700, borderRadius: 8, cursor: autofilling ? "default" : "pointer",
                }}
              >
                {autofilling ? "Drafting…" : "Autofill from Facebook"}
              </button>
            </div>
            {autofillError && <p style={{ color: "#b91c1c", fontSize: 12.5, marginBottom: 14 }}>{autofillError}</p>}
            <p style={{ fontSize: 12, fontWeight: 700, color: L.muted, marginBottom: 6 }}>BUSINESS DESCRIPTION</p>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. residential and commercial electrician based in Auckland"
              rows={2}
              style={{ width: "100%", padding: "8px 10px", fontSize: 13, border: `1px solid ${L.border}`, borderRadius: 8, fontFamily: "inherit" }}
            />

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "14px 0 6px" }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: L.muted }}>
                WEBSITE URL (pulled in automatically as context for the AI)
              </p>
              <button
                onClick={handleAutofillFromWebsite}
                disabled={autofillingSite || !websiteUrl.trim()}
                style={{
                  flexShrink: 0, background: autofillingSite || !websiteUrl.trim() ? L.dimmed : "var(--accent)", color: "#fff", border: "none",
                  padding: "5px 12px", fontSize: 11.5, fontWeight: 700, borderRadius: 8, cursor: autofillingSite || !websiteUrl.trim() ? "default" : "pointer",
                }}
              >
                {autofillingSite ? "Drafting…" : "Autofill from Website"}
              </button>
            </div>
            <input
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://theirbusiness.co.nz"
              style={{ width: "100%", padding: "8px 10px", fontSize: 13, border: `1px solid ${L.border}`, borderRadius: 8 }}
            />
            {autofillSiteError && <p style={{ color: "#b91c1c", fontSize: 12.5, marginTop: 6 }}>{autofillSiteError}</p>}

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

            <div style={{ margin: "18px 0 6px", paddingTop: 14, borderTop: `1px solid ${L.border}` }}>
              <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--accent)" }}>Client Marketing Brain</p>
              <p style={{ fontSize: 11.5, color: L.dimmed, marginTop: 2 }}>Persists across every campaign for this client — fill in once, the Brain reads it instead of re-researching from scratch each time.</p>
            </div>

            <p style={{ fontSize: 12, fontWeight: 700, color: L.muted, margin: "14px 0 6px" }}>PRICING &amp; OFFERS</p>
            <textarea
              value={pricing}
              onChange={(e) => setPricing(e.target.value)}
              placeholder="e.g. deep clean $280-450 depending on size, standard clean from $120, avg job value ~$220, 35% margin"
              rows={2}
              style={{ width: "100%", padding: "8px 10px", fontSize: 13, border: `1px solid ${L.border}`, borderRadius: 8, fontFamily: "inherit" }}
            />

            <p style={{ fontSize: 12, fontWeight: 700, color: L.muted, margin: "14px 0 6px" }}>COMPETITORS</p>
            <textarea
              value={competitors}
              onChange={(e) => setCompetitors(e.target.value)}
              placeholder="e.g. Sparkle Clean NZ (undercuts on price), Shine Bright (weak online presence, good for angle gaps)"
              rows={2}
              style={{ width: "100%", padding: "8px 10px", fontSize: 13, border: `1px solid ${L.border}`, borderRadius: 8, fontFamily: "inherit" }}
            />

            <p style={{ fontSize: 12, fontWeight: 700, color: L.muted, margin: "14px 0 6px" }}>TARGET AUDIENCE</p>
            <textarea
              value={targetAudience}
              onChange={(e) => setTargetAudience(e.target.value)}
              placeholder="e.g. homeowners 35-60, dual-income households, prioritize convenience over price"
              rows={2}
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
              style={{ fontSize: 12, color: "var(--accent)", background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}
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
              style={{ marginTop: 12, background: "var(--accent)", color: "#fff", border: "none", padding: "8px 16px", fontSize: 13, fontWeight: 700, borderRadius: 8, cursor: "pointer" }}
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
                    background: m.role === "user" ? "var(--accent)" : "#f1f5f9",
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
                style={{ background: "var(--accent)", color: "#fff", border: "none", width: 36, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
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

      <div style={{ padding: "0 28px 20px" }}>
        <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 10, padding: 16, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: L.text }}>Performance Brain</p>
            <p style={{ fontSize: 12, color: L.muted }}>
              Cross-references this client&apos;s real Meta Ads numbers against their strategy and past learnings, and queues prioritized recommendations on Approvals.
            </p>
          </div>
          <button
            onClick={analyzePerformance}
            disabled={analyzing}
            style={{
              flexShrink: 0, display: "flex", alignItems: "center", gap: 6, background: analyzing ? L.dimmed : "var(--accent)", color: "#fff", border: "none",
              padding: "8px 16px", fontSize: 12.5, fontWeight: 700, borderRadius: 8, cursor: analyzing ? "default" : "pointer",
            }}
          >
            <Sparkles style={{ width: 13, height: 13 }} className={analyzing ? "spin" : ""} />
            {analyzing ? "Analyzing…" : "Analyze performance"}
          </button>
        </div>
        {analyzeError && (
          <p style={{ marginTop: 8, fontSize: 12.5, color: "#b91c1c" }}>{analyzeError}</p>
        )}
        {analyzeResult && (
          <div style={{ marginTop: 8, fontSize: 12.5, color: L.muted }}>
            {analyzeResult.recommendations.length === 0
              ? "Not enough spend/data yet to recommend anything real."
              : `${analyzeResult.inserted} new recommendation${analyzeResult.inserted === 1 ? "" : "s"} added to Approvals${analyzeResult.recommendations.length > analyzeResult.inserted ? ` (${analyzeResult.recommendations.length - analyzeResult.inserted} already pending)` : ""}.`}
          </div>
        )}
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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
            {leads.map((lead) => {
              const quality = qualityFromOutcome(lead.outcome);
              const fields = lead.lq_conversations?.extracted_fields || {};
              return (
                <div key={lead.id} style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 10, padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: quality.color, background: quality.bg, padding: "3px 9px", borderRadius: 20 }}>
                      LEAD QUALITY: {quality.label}
                    </span>
                    {lead.score != null && (
                      <span style={{ fontSize: 10.5, color: L.dimmed }}>match: {lead.score}</span>
                    )}
                  </div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: L.text }}>
                    {fields.name ? `${String(fields.name)} — ` : ""}{String(fields.job_type || "Job type unknown")}
                  </p>
                  <div style={{ fontSize: 11.5, color: L.muted, display: "flex", flexDirection: "column", gap: 2 }}>
                    <span>Location: {String(fields.location || "unknown")}</span>
                    <span>Timeline: {String(fields.timeline || "unknown")}</span>
                    {!!fields.property_size && <span>Property size: {String(fields.property_size)}</span>}
                  </div>
                  <div style={{ fontSize: 11, color: L.dimmed, borderTop: `1px solid ${L.border}`, paddingTop: 6, marginTop: 2 }}>
                    {lead.contact_email || "no email captured"} · {new Date(lead.created_at).toLocaleString()}
                    {lead.outcome === "qualified" && lead.booking_status && ` · booking: ${lead.booking_status}`}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
