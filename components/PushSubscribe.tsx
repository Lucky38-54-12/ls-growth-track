"use client";

import { useEffect, useState } from "react";

// Renders nothing once subscribed/denied — only shows a prompt when the
// browser supports push and the user hasn't decided yet, so it doesn't
// nag on every page load.
function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64Safe);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export default function PushSubscribe() {
  const [status, setStatus] = useState<"hidden" | "prompt" | "subscribing" | "done">("hidden");

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    if (Notification.permission === "default") setStatus("prompt");
  }, []);

  async function subscribe() {
    setStatus("subscribing");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setStatus("hidden");
      const reg = await navigator.serviceWorker.ready;
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) return setStatus("hidden");
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub),
      });
      setStatus("done");
    } catch {
      setStatus("hidden");
    }
  }

  if (status !== "prompt") return null;

  return (
    <div
      style={{
        position: "fixed", bottom: 16, right: 16, background: "#0f172a", color: "#fff",
        padding: "12px 16px", borderRadius: 10, boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
        zIndex: 1000, display: "flex", alignItems: "center", gap: 12, maxWidth: 320,
      }}
    >
      <span style={{ fontSize: 14 }}>Get the morning call list pushed to your phone?</span>
      <button
        onClick={subscribe}
        style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: 6, padding: "6px 12px", cursor: "pointer", whiteSpace: "nowrap" }}
      >
        Enable
      </button>
      <button
        onClick={() => setStatus("hidden")}
        style={{ background: "transparent", color: "#94a3b8", border: "none", cursor: "pointer" }}
      >
        ✕
      </button>
    </div>
  );
}
