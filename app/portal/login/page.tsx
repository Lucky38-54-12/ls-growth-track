"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Mail, CheckCircle2, XCircle } from "lucide-react";

const L = { text: "#0f172a", muted: "#64748b", border: "#e2e8f0" };

export default function PortalLoginPage() {
  return (
    <Suspense fallback={null}>
      <PortalLoginInner />
    </Suspense>
  );
}

function PortalLoginInner() {
  const searchParams = useSearchParams();
  const urlError = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    await fetch("/api/portal/request-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setSending(false);
    setSent(true);
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, background: "#fff" }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <img src="/logo-trimmed.png" alt="LS Growth" style={{ height: 42, width: "auto", objectFit: "contain", marginBottom: 32 }} />

        {sent ? (
          <div>
            <p style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 16, fontWeight: 800, color: L.text, marginBottom: 8 }}>
              <CheckCircle2 style={{ width: 20, height: 20, color: "#15803d" }} /> Check your email
            </p>
            <p style={{ fontSize: 14, color: L.muted, lineHeight: 1.5 }}>
              If that email is on file, a sign-in link is on its way. It works for 30 minutes and can only be used once.
            </p>
          </div>
        ) : (
          <>
            <h1 style={{ fontSize: 24, fontWeight: 900, letterSpacing: "-0.01em", color: L.text, marginBottom: 8 }}>Sign in</h1>
            <p style={{ fontSize: 14, color: L.muted, marginBottom: 20, lineHeight: 1.5 }}>
              Enter your email and we&apos;ll send you a one-click sign-in link, no password needed.
            </p>

            {urlError && (
              <p style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 12.5, color: "#b91c1c", marginBottom: 16 }}>
                <XCircle style={{ width: 14, height: 14, flexShrink: 0, marginTop: 1 }} />
                That link has expired or already been used — request a new one below.
              </p>
            )}

            <form onSubmit={handleSubmit}>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@business.co.nz"
                style={{
                  width: "100%", boxSizing: "border-box", fontSize: 13.5, color: L.text,
                  border: `1px solid ${L.border}`, borderRadius: 0, padding: "11px 12px", marginBottom: 12,
                }}
              />
              <button
                type="submit"
                disabled={sending}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%",
                  fontSize: 14, fontWeight: 700, color: "#fff", background: "var(--accent)",
                  border: "none", borderRadius: 0, padding: "12px 16px", cursor: sending ? "default" : "pointer",
                }}
              >
                <Mail style={{ width: 16, height: 16 }} /> {sending ? "Sending…" : "Send sign-in link"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
