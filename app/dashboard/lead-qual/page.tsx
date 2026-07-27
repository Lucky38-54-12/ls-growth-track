"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Topbar from "@/components/Topbar";
import { CalendarCheck, Plus, MessageCircle, Megaphone } from "lucide-react";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };

interface LqClient {
  id: string;
  name: string;
  trade: string | null;
  phone: string | null;
  status: string;
  ads_manager_access_confirmed_at: string | null;
  lq_calendar_connections: { google_account_email: string; connected_at: string }[] | null;
  lq_channels: { type: string; external_page_id: string }[] | null;
}

export default function LeadQualPage() {
  return (
    <Suspense fallback={null}>
      <LeadQualPageInner />
    </Suspense>
  );
}

function LeadQualPageInner() {
  const searchParams = useSearchParams();
  const [clients, setClients] = useState<LqClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [trade, setTrade] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  function handleCopyLink(clientId: string) {
    const url = `${window.location.origin}/connect/${clientId}`;
    navigator.clipboard.writeText(url);
    setCopiedId(clientId);
    setTimeout(() => setCopiedId((id) => (id === clientId ? null : id)), 2000);
  }

  async function loadClients() {
    setLoading(true);
    const res = await fetch("/api/lead-qual/clients");
    const body = await res.json();
    if (res.ok) setClients(body.clients);
    else setError(body.error);
    setLoading(false);
  }

  useEffect(() => {
    loadClients();
  }, []);

  const oauthError = searchParams.get("error");
  const connectedId = searchParams.get("connected");
  const fbError = searchParams.get("fbError");

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/lead-qual/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, trade, phone }),
    });
    const body = await res.json();
    if (!res.ok) {
      setError(body.error);
      return;
    }
    setName("");
    setTrade("");
    setPhone("");
    loadClients();
  }

  return (
    <div style={{ background: "#f1f5f9", minHeight: "100vh" }}>
      <Topbar title="Lead Qualification" subtitle="AI-qualified Meta leads, booked straight onto each client's calendar" />

      <div style={{ padding: "20px 28px 60px", display: "flex", flexDirection: "column", gap: 16, maxWidth: 720 }}>
        {oauthError && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", padding: "10px 14px", fontSize: 13, borderRadius: 8 }}>
            Couldn&apos;t connect calendar: {oauthError}
          </div>
        )}
        {connectedId && (
          <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#15803d", padding: "10px 14px", fontSize: 13, borderRadius: 8 }}>
            Calendar connected successfully.
          </div>
        )}
        {fbError && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", padding: "10px 14px", fontSize: 13, borderRadius: 8 }}>
            Couldn&apos;t connect Facebook Page: {fbError}
          </div>
        )}

        <form onSubmit={handleCreate} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            type="text"
            required
            placeholder="Business name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ flex: "1 1 160px", padding: "8px 12px", fontSize: 13, border: `1px solid ${L.border}`, borderRadius: 8 }}
          />
          <input
            type="text"
            placeholder="Trade (e.g. electrician)"
            value={trade}
            onChange={(e) => setTrade(e.target.value)}
            style={{ flex: "1 1 160px", padding: "8px 12px", fontSize: 13, border: `1px solid ${L.border}`, borderRadius: 8 }}
          />
          <input
            type="text"
            placeholder="Client phone (for SMS)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            style={{ flex: "1 1 160px", padding: "8px 12px", fontSize: 13, border: `1px solid ${L.border}`, borderRadius: 8 }}
          />
          <button
            type="submit"
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: "var(--red)", color: "#fff", border: "none",
              padding: "8px 16px", fontSize: 13, fontWeight: 700, borderRadius: 8, cursor: "pointer",
            }}
          >
            <Plus style={{ width: 14, height: 14 }} /> Add client
          </button>
        </form>

        {error && <p style={{ color: "#b91c1c", fontSize: 13 }}>{error}</p>}

        {loading ? (
          <p style={{ color: L.dimmed, fontSize: 13 }}>Loading…</p>
        ) : clients.length === 0 ? (
          <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 10, padding: 32, textAlign: "center", color: L.dimmed, fontSize: 13 }}>
            No clients yet — add one above to start qualifying their Meta leads.
          </div>
        ) : (
          <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 10, overflow: "hidden" }}>
            {clients.map((client) => {
              const connection = client.lq_calendar_connections?.[0];
              const fbConnection = client.lq_channels?.find((c) => c.type === "messenger");
              return (
                <div
                  key={client.id}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "14px 16px", borderBottom: `1px solid ${L.border}`, flexWrap: "wrap", gap: 8,
                  }}
                >
                  <Link href={`/dashboard/lead-qual/${client.id}`} style={{ textDecoration: "none" }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: L.text }}>{client.name}</p>
                    <p style={{ fontSize: 12, color: L.muted }}>
                      {client.trade || "No trade set"}{client.phone ? ` · ${client.phone}` : ""} · click to configure &amp; test
                    </p>
                  </Link>
                  <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: fbConnection ? "#15803d" : L.dimmed }}>
                      <MessageCircle style={{ width: 14, height: 14 }} />
                      {fbConnection ? "Facebook connected" : "Facebook not connected"}
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: connection ? "#15803d" : L.dimmed }}>
                      <CalendarCheck style={{ width: 14, height: 14 }} />
                      {connection ? `Calendar connected (${connection.google_account_email})` : "Calendar not connected"}
                    </span>
                    <span
                      title="Self-reported by the client, not verified — check Business Manager to confirm it actually landed"
                      style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: client.ads_manager_access_confirmed_at ? "#15803d" : L.dimmed }}
                    >
                      <Megaphone style={{ width: 14, height: 14 }} />
                      {client.ads_manager_access_confirmed_at ? "Ads access claimed" : "Ads access not confirmed"}
                    </span>
                    {(!fbConnection || !connection || !client.ads_manager_access_confirmed_at) && (
                      <button
                        type="button"
                        onClick={() => handleCopyLink(client.id)}
                        style={{
                          display: "flex", alignItems: "center", gap: 6,
                          fontSize: 12.5, fontWeight: 700, color: copiedId === client.id ? "#15803d" : "var(--red)",
                          border: `1px solid ${copiedId === client.id ? "#15803d" : "var(--red)"}`, borderRadius: 8,
                          padding: "6px 12px", background: "none", cursor: "pointer",
                        }}
                      >
                        {copiedId === client.id ? "Link copied" : "Copy client link"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
