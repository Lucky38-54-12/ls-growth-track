"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b" };

export default function NewLeadPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    const body = Object.fromEntries(fd.entries());
    const res = await fetch("/api/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    setLoading(false);
    if (data.error) { setError(data.error); return; }
    const msg = data.emailError ? `Added lead (email failed: ${data.emailError})` : `Added ${data.lead.company} and sent their first email.`;
    router.push(`/dashboard?flash=${encodeURIComponent(msg)}`);
  }

  return (
    <div>
      <div style={{ background: "#fff", borderBottom: `1px solid ${L.border}`, padding: "0 28px", height: 68, display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 34, height: 34, borderRadius: 8, background: "var(--red)", flexShrink: 0 }} />
        <div>
          <h1 style={{ fontSize: 17, fontWeight: 900, letterSpacing: "0.04em" }}>ADD LEAD</h1>
          <p style={{ color: L.muted, fontSize: 12, marginTop: 1 }}>Add a business and start their sequence</p>
        </div>
      </div>

      <div style={{ maxWidth: 600, margin: "32px auto", padding: "0 28px" }}>
        {error && <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", color: "#991b1b", padding: "10px 16px", borderRadius: 8, marginBottom: 18, fontSize: 14 }}>{error}</div>}
        <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 10, padding: 24 }}>
          <div style={{ fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, fontWeight: 800, marginBottom: 4 }}>New Lead</div>
          <p style={{ fontSize: 13, color: L.muted, marginBottom: 20 }}>Saving will immediately send their initial outreach email.</p>
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label>Company</label>
              <input name="company" required placeholder="e.g. Acme Plumbing" />
            </div>
            <div>
              <label>Contact first name</label>
              <input name="contact_name" placeholder="e.g. Mike — leave blank for 'there'" />
            </div>
            <div>
              <label>Email</label>
              <input name="email" type="email" required />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label>Trade</label>
                <input name="trade" required placeholder="e.g. Plumbing" />
              </div>
              <div>
                <label>Location</label>
                <input name="location" required placeholder="e.g. Auckland NZ" />
              </div>
            </div>
            <div>
              <label>Notes <span style={{ fontWeight: 400, color: "#94a3b8" }}>(optional)</span></label>
              <input name="notes" />
            </div>
            <div style={{ marginTop: 6, display: "flex", gap: 12 }}>
              <button type="submit" disabled={loading} style={{
                padding: "11px 24px", background: loading ? "#fca5a5" : "var(--red)", color: "#fff",
                border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: loading ? "default" : "pointer",
              }}>
                {loading ? "Saving…" : "Save & send first email"}
              </button>
              <a href="/dashboard" style={{
                padding: "11px 20px", background: "#f8fafc", color: L.text,
                border: `1px solid ${L.border}`, borderRadius: 8, fontSize: 14, fontWeight: 700,
                display: "inline-flex", alignItems: "center",
              }}>Cancel</a>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
