"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, XCircle, ShieldCheck, Lock, Megaphone, MessageCircle, Copy, Check, ArrowRight, ArrowLeft, Link2, Mail, AlertTriangle } from "lucide-react";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b" };

// Both ad account access and Page admin access are granted to Lucky
// personally (not the "LS Growth Agency" Business Manager/Business ID) —
// via Facebook's "+ Add person" email invite, the smoothest option for a
// client who doesn't already have any relationship with LS Growth's
// Business Manager (name/profile search only surfaces people you're already
// connected to in some way).
const LUCKY_FACEBOOK_EMAIL = "lsgrowthagency.co@gmail.com";

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function extractClientId(input: string): string | null {
  const match = input.match(UUID_RE);
  return match ? match[0] : null;
}

interface ClientInfo {
  id: string;
  name: string;
  trade: string | null;
  email: string | null;
  calendarConnected: boolean;
  adsAccessConfirmed: boolean;
  pageAccessConfirmed: boolean;
}

export default function ConnectFlow({ routeClientId }: { routeClientId?: string }) {
  const searchParams = useSearchParams();

  const calendarConnected = searchParams.get("calendarConnected");
  const calendarError = searchParams.get("calendarError");

  // Coming back from Google's consent screen is a full page redirect (loses
  // any in-memory state), so that trip skips straight past the
  // paste-and-verify gate — the link was already proven genuine the first
  // time through, re-asking would just be friction.
  const arrivingMidFlow = !!(routeClientId && (calendarConnected || calendarError));

  const [linkInput, setLinkInput] = useState("");
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"gate" | "verifying" | "found">("gate");
  const [resolvedClientId, setResolvedClientId] = useState<string | null>(null);
  const [client, setClient] = useState<ClientInfo | null>(null);
  // One thing at a time — landing back from Google's redirect should reopen
  // on whichever step that was, not wherever the state otherwise defaults to.
  const [step, setStep] = useState<"calendar" | "ads" | "page" | "login">("calendar");

  // Landed via a direct /connect/[clientId] link — the link is already
  // sitting in the address bar, so pre-fill it into the box exactly as if
  // they'd pasted it themselves. They still have to hit Verify for anything
  // to actually happen.
  useEffect(() => {
    if (routeClientId && typeof window !== "undefined") {
      setLinkInput(window.location.href);
    }
  }, [routeClientId]);

  function verify(id: string) {
    setVerifyError(null);
    setPhase("verifying");
    const startedAt = Date.now();
    fetch(`/api/lead-qual/public/${id}`)
      .then((r) => r.json())
      .then((body) => {
        // Real network calls to a nearby API can resolve in <100ms, too fast
        // to register as a genuine check — pad only up to a floor, never
        // fake a delay beyond how long verification actually took.
        const elapsed = Date.now() - startedAt;
        const remaining = Math.max(0, 700 - elapsed);
        setTimeout(() => {
          if (body.error) {
            setVerifyError("We couldn't verify that link — check it's copied in full, or ask Lucky at LS Growth for a fresh one.");
            setPhase("gate");
          } else {
            setResolvedClientId(id);
            setClient(body);
            setPhase("found");
          }
        }, remaining);
      })
      .catch(() => {
        setVerifyError("Something went wrong verifying that link — try again.");
        setPhase("gate");
      });
  }

  function handleVerifyClick() {
    const id = extractClientId(linkInput);
    if (!id) {
      setVerifyError("That doesn't look like a valid LS Growth link — paste the full link exactly as you received it.");
      return;
    }
    verify(id);
  }

  useEffect(() => {
    if (arrivingMidFlow && routeClientId) verify(routeClientId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrivingMidFlow, routeClientId]);

  const [adsConfirming, setAdsConfirming] = useState(false);
  const [adsJustConfirmed, setAdsJustConfirmed] = useState(false);

  async function handleConfirmAdsAccess() {
    if (!resolvedClientId) return;
    setAdsConfirming(true);
    await fetch(`/api/lead-qual/public/${resolvedClientId}/confirm-ads-access`, { method: "POST" });
    setAdsConfirming(false);
    setAdsJustConfirmed(true);
  }

  const [pageConfirming, setPageConfirming] = useState(false);
  const [pageJustConfirmed, setPageJustConfirmed] = useState(false);

  async function handleConfirmPageAccess() {
    if (!resolvedClientId) return;
    setPageConfirming(true);
    await fetch(`/api/lead-qual/public/${resolvedClientId}/confirm-page-access`, { method: "POST" });
    setPageConfirming(false);
    setPageJustConfirmed(true);
  }

  const calendarDone = !!client?.calendarConnected || !!calendarConnected;
  const adsDone = !!client?.adsAccessConfirmed || adsJustConfirmed;
  const pageDone = !!client?.pageAccessConfirmed || pageJustConfirmed;

  return (
    <Shell>
      {phase === "gate" && (
        <div>
          <h1 style={{ fontSize: 27, fontWeight: 900, letterSpacing: "-0.01em", color: L.text, marginBottom: 8 }}>Verify your link</h1>
          <p style={{ fontSize: 14, color: L.muted, marginBottom: 18, lineHeight: 1.5 }}>
            Paste the link LS Growth sent you below, then verify it's genuinely yours before we get you connected.
          </p>

          <input
            value={linkInput}
            onChange={(e) => setLinkInput(e.target.value)}
            placeholder="Paste your LS Growth link here"
            style={{
              width: "100%", boxSizing: "border-box", fontSize: 13.5, color: L.text,
              border: `1px solid ${verifyError ? "#fca5a5" : L.border}`, borderRadius: 0,
              padding: "11px 12px", marginBottom: verifyError ? 8 : 16, fontFamily: "monospace",
            }}
          />

          {verifyError && (
            <p style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 12.5, color: "#b91c1c", marginBottom: 16, lineHeight: 1.5 }}>
              <XCircle style={{ width: 14, height: 14, flexShrink: 0, marginTop: 1 }} /> {verifyError}
            </p>
          )}

          <button
            type="button"
            onClick={handleVerifyClick}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%",
              fontSize: 14, fontWeight: 700, color: "#fff", background: "var(--accent)",
              border: "none", borderRadius: 0, padding: "12px 16px", cursor: "pointer",
            }}
          >
            <Link2 style={{ width: 16, height: 16 }} /> Verify link
          </button>
        </div>
      )}

      {phase === "verifying" && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "40px 0" }}>
          <div style={spinnerStyle} />
          <p style={{ fontSize: 13.5, color: L.muted, fontWeight: 600 }}>Verifying your link…</p>
        </div>
      )}

      {phase === "found" && client && step === "calendar" && (
        <div>
          <StepHeader client={client} step={1} of={4} />

          <h1 style={{ fontSize: 27, fontWeight: 900, letterSpacing: "-0.01em", color: L.text, marginBottom: 6 }}>Connect your Calendar</h1>
          <p style={{ fontSize: 14, color: L.muted, marginBottom: 24, lineHeight: 1.5 }}>
            So a booked lead lands straight on your calendar. You&apos;ll log into your own Google account on Google&apos;s screen, not ours.
          </p>

          <ConnectRow
            title="Google Calendar"
            description="So a booked lead lands straight on your calendar."
            connected={calendarDone}
            error={calendarError}
          />

          {!calendarDone && (
            <div style={{ display: "flex", gap: 10, background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 0, padding: 14, marginBottom: 14 }}>
              <AlertTriangle style={{ width: 16, height: 16, color: "#b45309", flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: 12.5, color: "#92400e", lineHeight: 1.6 }}>
                Google may show a <strong>&quot;Google hasn&apos;t verified this app&quot;</strong> warning next — that&apos;s expected, this app is still going through Google&apos;s verification process. It&apos;s safe to continue: click <strong>Advanced</strong>, then <strong>&quot;Go to LS Growth Lead Qual (unsafe)&quot;</strong> to proceed to your own Google login.
              </p>
            </div>
          )}

          <PrimaryAction
            connected={calendarDone}
            href={`/api/lead-qual/oauth/google?clientId=${resolvedClientId}`}
            onNext={() => setStep("ads")}
          />

          {!calendarDone && (
            <>
              <p style={{ fontSize: 12, color: L.muted, textAlign: "center", marginTop: 12, marginBottom: 2 }}>
                Having trouble connecting?
              </p>
              <button
                type="button"
                onClick={() => setStep("ads")}
                style={{
                  display: "block", width: "100%", textAlign: "center", background: "none", border: "none",
                  fontSize: 12.5, fontWeight: 700, color: L.muted, cursor: "pointer", padding: "2px 0 0",
                  textDecoration: "underline",
                }}
              >
                You can skip this for now
              </button>
            </>
          )}

          <p style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: L.muted, marginTop: 14 }}>
            <Lock style={{ width: 12, height: 12 }} /> Secured by Google&apos;s own login, LS Growth never sees your password.
          </p>
        </div>
      )}

      {phase === "found" && client && step === "ads" && (
        <div>
          <button
            type="button"
            onClick={() => setStep("calendar")}
            style={{
              display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700, color: L.muted,
              background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: 18,
            }}
          >
            <ArrowLeft style={{ width: 13, height: 13 }} /> Back
          </button>

          <StepHeader client={client} step={2} of={4} />

          <h1 style={{ fontSize: 27, fontWeight: 900, letterSpacing: "-0.01em", color: L.text, marginBottom: 6 }}>Ads Manager access</h1>
          <p style={{ fontSize: 14, color: L.muted, marginBottom: 24, lineHeight: 1.5 }}>
            So we can set up and run your ad campaigns.
          </p>

          <AdsAccessCard done={adsDone} confirming={adsConfirming} onConfirm={handleConfirmAdsAccess} />

          <button
            type="button"
            onClick={() => setStep("page")}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%",
              fontSize: 14, fontWeight: 700, color: "#fff", background: "var(--accent)",
              border: "none", borderRadius: 0, padding: "11px 16px", cursor: "pointer", marginTop: 8,
            }}
          >
            Next <ArrowRight style={{ width: 15, height: 15 }} />
          </button>
        </div>
      )}

      {phase === "found" && client && step === "page" && (
        <div>
          <button
            type="button"
            onClick={() => setStep("ads")}
            style={{
              display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700, color: L.muted,
              background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: 18,
            }}
          >
            <ArrowLeft style={{ width: 13, height: 13 }} /> Back
          </button>

          <StepHeader client={client} step={3} of={4} />

          <h1 style={{ fontSize: 27, fontWeight: 900, letterSpacing: "-0.01em", color: L.text, marginBottom: 6 }}>Facebook Page access</h1>
          <p style={{ fontSize: 14, color: L.muted, marginBottom: 24, lineHeight: 1.5 }}>
            So we can manage your Page, messages and leads.
          </p>

          <PageAccessCard done={pageDone} confirming={pageConfirming} onConfirm={handleConfirmPageAccess} />

          <button
            type="button"
            onClick={() => setStep("login")}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%",
              fontSize: 14, fontWeight: 700, color: "#fff", background: "var(--accent)",
              border: "none", borderRadius: 0, padding: "11px 16px", cursor: "pointer", marginTop: 8,
            }}
          >
            Next <ArrowRight style={{ width: 15, height: 15 }} />
          </button>
        </div>
      )}

      {phase === "found" && client && step === "login" && (
        <LoginStep client={client} resolvedClientId={resolvedClientId} onBack={() => setStep("page")} />
      )}
    </Shell>
  );
}

