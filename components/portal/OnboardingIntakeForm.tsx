"use client";
import { useState } from "react";

const L = { border: "#e2e8f0", text: "#0f172a", muted: "#64748b" };

interface IntakeClient {
  company: string;
  name: string;
  services: string[] | null;
  ad_budget: string | null;
  business_manager_id: string | null;
  portal_photos_folder_url: string | null;
  client_intake_submitted_at: string | null;
}

function whatsappLink(number: string): string {
  return `https://wa.me/${number.replace(/[^\d]/g, "")}`;
}

// process.env is inlined at build time for NEXT_PUBLIC_ vars, safe to read
// directly in this client component.
const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "";

export default function OnboardingIntakeForm({ token, client }: { token: string; client: IntakeClient }) {
  const initialServices = client.services && client.services.length > 0 ? client.services : ["", "", ""];
  const [services, setServices] = useState<string[]>([initialServices[0] || "", initialServices[1] || "", initialServices[2] || ""]);
  const [adBudget, setAdBudget] = useState(client.ad_budget || "");
  const [businessManagerId, setBusinessManagerId] = useState(client.business_manager_id || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(!!client.client_intake_submitted_at);
  const [error, setError] = useState("");

  function updateService(i: number, value: string) {
    setServices((s) => s.map((v, idx) => (idx === i ? value : v)));
  }

  async function submit() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/portal/onboarding/${token}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ services, ad_budget: adBudget, business_manager_id: businessManagerId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Something went wrong, try again.");
        return;
      }
      setSaved(true);
    } catch {
      setError("Something went wrong, try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ background: "#fff", border: `1px solid ${L.border}`, borderRadius: 12, padding: 28 }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: L.text, margin: "0 0 4px" }}>Let's get {client.company} started</h1>
      <p style={{ fontSize: 13.5, color: L.muted, margin: "0 0 24px" }}>A few things to sort before the campaign can launch.</p>

      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, marginBottom: 8 }}>1. Meta Business Manager access</div>
        <p style={{ fontSize: 13.5, color: L.text, margin: "0 0 10px" }}>Add LS Growth as a partner on your Business Manager, or drop your Business Manager ID here and Lucky will send a request.</p>
        <input value={businessManagerId} onChange={(e) => setBusinessManagerId(e.target.value)} placeholder="Business Manager ID (optional)" style={{ width: "100%", boxSizing: "border-box" }} />
      </div>

      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, marginBottom: 8 }}>2. Services & budget</div>
        {services.map((s, i) => (
          <input
            key={i}
            value={s}
            onChange={(e) => updateService(i, e.target.value)}
            placeholder={`Service / area ${i + 1}`}
            style={{ width: "100%", boxSizing: "border-box", marginBottom: 8 }}
          />
        ))}
        <input value={adBudget} onChange={(e) => setAdBudget(e.target.value)} placeholder="Monthly ad budget" style={{ width: "100%", boxSizing: "border-box" }} />
      </div>

      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, marginBottom: 8 }}>3. Photos & videos</div>
        <p style={{ fontSize: 13.5, color: L.text, margin: "0 0 10px" }}>Drop whatever you've got into the shared folder, or send them straight to WhatsApp if that's easier.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {client.portal_photos_folder_url && (
            <a
              href={client.portal_photos_folder_url}
              target="_blank"
              rel="noreferrer"
              style={{ padding: "8px 14px", background: "#f1f5f9", color: L.text, border: `1px solid ${L.border}`, borderRadius: 6, fontSize: 13, fontWeight: 700, textDecoration: "none" }}
            >
              Open upload folder
            </a>
          )}
          {WHATSAPP_NUMBER && (
            <a
              href={whatsappLink(WHATSAPP_NUMBER)}
              target="_blank"
              rel="noreferrer"
              style={{ padding: "8px 14px", background: "#dcfce7", color: "#166534", border: "1px solid #bbf7d0", borderRadius: 6, fontSize: 13, fontWeight: 700, textDecoration: "none" }}
            >
              Send on WhatsApp
            </a>
          )}
        </div>
      </div>

      {error && <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", color: "#991b1b", padding: "8px 12px", fontSize: 13, marginBottom: 16, borderRadius: 6 }}>{error}</div>}

      <button
        type="button"
        onClick={submit}
        disabled={saving}
        style={{ padding: "10px 20px", background: saving ? "#93c5fd" : "var(--accent, #0080e0)", color: "#fff", border: "none", borderRadius: 6, fontSize: 14, fontWeight: 700, cursor: saving ? "default" : "pointer" }}
      >
        {saving ? "Saving…" : saved ? "Update" : "Submit"}
      </button>
      {saved && !saving && <span style={{ marginLeft: 10, fontSize: 13, color: "#166534" }}>Saved, thanks!</span>}
    </div>
  );
}
