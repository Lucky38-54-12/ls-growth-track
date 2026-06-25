"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setLoading(false);
    if (res.ok) {
      router.push(params.get("next") || "/dashboard");
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Something went wrong");
    }
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", background: "#f5f5f5" }}>
      <form onSubmit={handleSubmit} style={{ background: "white", padding: 32, borderRadius: 8, boxShadow: "0 2px 12px rgba(0,0,0,0.08)", width: 320 }}>
        <h1 style={{ fontSize: 20, marginBottom: 16, color: "#0f172a" }}>LS Growth</h1>
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          style={{ width: "100%", padding: 10, marginBottom: 12, border: "1px solid #ddd", borderRadius: 6, boxSizing: "border-box" }}
        />
        {error && <p style={{ color: "#c00", fontSize: 13, marginBottom: 12 }}>{error}</p>}
        <button
          type="submit"
          disabled={loading}
          style={{ width: "100%", padding: 10, background: "#111", color: "white", border: "none", borderRadius: 6, cursor: "pointer" }}
        >
          {loading ? "Checking..." : "Log in"}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