function LoginStep({ client, resolvedClientId, onBack }: { client: ClientInfo; resolvedClientId: string | null; onBack: () => void }) {
  const [email, setEmail] = useState(client.email || "");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSend() {
    if (!resolvedClientId || !email.trim()) return;
    setSending(true);
    // Save it against the client record too, so future booking-alert emails
    // (see conversationManager.ts) go to whatever email they confirm here,
    // not just whatever Lucky may have typed in when first adding them.
    await fetch(`/api/lead-qual/clients/${resolvedClientId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim() }),
    });
    await fetch("/api/portal/request-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: resolvedClientId }),
    });
    setSending(false);
    setSent(true);
  }

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        style={{
          display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700, color: L.muted,
          background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: 18,
        }}
      >
        <ArrowLeft style={{ width: 13, height: 13 }} /> Back
      </button>

      <StepHeader client={client} step={4} of={4} />

      <h1 style={{ fontSize: 27, fontWeight: 900, letterSpacing: "-0.01em", color: L.text, marginBottom: 6 }}>Set up your login</h1>
      <p style={{ fontSize: 14, color: L.muted, marginBottom: 24, lineHeight: 1.5 }}>
        So you can check your leads and bookings anytime. No password, just a one-click link emailed to you each time you sign in.
      </p>

      {sent ? (
        <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", padding: 18 }}>
          <p style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 700, color: "#15803d" }}>
            <CheckCircle2 style={{ width: 18, height: 18 }} /> Check your email
          </p>
          <p style={{ fontSize: 13, color: "#166534", marginTop: 6, lineHeight: 1.5 }}>
            We&apos;ve sent a sign-in link to {email}. That&apos;s it, you&apos;re all set up.
          </p>
        </div>
      ) : (
        <>
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
            type="button"
            onClick={handleSend}
            disabled={sending || !email.trim()}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%",
              fontSize: 14, fontWeight: 700, color: "#fff", background: "var(--accent)",
              border: "none", borderRadius: 0, padding: "11px 16px", cursor: sending ? "default" : "pointer",
            }}
          >
            <Mail style={{ width: 15, height: 15 }} /> {sending ? "Sending…" : "Email me a login link"}
          </button>
        </>
      )}
    </div>
  );
}

function StepHeader({ client, step, of }: { client: ClientInfo; step: number; of: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
      <p style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700, color: "#15803d" }}>
        <ShieldCheck style={{ width: 15, height: 15 }} /> Verified for {client.name}
      </p>
      <p style={{ fontSize: 12, fontWeight: 700, color: L.muted }}>Step {step} of {of}</p>
    </div>
  );
}

function ConnectRow({
  title, description, connected, error,
}: {
  title: string; description: string; connected: boolean; error?: string | null;
}) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${L.border}`, borderRadius: 0, padding: 18, marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <p style={{ fontSize: 14, fontWeight: 700, color: L.text }}>{title}</p>
          <p style={{ fontSize: 12.5, color: L.muted }}>{description}</p>
        </div>
        {connected && (
          <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700, color: "#15803d", flexShrink: 0 }}>
            <CheckCircle2 style={{ width: 16, height: 16 }} /> Connected
          </span>
        )}
      </div>
      {error && <p style={{ color: "#b91c1c", fontSize: 12.5, marginTop: 10 }}>Couldn&apos;t connect: {error}</p>}
    </div>
  );
}

