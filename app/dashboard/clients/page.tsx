"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Topbar from "@/components/Topbar";
import { ExternalLink, Calendar, Mail, Columns3, Settings, CheckCircle2, XCircle } from "lucide-react";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };

interface LqClient {
  id: string;
  name: string;
  trade: string | null;
  status: string;
  logo_url: string | null;
  lq_calendar_connections: { google_account_email: string; connected_at: string } | null;
  lq_channels: { type: string; external_page_id: string }[] | null;
}

interface LeadSummary {
  id: string;
  outcome: string;
  booking_status: string | null;
  pipeline_stage: string | null;
}

export default function ClientsPage() {
  const [clients, setClients] = useState<LqClient[]>([]);
  const [leadCounts, setLeadCounts] = useState<Record<string, { total: number; booked: number }>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const res = await fetch("/api/lead-qual/clients");
      const body = await res.json();
      const list: LqClient[] = res.ok ? body.clients : [];
      setClients(list);
      setLoading(false);

      const entries = await Promise.all(
        list.map(async (c) => {
          const r = await fetch(`/api/lead-qual/clients/${c.id}/leads`);
          const b = await r.json();
          const leads: LeadSummary[] = r.ok ? b.leads : [];
          const booked = leads.filter((l) => l.booking_status === "booked" || l.pipeline_stage === "booked").length;
          return [c.id, { total: leads.length, booked }] as const;
        })
      );
      setLeadCounts(Object.fromEntries(entries));
    })();
  }, []);

  function portalUrl(clientId: string, next?: string) {
    const url = `/api/lead-qual/clients/${clientId}/view-portal`;
    return next ? `${url}?next=${encodeURIComponent(next)}` : url;
  }

  return (
    <div style={{ background: "#f1f5f9", minHeight: "100vh" }}>
      <Topbar title="Clients" subtitle="Jump into any client's portal, calendar or email sequence" />

      <div style={{ padding: "20px 28px 60px" }}>
        {loading ? (
          <p style={{ color: L.dimmed, fontSize: 13 }}>Loading…</p>
        ) : clients.length === 0 ? (
          <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 10, padding: 32, textAlign: "center", color: L.dimmed, fontSize: 13 }}>
            No clients yet — add one under Onboarding first.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
            {clients.map((client) => {
              const calendarConnected = !!client.lq_calendar_connections;
              const fbConnected = !!client.lq_channels?.some((c) => c.type === "messenger");
              const counts = leadCounts[client.id];

              return (
                <div key={client.id} style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      <div style={{ width: 38, height: 38, borderRadius: 10, background: "#f1f5f9", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: L.text, overflow: "hidden" }}>
                        {client.logo_url ? (
                          <img src={client.logo_url} alt={client.name} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                        ) : (
                          client.name.slice(0, 2).toUpperCase()
                        )}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontSize: 14, fontWeight: 700, color: L.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{client.name}</p>
                        <p style={{ fontSize: 12, color: L.muted }}>{client.trade || "No trade set"}</p>
                      </div>
                    </div>
                    <Link href={`/dashboard/lead-qual/${client.id}`} title="Manage onboarding & setup" style={{ color: L.dimmed, flexShrink: 0 }}>
                      <Settings style={{ width: 15, height: 15 }} />
                    </Link>
                  </div>

                  <div style={{ display: "flex", gap: 14, fontSize: 11.5, color: L.muted }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      {calendarConnected ? <CheckCircle2 style={{ width: 12, height: 12, color: "#15803d" }} /> : <XCircle style={{ width: 12, height: 12, color: "#cbd5e1" }} />}
                      Calendar
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      {fbConnected ? <CheckCircle2 style={{ width: 12, height: 12, color: "#15803d" }} /> : <XCircle style={{ width: 12, height: 12, color: "#cbd5e1" }} />}
                      Facebook
                    </span>
                    {counts && (
                      <span>{counts.total} leads · {counts.booked} booked</span>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <a href={portalUrl(client.id)} target="_blank" rel="noreferrer" className="card-hover" style={{
                      display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 700, color: "#fff",
                      background: "var(--accent)", border: "none", borderRadius: 7, padding: "7px 10px", textDecoration: "none",
                    }}>
                      <ExternalLink style={{ width: 12, height: 12 }} /> Open portal
                    </a>
                    <a href={portalUrl(client.id, "/portal/calendar")} target="_blank" rel="noreferrer" className="card-hover" style={{
                      display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 700, color: L.text,
                      background: "#f8fafc", border: `1px solid ${L.border}`, borderRadius: 7, padding: "7px 10px", textDecoration: "none",
                    }}>
                      <Calendar style={{ width: 12, height: 12 }} /> Calendar
                    </a>
                    <a href={portalUrl(client.id, "/portal/email-sequence")} target="_blank" rel="noreferrer" className="card-hover" style={{
                      display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 700, color: L.text,
                      background: "#f8fafc", border: `1px solid ${L.border}`, borderRadius: 7, padding: "7px 10px", textDecoration: "none",
                    }}>
                      <Mail style={{ width: 12, height: 12 }} /> Emails
                    </a>
                    <a href={portalUrl(client.id, "/portal/pipeline")} target="_blank" rel="noreferrer" className="card-hover" style={{
                      display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 700, color: L.text,
                      background: "#f8fafc", border: `1px solid ${L.border}`, borderRadius: 7, padding: "7px 10px", textDecoration: "none",
                    }}>
                      <Columns3 style={{ width: 12, height: 12 }} /> Pipeline
                    </a>
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
