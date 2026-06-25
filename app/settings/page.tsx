"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b" };

export default function SettingsPage() {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div style={{ padding: 32, maxWidth: 640 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, color: L.text, marginBottom: 4 }}>Settings</h1>
      <p style={{ color: L.muted, marginBottom: 24 }}>Manage your dashboard access</p>

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
            background: "var(--red)",
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
    </div>
  );
}
