"use client";
import { useEffect, useState } from "react";
import Topbar from "@/components/Topbar";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b" };

interface ReviewClient {
  id: string;
  slug: string;
  business_name: string;
  owner_email: string;
  google_review_url: string;
}

interface SendResult { email: string; ok: boolean; error?: string }

export default function ReviewFunnelPage() {
  const [clients, setClients] = useState<ReviewClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string>("");

  // New-client form
  const [businessName, setBusinessName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [googleReviewUrl, setGoogleReviewUrl] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Batch send
  const [batchText, setBatchText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendResults, setSendResults] = useState<SendResult[] | null>(null);

  function load() {
    fetch("/api/review-funnel/clients")
      .then((r) => r.json())
      .then((body) => setClients(body.clients || []))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function handleCreate() {
    setCreateError(null);
    setCreating(true);
    const res = await fetch("/api/review-funnel/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessName, ownerEmail, googleReviewUrl }),
    });
    const body = await res.json();
    setCreating(false);
    if (body.error) { setCreateError(body.error); return; }
    setBusinessName(""); setOwnerEmail(""); setGoogleReviewUrl("");
    load();
    setSelected(body.client.slug);
  }

  // Each line: "Name, email, job description" (job optional).
  function parseBatch(text: string) {
    return text.split("\n").map((l) => l.trim()).filter(Boolean).map((line) => {
      const [name, email, job] = line.split(",").map((s) => s.trim());
      return { name, email, job };
    }).filter((c) => c.email);
  }

  async function handleSendBatch() {
    const customers = parseBatch(batchText);
    if (!selected || customers.length === 0) return;
    setSending(true);
    setSendResults(null);
    const res = await fetch("/api/review-funnel/send-batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: selected, customers }),
    });
    const body = await res.json();
    setSending(false);
    setSendResults(body.results || []);
    if (body.results?.every((r: SendResult) => r.ok)) setBatchText("");
  }

  const selectedClient = clients.find((c) => c.slug === selected);
  const reviewLink = selectedClient ? `${typeof window !== "undefined" ? window.location.origin : ""}/review/${selectedClient.slug}` : "";

  return (
    <div>
      <Topbar title="Review Funnel" />
      <div style={{ padding: 24, maxWidth: 760 }}>
        <p style={{ fontSize: 13.5, color: L.muted, marginBottom: 24, lineHeight: 1.6 }}>
          Happy customers get sent straight to the client&apos;s Google review link. Unhappy ones land privately
          with the client instead, never public. One config per client, reusable for every batch you send.
        </p>

        <Section title="1. Set up a client">
          <Field label="Business name"><input value={businessName} onChange={(e) => setBusinessName(e.target.value)} style={inputStyle} placeholder="Coast Build" /></Field>
          <Field label="Owner email (gets private negative feedback)"><input value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} style={inputStyle} placeholder="info@coastbuild.nz" /></Field>
          <Field label="Google review link"><input value={googleReviewUrl} onChange={(e) => setGoogleReviewUrl(e.target.value)} style={inputStyle} placeholder="https://g.page/r/.../review" /></Field>
          {createError && <p style={{ color: "#b91c1c", fontSize: 12.5, marginBottom: 10 }}>{createError}</p>}
          <button type="button" onClick={handleCreate} disabled={creating || !businessName || !ownerEmail || !googleReviewUrl} style={buttonStyle}>
            {creating ? "Saving…" : "Add client"}
          </button>
        </Section>

        <Section title="2. Pick a client">
          {loading ? (
            <p style={{ fontSize: 13, color: L.muted }}>Loading…</p>
          ) : clients.length === 0 ? (
            <p style={{ fontSize: 13, color: L.muted }}>No clients set up yet, add one above.</p>
          ) : (
            <select value={selected} onChange={(e) => setSelected(e.target.value)} style={inputStyle}>
              <option value="">Select a client…</option>
              {clients.map((c) => <option key={c.id} value={c.slug}>{c.business_name}</option>)}
            </select>
          )}
          {selectedClient && (
            <p style={{ fontSize: 12, color: L.muted, marginTop: 8 }}>
              Bare link (no tracking): <code style={{ background: "#f8fafc", padding: "2px 6px" }}>{reviewLink}</code>
            </p>
          )}
        </Section>

        <Section title="3. Batch-send to past customers">
          <p style={{ fontSize: 12.5, color: L.muted, marginBottom: 10, lineHeight: 1.5 }}>
            One per line: <code>name, email, job description</code> (job description optional, e.g. kitchen reno).
          </p>
          <textarea
            value={batchText}
            onChange={(e) => setBatchText(e.target.value)}
            rows={6}
            placeholder={"Jane Smith, jane@email.com, kitchen reno\nMike Jones, mike@email.com, new build"}
            style={{ ...inputStyle, fontFamily: "monospace", fontSize: 12.5 }}
          />
          <button type="button" onClick={handleSendBatch} disabled={sending || !selected || !batchText.trim()} style={{ ...buttonStyle, marginTop: 10 }}>
            {sending ? "Sending…" : "Send review requests"}
          </button>
          {sendResults && (
            <div style={{ marginTop: 14 }}>
              {sendResults.map((r, i) => (
                <p key={i} style={{ fontSize: 12.5, color: r.ok ? "#15803d" : "#b91c1c" }}>
                  {r.ok ? "✓" : "✗"} {r.email}{r.error ? ` — ${r.error}` : ""}
                </p>
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 8, padding: 20, marginBottom: 20 }}>
      <h2 style={{ fontSize: 14, fontWeight: 700, color: L.text, marginBottom: 14 }}>{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: L.muted, marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", fontSize: 13.5, color: L.text,
  border: `1px solid ${L.border}`, borderRadius: 4, padding: "9px 11px", fontFamily: "inherit",
};

const buttonStyle: React.CSSProperties = {
  fontSize: 13.5, fontWeight: 700, color: "#fff", background: "#111827",
  border: "none", borderRadius: 4, padding: "10px 18px", cursor: "pointer",
};
