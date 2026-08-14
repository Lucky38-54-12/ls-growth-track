"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b" };

interface GoogleStatus {
  connected: boolean;
  email: string | null;
}

export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsPageInner />
    </Suspense>
  );
}

function SettingsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loggingOut, setLoggingOut] = useState(false);
  const [googleStatus, setGoogleStatus] = useState<GoogleStatus | null>(null);

  const googleConnected = searchParams.get("googleConnected");
  const googleError = searchParams.get("googleError");

  useEffect(() => {
    fetch("/api/admin/google-connect/status")
      .then((r) => r.json())
      .then(setGoogleStatus)
      .catch(() => setGoogleStatus({ connected: false, email: null }));
  }, [googleConnected]);

  async function handleLogout() {
    setLoggingOut(true);
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div style={{ padding: 32, maxWidth: 640, display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: L.text, marginBottom: 4 }}>Settings</h1>
        <p style={{ color: L.muted, marginBottom: 24 }}>Manage your dashboard access</p>
      </div>

      <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 8, padding: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: L.text, marginBottom: 8 }}>Account</h2>
        <p style={{ color: L.muted, fontSize: 14, marginBottom: 16 }}>
          You're logged in. You'll stay logged in on this browser until you log out.
        </p>
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          style={{
            padding: "10px 16px",
            background: "var(--accent)",
            color: "white",
            border: "none",
            borderRadius: 6,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {loggingOut ? "Logging out..." : "Log out"}
        </button>
      </div>

      <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 8, padding: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: L.text, marginBottom: 8 }}>Google Docs Connection</h2>
        <p style={{ color: L.muted, fontSize: 14, marginBottom: 16 }}>
          Connect your own Google account so the Brain (campaign briefs, call prep, agreements) creates real Google
          Docs under your account — with your real storage quota — instead of a bare service account that can't
          create files at all.
        </p>

        {googleConnected && (
          <p style={{ color: "#16a34a", fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Connected successfully.</p>
        )}
        {googleError && (
          <p style={{ color: "#dc2626", fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
            Couldn&apos;t connect: {googleError}
          </p>
        )}

        {googleStatus?.connected ? (
          <p style={{ color: L.text, fontSize: 14, marginBottom: 16 }}>
            Connected as <strong>{googleStatus.email}</strong>.
          </p>
        ) : (
          <p style={{ color: L.muted, fontSize: 14, marginBottom: 16 }}>Not connected yet.</p>
        )}

        <a
          href="/api/admin/google-connect"
          style={{
            display: "inline-block",
            padding: "10px 16px",
            background: googleStatus?.connected ? "#fff" : "var(--accent)",
            color: googleStatus?.connected ? L.text : "white",
            border: googleStatus?.connected ? `1px solid ${L.border}` : "none",
            borderRadius: 6,
            fontWeight: 600,
            textDecoration: "none",
            fontSize: 14,
          }}
        >
          {googleStatus?.connected ? "Reconnect Google" : "Connect Google"}
        </a>
      </div>
    </div>
  );
}
