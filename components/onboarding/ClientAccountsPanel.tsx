"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CalendarCheck, Plus, MessageCircle, Megaphone, ExternalLink, FileText } from "lucide-react";
import AgreementModal from "@/components/onboarding/AgreementModal";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };

interface LqClient {
  id: string;
  name: string;
  trade: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  ads_manager_access_confirmed_at: string | null;
  page_access_confirmed_at: string | null;
  // lq_calendar_connections.client_id is unique, so PostgREST embeds this as
  // a single object, not an array.
  lq_calendar_connections: { google_account_email: string; connected_at: string } | null;
  lq_channels: { type: string; external_page_id: string }[] | null;
}

// The per-client Meta ads / Facebook Page / calendar setup list, moved here
// from the old standalone /dashboard/lead-qual "Clients" tab so it lives as
// a tab on the Client Onboarding page instead of a separate, confusingly
// same-named "Onboarding" nav item. The per-client "configure & test" page
// it links to (/dashboard/lead-qual/[id]) is untouched.
export default function ClientAccountsPanel() {
  return (
    <Suspense fallback={null}>
      <ClientAccountsPanelInner />
    </Suspense>
  );
}

function ClientAccountsPanelInner() {
  const searchParams = useSearchParams();
  const [clients, setClients] = useState<LqClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [trade, setTrade] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [agreementClient, setAgreementClient] = useState<LqClient | null>(null);
  const [editingEmailId, setEditingEmailId] = useState<string | null>(null);
  const [emailDraft, setEmailDraft] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);

  function startEditEmail(client: LqClient) {
    setEditingEmailId(client.id);
    setEmailDraft(client.email || "");
  }

  async function saveEmail(clientId: string) {
    setSavingEmail(true);
    await fetch(`/api/lead-qual/clients/${clientId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: emailDraft.trim() }),
    });
    setSavingEmail(false);
    setEditingEmailId(null);
    loadClients();
  }

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
  const fbError = searchParams.get("fbError");

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/lead-qual/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, trade, phone, email }),
    });
    const body = await res.json();
    if (!res.ok) {
      setError(body.error);
      return;
    }
    setName("");
    setTrade("");
    setPhone("");
    setEmail("");
    loadClients();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 720 }}>
      {oauthError && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", padding: "10px 14px", fontSize: 13, borderRadius: 8 }}>
          Couldn&apos;t connect calendar: {oauthError}
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
        <input
          type="email"
          placeholder="Client email (for booking alerts)"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ flex: "1 1 200px", padding: "8px 12px", fontSize: 13, border: `1px solid ${L.border}`, borderRadius: 8 }}
        />
        <button
          type="submit"
          style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "var(--accent)", color: "#fff", border: "none",
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
            const connection = client.lq_calendar_connections;
            const fbConnection = client.lq_channels?.find((c) => c.type === "messenger");
            return (
              <div
                key={client.id}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "14px 16px", borderBottom: `1px solid ${L.border}`, flexWrap: "wrap", gap: 8,
                }}
              >
                <div>
                  <Link href={`/dashboard/lead-qual/${client.id}`} style={{ textDecoration: "none" }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: L.text }}>{client.name}</p>
                    <p style={{ fontSize: 12, color: L.muted }}>
                      {client.trade || "No trade set"}{client.phone ? ` · ${client.phone}` : ""} · click to configure &amp; test
                    </p>
                  </Link>
                  {editingEmailId === client.id ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                      <input
                        type="email"
                        autoFocus
                        value={emailDraft}
                        onChange={(e) => setEmailDraft(e.target.value)}
                        placeholder="client@business.co.nz"
                        style={{ fontSize: 12, padding: "4px 8px", border: `1px solid ${L.border}`, borderRadius: 6 }}
                      />
                      <button
                        type="button"
                        onClick={() => saveEmail(client.id)}
                        disabled={savingEmail}
                        style={{ fontSize: 11.5, fontWeight: 700, color: "#fff", background: "var(--accent)", border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}
                      >
                        {savingEmail ? "Saving…" : "Save"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingEmailId(null)}
                        style={{ fontSize: 11.5, color: L.muted, background: "none", border: "none", cursor: "pointer" }}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => startEditEmail(client)}
                      style={{ fontSize: 11.5, color: client.email ? L.muted : "var(--accent)", background: "none", border: "none", cursor: "pointer", padding: 0, marginTop: 2 }}
                    >
                      {client.email ? `📧 ${client.email} (booking alerts)` : "+ Add email for booking alerts"}
                    </button>
                  )}
                </div>
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
                  <span
                    title="Self-reported by the client, not verified — Connect Facebook below to confirm it actually landed"
                    style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: client.page_access_confirmed_at ? "#15803d" : L.dimmed }}
                  >
                    <MessageCircle style={{ width: 14, height: 14 }} />
                    {client.page_access_confirmed_at ? "Page access claimed" : "Page access not confirmed"}
                  </span>
                  <a
                    href={`/api/lead-qual/oauth/facebook?clientId=${client.id}`}
                    title={fbConnection ? "Re-runs the Facebook OAuth consent — needed after scopes change, since the existing token can't be upgraded in place" : undefined}
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      fontSize: 12.5, fontWeight: 700, color: "var(--accent)",
                      border: "1px solid var(--accent)", borderRadius: 8,
                      padding: "6px 12px", background: "none", textDecoration: "none",
                    }}
                  >
                    <MessageCircle style={{ width: 13, height: 13 }} /> {fbConnection ? "Reconnect Facebook" : "Connect Facebook"}
                  </a>
                  {(!fbConnection || !connection || !client.ads_manager_access_confirmed_at || !client.page_access_confirmed_at) && (
                    <button
                      type="button"
                      onClick={() => handleCopyLink(client.id)}
                      style={{
                        display: "flex", alignItems: "center", gap: 6,
                        fontSize: 12.5, fontWeight: 700, color: copiedId === client.id ? "#15803d" : "var(--accent)",
                        border: `1px solid ${copiedId === client.id ? "#15803d" : "var(--accent)"}`, borderRadius: 8,
                        padding: "6px 12px", background: "none", cursor: "pointer",
                      }}
                    >
                      {copiedId === client.id ? "Link copied" : "Copy client link"}
                    </button>
                  )}
                  <a
                    href={`/api/lead-qual/clients/${client.id}/view-portal`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      fontSize: 12.5, fontWeight: 700, color: L.muted,
                      border: `1px solid ${L.border}`, borderRadius: 8,
                      padding: "6px 12px", background: "none", textDecoration: "none",
                    }}
                  >
                    <ExternalLink style={{ width: 13, height: 13 }} /> View portal
                  </a>
                  <button
                    type="button"
                    onClick={() => setAgreementClient(client)}
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      fontSize: 12.5, fontWeight: 700, color: L.muted,
                      border: `1px solid ${L.border}`, borderRadius: 8,
                      padding: "6px 12px", background: "none", cursor: "pointer",
                    }}
                  >
                    <FileText style={{ width: 13, height: 13 }} /> Make agreement
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {agreementClient && (
        <AgreementModal
          client={{ name: agreementClient.name, trade: agreementClient.trade, email: agreementClient.email }}
          onClose={() => setAgreementClient(null)}
        />
      )}
    </div>
  );
}
