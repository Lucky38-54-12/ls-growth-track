"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

const L = { border: "#e2e8f0", text: "#0f172a", muted: "#64748b" };

interface Config {
  businessName: string;
  googleReviewUrl: string;
  customerName: string | null;
}

// Review-gating funnel, the customer-facing side. "Great" goes straight to
// the business's public Google review link; "not quite right" stays here
// and goes to the business owner privately (see
// app/api/review-funnel/respond) — never framed as blocking a bad review,
// only as a quick private check-in first.
export default function ReviewFlow({ slug }: { slug: string }) {
  const searchParams = useSearchParams();
  const sendId = searchParams.get("s") || undefined;

  const [config, setConfig] = useState<Config | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [phase, setPhase] = useState<"ask" | "feedback" | "redirecting" | "thanks">("ask");
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const qs = sendId ? `?s=${encodeURIComponent(sendId)}` : "";
    fetch(`/api/review-funnel/public/${slug}${qs}`)
      .then((r) => r.json())
      .then((body) => (body.error ? setNotFound(true) : setConfig(body)))
      .catch(() => setNotFound(true));
  }, [slug, sendId]);

  function respond(sentiment: "good" | "bad", fb?: string) {
    return fetch("/api/review-funnel/respond", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, sendId, sentiment, feedback: fb, customerName: config?.customerName }),
    });
  }

  function handleGood() {
    if (!config) return;
    setPhase("redirecting");
    respond("good").finally(() => {
      window.location.href = config.googleReviewUrl;
    });
  }

  async function handleBadSubmit() {
    setSubmitting(true);
    await respond("bad", feedback).catch(() => {});
    setSubmitting(false);
    setPhase("thanks");
  }

  if (notFound) {
    return <Shell><p style={{ fontSize: 14, color: L.muted }}>This link isn&apos;t valid, double check it or ask for a fresh one.</p></Shell>;
  }

  if (!config) {
    return <Shell><p style={{ fontSize: 14, color: L.muted }}>Loading…</p></Shell>;
  }

  if (phase === "redirecting") {
    return <Shell><p style={{ fontSize: 14, color: L.muted }}>Thanks! Taking you to leave a review…</p></Shell>;
  }

  if (phase === "thanks") {
    return (
      <Shell>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: L.text, marginBottom: 8 }}>Thanks for letting us know</h1>
        <p style={{ fontSize: 14, color: L.muted, lineHeight: 1.5 }}>
          {config.businessName} will be in touch to sort it out.
        </p>
      </Shell>
    );
  }

  if (phase === "feedback") {
    return (
      <Shell>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: L.text, marginBottom: 8 }}>Sorry to hear that</h1>
        <p style={{ fontSize: 14, color: L.muted, marginBottom: 14, lineHeight: 1.5 }}>
          Tell us what happened, this goes straight to {config.businessName}, not anywhere public.
        </p>
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="What went wrong?"
          rows={4}
          style={{ width: "100%", boxSizing: "border-box", fontSize: 14, color: L.text, border: `1px solid ${L.border}`, borderRadius: 4, padding: "10px 12px", marginBottom: 12, fontFamily: "inherit" }}
        />
        <button
          type="button"
          onClick={handleBadSubmit}
          disabled={submitting || !feedback.trim()}
          style={{
            width: "100%", fontSize: 14, fontWeight: 700, color: "#fff", background: "#111827",
            border: "none", borderRadius: 4, padding: "11px 16px", cursor: submitting ? "default" : "pointer",
            opacity: feedback.trim() ? 1 : 0.5,
          }}
        >
          {submitting ? "Sending…" : "Send privately"}
        </button>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: L.text, marginBottom: 8 }}>
        Hey{config.customerName ? ` ${config.customerName}` : ""}, how&apos;d it go?
      </h1>
      <p style={{ fontSize: 14, color: L.muted, marginBottom: 20, lineHeight: 1.5 }}>
        Quick one from {config.businessName} — one tap, takes two seconds.
      </p>
      <button
        type="button"
        onClick={handleGood}
        style={{
          width: "100%", fontSize: 14, fontWeight: 700, color: "#fff", background: "#15803d",
          border: "none", borderRadius: 4, padding: "12px 16px", cursor: "pointer", marginBottom: 10,
        }}
      >
        It was great!
      </button>
      <button
        type="button"
        onClick={() => setPhase("feedback")}
        style={{
          width: "100%", fontSize: 14, fontWeight: 700, color: L.text, background: "#fff",
          border: `1px solid ${L.border}`, borderRadius: 4, padding: "12px 16px", cursor: "pointer",
        }}
      >
        Not quite right
      </button>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 400, background: "#fff", border: `1px solid ${L.border}`, borderRadius: 8, padding: 28 }}>
        {children}
      </div>
    </div>
  );
}