// The one primary action per step — reads "Connect" and hits the real OAuth
// URL until that channel is actually connected, then flips to "Next" to
// advance. One button instead of a separate per-item Connect plus a
// separate step-level Next.
function PrimaryAction({ connected, href, onNext }: { connected: boolean; href: string; onNext: () => void }) {
  const style: React.CSSProperties = {
    display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", boxSizing: "border-box",
    fontSize: 14, fontWeight: 700, color: "#fff", background: "var(--accent)",
    border: "none", borderRadius: 0, padding: "11px 16px", cursor: "pointer", marginTop: 8, textDecoration: "none",
  };
  if (connected) {
    return (
      <button type="button" onClick={onNext} style={style}>
        Next <ArrowRight style={{ width: 15, height: 15 }} />
      </button>
    );
  }
  return <a href={href} style={style}>Connect</a>;
}

function AdsAccessCard({ done, confirming, onConfirm }: { done: boolean; confirming: boolean; onConfirm: () => void }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(LUCKY_FACEBOOK_EMAIL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div style={{ background: "#fff", border: `1px solid ${L.border}`, borderRadius: 0, padding: 18, marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: done ? 0 : 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 0, background: "var(--accent-tint)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
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
            Meta doesn&apos;t let us request this one with a click, you&apos;ll need to invite Lucky directly yourself in Meta Business Suite:
          </p>
          <ol style={{ fontSize: 12.5, color: L.text, lineHeight: 1.9, paddingLeft: 18, marginBottom: 12 }}>
            <li>Go to <strong>business.facebook.com/settings</strong> and open your Business Settings</li>
            <li><strong>Accounts → Ad accounts</strong>, select your ad account</li>
            <li>Click the <strong>People</strong> tab (not Partners) → <strong>+ Add person</strong></li>
            <li>Enter the email below and give him <strong>full control</strong> (or advertiser) access</li>
          </ol>

          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#f8fafc", border: `1px solid ${L.border}`, borderRadius: 0, padding: "8px 10px", marginBottom: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 10.5, fontWeight: 700, color: L.muted, textTransform: "uppercase", letterSpacing: "0.04em" }}>Lucky&apos;s email</p>
              <p style={{ fontSize: 13, fontWeight: 700, color: L.text, fontFamily: "monospace" }}>{LUCKY_FACEBOOK_EMAIL}</p>
            </div>
            <button
              type="button"
              onClick={handleCopy}
              style={{
                display: "flex", alignItems: "center", gap: 5, flexShrink: 0,
                fontSize: 12, fontWeight: 700, color: copied ? "#15803d" : L.text,
                background: "#fff", border: `1px solid ${L.border}`, borderRadius: 0, padding: "6px 10px", cursor: "pointer",
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
              width: "100%", fontSize: 13, fontWeight: 700, color: "#fff", background: "var(--accent)",
              border: "none", borderRadius: 0, padding: "9px 16px", cursor: confirming ? "default" : "pointer",
            }}
          >
            {confirming ? "Saving…" : "I've invited Lucky to my ad account"}
          </button>
        </>
      )}
    </div>
  );
}

