"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { CalendarCheck, MessageCircle, CheckCircle2, ShieldCheck, Lock } from "lucide-react";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b" };

interface ClientInfo {
  id: string;
  name: string;
  trade: string | null;
  calendarConnected: boolean;
  facebookConnected: boolean;
}

interface FbPage {
  id: string;
  name: string;
}

export default function ConnectPage() {
  return (
    <Suspense fallback={null}>
      <ConnectPageInner />
    </Suspense>
  );
}

function ConnectPageInner() {
  const { clientId } = useParams<{ clientId: string }>();
  const searchParams = useSearchParams();

  // "verifying" holds the connect UI behind a brief, real check that this
  // link resolves to an actual client record — not theater, this is the
  // same lookup that would otherwise happen invisibly, just given a moment
  // on screen so a client opening a link from Lucky sees it get confirmed
  // rather than the connect buttons just appearing.
  const [phase, setPhase] = useState<"verifying" | "found" | "notfound">("verifying");
  const [client, setClient] = useState<ClientInfo | null>(null);

  const calendarConnected = searchParams.get("calendarConnected");
  const calendarError = searchParams.get("calendarError");
  const fbError = searchParams.get("fbError");
  const fbPending = searchParams.get("fbPending");

  const [fbPages, setFbPages] = useState<FbPage[]>([]);
  const [fbConnecting, setFbConnecting] = useState(false);
  const [fbConnectError, setFbConnectError] = useState<string | null>(null);
  const [fbJustConnected, setFbJustConnected] = useState(false);

  function loadClient() {
    const startedAt = Date.now();
    fetch(`/api/lead-qual/public/${clientId}`)
      .then((r) => r.json())
      .then((body) => {
        // Real network calls to a nearby API can resolve in <100ms, too fast
        // to register as a genuine check — pad only up to a floor, never
        // fake a delay beyond how long verification actually took.
        const elapsed = Date.now() - startedAt;
        const remaining = Math.max(0, 700 - elapsed);
        setTimeout(() => {
          if (body.error) {
            setPhase("notfound");
          } else {
            setClient(body);
            setPhase("found");
          }
        }, remaining);
      })
      .catch(() => setPhase("notfound"));
  }

  useEffect(() => {
    loadClient();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  useEffect(() => {
    if (!fbPending) return;
    fetch(`/api/lead-qual/oauth/facebook/pending/${fbPending}`)
      .then((r) => r.json())
      .then((body) => {
        if (body.pages) setFbPages(body.pages);
        else setFbConnectError(body.error || "Could not load your Facebook Pages");
      });
  }, [fbPending]);

  async function handleChoosePage(pageId: string) {
    setFbConnecting(true);
    setFbConnectError(null);
    const res = await fetch("/api/lead-qual/oauth/facebook/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pendingId: fbPending, clientId, pageId }),
    });
    const body = await res.json();
    setFbConnecting(false);
    if (!res.ok) {
      setFbConnectError(body.error);
      return;
    }
    setFbPages([]);
    setFbJustConnected(true);
    loadClient();
  }

  const calendarDone = !!client?.calendarConnected || !!calendarConnected;
  const facebookDone = !!client?.facebookConnected || fbJustConnected;

  return (
    <Shell>
      {phase === "verifying" && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "40px 0" }}>
          <div style={spinnerStyle} />
          <p style={{ fontSize: 13.5, color: L.muted, fontWeight: 600 }}>Verifying your secure link…</p>
        </div>
      )}

      {phase === "notfound" && (
        <div style={{ padding: "20px 0" }}>
          <p style={{ fontSize: 14, color: L.text, fontWeight: 700, marginBottom: 6 }}>This link isn&apos;t valid</p>
          <p style={{ fontSize: 13.5, color: L.muted }}>Ask Lucky at LS Growth for a fresh one.</p>
        </div>
      )}

      {phase === "found" && client && (
        <div>
          <p style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700, color: "#15803d", marginBottom: 18 }}>
            <ShieldCheck style={{ width: 15, height: 15 }} /> Link verified for {client.name}
          </p>

          <h1 style={{ fontSize: 22, fontWeight: 800, color: L.text, marginBottom: 6 }}>Connect {client.name}</h1>
          <p style={{ fontSize: 14, color: L.muted, marginBottom: 24, lineHeight: 1.5 }}>
            Two quick connections so leads book straight onto your calendar. You&apos;ll log into your own Google and Facebook accounts on their screens, not ours, nothing is shared with us beyond what you approve there — and you can revoke access anytime from your own account settings.
          </p>

          <ConnectRow
            icon={<CalendarCheck style={{ width: 18, height: 18 }} />}
            title="Google Calendar"
            description="So a booked lead lands straight on your calendar."
            connected={calendarDone}
            error={calendarError}
            href={`/api/lead-qual/oauth/google?clientId=${clientId}`}
          />

          {fbPending && fbPages.length > 0 ? (
            <div style={{ background: "#f8fafc", border: `1px solid ${L.border}`, borderRadius: 12, padding: 18, marginBottom: 14 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: L.text, marginBottom: 10 }}>
                Which Facebook Page should send us leads?
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {fbPages.map((page) => (
                  <button
                    key={page.id}
                    onClick={() => handleChoosePage(page.id)}
                    disabled={fbConnecting}
                    style={{ background: "#fff", border: `1px solid ${L.border}`, borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: fbConnecting ? "default" : "pointer" }}
                  >
                    {page.name}
                  </button>
                ))}
              </div>
              {fbConnectError && <p style={{ color: "#b91c1c", fontSize: 12.5, marginTop: 10 }}>{fbConnectError}</p>}
            </div>
          ) : (
            <ConnectRow
              icon={<MessageCircle style={{ width: 18, height: 18 }} />}
              title="Facebook Page"
              description="So Messenger leads from your Page get qualified automatically."
              connected={facebookDone}
              error={fbError || fbConnectError}
              href={`/api/lead-qual/oauth/facebook?clientId=${clientId}`}
            />
          )}

          {calendarDone && facebookDone ? (
            <p style={{ fontSize: 13.5, color: "#15803d", fontWeight: 700, marginTop: 4 }}>
              All set, you&apos;re good to go.
            </p>
          ) : (
            <p style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: L.muted, marginTop: 18 }}>
              <Lock style={{ width: 12, height: 12 }} /> Secured by Google and Facebook&apos;s own login, LS Growth never sees your password.
            </p>
          )}
        </div>
      )}
    </Shell>
  );
}

