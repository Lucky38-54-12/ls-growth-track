"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { CalendarCheck, MessageCircle, CheckCircle2, ShieldCheck, Lock, Megaphone, Copy, Check } from "lucide-react";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b" };

// The Business Manager clients add as a partner to grant ad account access —
// there's no OAuth flow for this (Meta requires it done by hand in Business
// Suite), so this just needs to be correct, not secret.
const LS_GROWTH_BUSINESS_NAME = "LS Growth Agency";
const LS_GROWTH_BUSINESS_ID = "1348658683829583";

interface ClientInfo {
  id: string;
  name: string;
  trade: string | null;
  calendarConnected: boolean;
  facebookConnected: boolean;
  adsAccessConfirmed: boolean;
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

  const [adsConfirming, setAdsConfirming] = useState(false);
  const [adsJustConfirmed, setAdsJustConfirmed] = useState(false);

  async function handleConfirmAdsAccess() {
    setAdsConfirming(true);
    await fetch(`/api/lead-qual/public/${clientId}/confirm-ads-access`, { method: "POST" });
    setAdsConfirming(false);
    setAdsJustConfirmed(true);
  }

  const calendarDone = !!client?.calendarConnected || !!calendarConnected;
  const facebookDone = !!client?.facebookConnected || fbJustConnected;
  const adsDone = !!client?.adsAccessConfirmed || adsJustConfirmed;

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
            A few quick steps so leads book straight onto your calendar and we can get your ads running. You&apos;ll log into your own Google and Facebook accounts on their screens, not ours, nothing is shared with us beyond what you approve there — and you can revoke access anytime from your own account settings.
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

          <AdsAccessCard done={adsDone} confirming={adsConfirming} onConfirm={handleConfirmAdsAccess} />

          {calendarDone && facebookDone && adsDone ? (
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

function AdsAccessCard({ done, confirming, onConfirm }: { done: boolean; confirming: boolean; onConfirm: () => void }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(LS_GROWTH_BUSINESS_ID);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div style={{ background: "#fff", border: `1px solid ${L.border}`, borderRadius: 12, padding: 18, marginBottom: 14, boxShadow: "0 1px 2px rgba(15,23,42,0.03)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: done ? 0 : 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 9, background: "#fef2f2", color: "var(--red)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Megaphone style={{ width: 18, height: 18 }} />
          </div>
          <div>
            <p style={{ fontSize: 14, fontWeight: 700, color: L.text }}>Meta Ads Manager</p>
            <p style={{ fontSize: 12.5, color: L.muted }}>So we can set up and run your ad campaigns.</p>
          </div>
        </div>
        {done && (
          <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700, color: "#15803d", flexShrink: 0 }}>
            <CheckCircle2 style={{ width: 16, height: 16 }} /> Marked done
          </span>
        )}
      </div>

      {!done && (
        <>
          <p style={{ fontSize: 12.5, color: L.muted, marginBottom: 10, lineHeight: 1.6 }}>
            Meta doesn&apos;t let us request this one with a click, you&apos;ll need to add us as a partner yourself in Meta Business Suite:
          </p>
          <ol style={{ fontSize: 12.5, color: L.text, lineHeight: 1.9, paddingLeft: 18, marginBottom: 12 }}>
            <li>Go to <strong>business.facebook.com/settings</strong> and open your Business Settings</li>
            <li><strong>Accounts → Ad accounts</strong>, select your ad account</li>
            <li>Click <strong>Assign partner</strong>, and paste in the Business ID below</li>
            <li>Give <strong>full control</strong> (or advertiser access) and confirm</li>
          </ol>

          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#f8fafc", border: `1px solid ${L.border}`, borderRadius: 8, padding: "8px 10px", marginBottom: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 10.5, fontWeight: 700, color: L.muted, textTransform: "uppercase", letterSpacing: "0.04em" }}>{LS_GROWTH_BUSINESS_NAME} — Business ID</p>
              <p style={{ fontSize: 13, fontWeight: 700, color: L.text, fontFamily: "monospace" }}>{LS_GROWTH_BUSINESS_ID}</p>
            </div>
            <button
              type="button"
              onClick={handleCopy}
              style={{
                display: "flex", alignItems: "center", gap: 5, flexShrink: 0,
                fontSize: 12, fontWeight: 700, color: copied ? "#15803d" : L.text,
                background: "#fff", border: `1px solid ${L.border}`, borderRadius: 6, padding: "6px 10px", cursor: "pointer",
              }}
            >
              {copied ? <Check style={{ width: 13, height: 13 }} /> : <Copy style={{ width: 13, height: 13 }} />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>

          <button
            type="button"
            onClick={onConfirm}
            disabled={confirming}
            style={{
              width: "100%", fontSize: 13, fontWeight: 700, color: "#fff", background: "var(--red)",
              border: "none", borderRadius: 8, padding: "9px 16px", cursor: confirming ? "default" : "pointer",
            }}
          >
            {confirming ? "Saving…" : "I've added LS Growth as a partner"}
          </button>
        </>
      )}
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
        .connect-brand { flex: 1 1 46%; min-width: 320px; padding: 48px 56px; }
        .connect-brand-headline { font-size: 52px; }
        @media (max-width: 780px) {
          .connect-shell { flex-direction: column; }
          .connect-brand { flex: none; min-width: 0; padding: 32px 24px 8px; }
          .connect-brand-headline { font-size: 34px; }
        }
      `}</style>

      {/* Branding panel */}
      <div className="connect-brand" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <img src="/logo-wide.png" alt="LS Growth" style={{ height: 24, width: "auto", objectFit: "contain" }} />

        <div>
          <h2 className="connect-brand-headline" style={{ fontWeight: 900, lineHeight: 1.05, letterSpacing: "-0.02em", color: L.text, marginBottom: 14, textTransform: "uppercase" }}>
            Let&apos;s get<br />you connected.
          </h2>
          <p style={{ fontSize: 15, color: L.muted }}>
            A few quick steps to get your account set up.
          </p>
        </div>

        <p style={{ fontSize: 12.5, color: "#94a3b8" }}>© {new Date().getFullYear()} LS Growth</p>
      </div>

      {/* Content panel */}
      <div style={{ flex: "1 1 54%", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ width: "100%", maxWidth: 440 }}>{children}</div>
      </div>
    </div>
  );
}