function PageAccessCard({ done, confirming, onConfirm }: { done: boolean; confirming: boolean; onConfirm: () => void }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(LUCKY_FACEBOOK_EMAIL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div style={{ background: "#fff", border: `1px solid ${L.border}`, borderRadius: 0, padding: 18, marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: done ? 0 : 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 0, background: "var(--accent-tint)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <MessageCircle style={{ width: 18, height: 18 }} />
          </div>
          <div>
            <p style={{ fontSize: 14, fontWeight: 700, color: L.text }}>Facebook Page</p>
            <p style={{ fontSize: 12.5, color: L.muted }}>So we can manage your Page, messages and leads.</p>
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
            Facebook doesn&apos;t let us request this one with a click either, you&apos;ll need to invite Lucky as an admin on your Page yourself:
          </p>
          <ol style={{ fontSize: 12.5, color: L.text, lineHeight: 1.9, paddingLeft: 18, marginBottom: 12 }}>
            <li>Go to your Facebook Page &rarr; <strong>Settings → Page access</strong> (or <strong>Page roles</strong> on the classic Pages experience)</li>
            <li>Click <strong>Add person</strong> under people with Facebook access</li>
            <li>Enter the email below and add him</li>
            <li>Give him <strong>full control / admin</strong> access and confirm</li>
          </ol>

          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#f8fafc", border: `1px solid ${L.border}`, borderRadius: 0, padding: "8px 10px", marginBottom: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 10.5, fontWeight: 700, color: L.muted, textTransform: "uppercase", letterSpacing: "0.04em" }}>Lucky&apos;s email</p>
              <p style={{ fontSize: 13, fontWeight: 700, color: L.text, fontFamily: "monospace" }}>{LUCKY_FACEBOOK_EMAIL}</p>
            </div>
            <button
              type="button"
              onClick={handleCopy}
              style={{
                display: "flex", alignItems: "center", gap: 5, flexShrink: 0,
                fontSize: 12, fontWeight: 700, color: copied ? "#15803d" : L.text,
                background: "#fff", border: `1px solid ${L.border}`, borderRadius: 0, padding: "6px 10px", cursor: "pointer",
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
              width: "100%", fontSize: 13, fontWeight: 700, color: "#fff", background: "var(--accent)",
              border: "none", borderRadius: 0, padding: "9px 16px", cursor: confirming ? "default" : "pointer",
            }}
          >
            {confirming ? "Saving…" : "I've added Lucky as an admin"}
          </button>
        </>
      )}
    </div>
  );
}