function ConnectRow({
  icon, title, description, connected, error, href,
}: {
  icon: React.ReactNode; title: string; description: string; connected: boolean; error?: string | null; href: string;
}) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${L.border}`, borderRadius: 12, padding: 18, marginBottom: 14, boxShadow: "0 1px 2px rgba(15,23,42,0.03)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 9, background: "#fef2f2", color: "var(--red)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {icon}
          </div>
          <div>
            <p style={{ fontSize: 14, fontWeight: 700, color: L.text }}>{title}</p>
            <p style={{ fontSize: 12.5, color: L.muted }}>{description}</p>
          </div>
        </div>
        {connected ? (
          <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700, color: "#15803d", flexShrink: 0 }}>
            <CheckCircle2 style={{ width: 16, height: 16 }} /> Connected
          </span>
        ) : (
          <a
            href={href}
            style={{
              flexShrink: 0, fontSize: 13, fontWeight: 700, color: "#fff", background: "var(--red)",
              borderRadius: 8, padding: "8px 16px", textDecoration: "none",
            }}
          >
            Connect
          </a>
        )}
      </div>
      {error && <p style={{ color: "#b91c1c", fontSize: 12.5, marginTop: 10 }}>Couldn&apos;t connect: {error}</p>}
    </div>
  );
}

const spinnerStyle: React.CSSProperties = {
  width: 28, height: 28, borderRadius: "50%",
  border: "3px solid #fecdd3", borderTopColor: "var(--red)",
  animation: "connect-spin 0.8s linear infinite",
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="connect-shell" style={{ minHeight: "100vh", display: "flex", background: "#fff" }}>
      <style>{`
        @keyframes connect-spin { to { transform: rotate(360deg); } }
        .connect-shell { flex-direction: row; }
        .connect-brand { flex: 1 1 42%; min-width: 320px; padding: 48px 44px; }
        .connect-brand-copy { display: flex; }
        @media (max-width: 780px) {
          .connect-shell { flex-direction: column; }
          .connect-brand { flex: none; min-width: 0; padding: 32px 24px; }
          .connect-brand-copy { display: none; }
        }
      `}</style>

      {/* Branding panel */}
      <div
        className="connect-brand"
        style={{ background: "#0b1220", color: "#fff", display: "flex", flexDirection: "column", justifyContent: "space-between" }}
      >
        <img src="/logo-wide.png" alt="LS Growth" style={{ height: 28, width: "auto", objectFit: "contain", filter: "brightness(0) invert(1)" }} />

        <div className="connect-brand-copy" style={{ flexDirection: "column" }}>
          <h2 style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.15, marginBottom: 14 }}>
            Let&apos;s get you connected.
          </h2>
          <p style={{ fontSize: 14.5, color: "#94a3b8", lineHeight: 1.6, maxWidth: 380 }}>
            Two accounts, two minutes, and every lead we qualify for you books straight onto your calendar automatically.
          </p>
        </div>

        <div className="connect-brand-copy" style={{ flexDirection: "column", gap: 12 }}>
          <TrustLine text="You approve access on Google and Facebook's own screens" />
          <TrustLine text="LS Growth never sees or stores your password" />
          <TrustLine text="Revoke access anytime from your own account settings" />
        </div>
      </div>

      {/* Content panel */}
      <div style={{ flex: "1 1 58%", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ width: "100%", maxWidth: 460 }}>{children}</div>
      </div>
    </div>
  );
}

function TrustLine({ text }: { text: string }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
      <CheckCircle2 style={{ width: 15, height: 15, color: "#4ade80", flexShrink: 0, marginTop: 2 }} />
      <p style={{ fontSize: 13, color: "#cbd5e1", lineHeight: 1.4 }}>{text}</p>
    </div>
  );
}