const spinnerStyle: React.CSSProperties = {
  width: 28, height: 28, borderRadius: "50%",
  border: "3px solid #fecdd3", borderTopColor: "var(--accent)",
  animation: "connect-spin 0.8s linear infinite",
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="connect-shell" style={{ minHeight: "100vh", display: "flex", background: "#fff" }}>
      <style>{`
        @keyframes connect-spin { to { transform: rotate(360deg); } }
        .connect-shell { flex-direction: row; }
        .connect-brand { flex: 1 1 70%; min-width: 320px; padding: 48px 56px; }
        .connect-brand-logo { height: 70px; }
        .connect-brand-headline { font-size: 52px; }
        @media (max-width: 780px) {
          .connect-shell { flex-direction: column; }
          .connect-brand { flex: none; min-width: 0; padding: 28px 20px 8px; }
          .connect-brand-logo { height: 56px; }
          .connect-brand-headline { font-size: 30px; }
          .connect-content { flex: none !important; min-width: 0 !important; width: 100%; box-sizing: border-box; padding: 20px !important; border-left: none !important; border-top: 1px solid #e6eaf0; }
        }
      `}</style>

      {/* Branding panel */}
      <div className="connect-brand" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <a href="/connect" style={{ alignSelf: "flex-start" }}>
          <img src="/logo.png" alt="LS Growth" className="connect-brand-logo" style={{ width: "auto", maxWidth: "100%", objectFit: "contain" }} />
        </a>

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
      <div className="connect-content" style={{ flex: "1 1 30%", minWidth: 380, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, borderLeft: "1px solid #e6eaf0" }}>
        <div style={{ width: "100%", maxWidth: 440 }}>{children}</div>
      </div>
    </div>
  );
}
