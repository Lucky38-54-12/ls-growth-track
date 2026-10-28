"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Topbar from "@/components/Topbar";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };

interface Lead {
  id: string;
  outcome: string;
  pipeline_stage: string | null;
  job_value: number | null;
  job_won_at: string | null;
  job_lost_reason: string | null;
  created_at: string;
  contact_email: string | null;
  lq_conversations: { extracted_fields: Record<string, unknown> } | null;
}

type Period = "30" | "90" | "all";

const PERIOD_LABEL: Record<Period, string> = { "30": "Last 30 days", "90": "Last 90 days", all: "All time" };

function leadName(lead: Lead): string {
  const fields = lead.lq_conversations?.extracted_fields || {};
  return String(fields.name || lead.contact_email || "Unknown");
}

function jobType(lead: Lead): string {
  const fields = lead.lq_conversations?.extracted_fields || {};
  return String(fields.job_type || "");
}

export default function JobReportPage() {
  const params = useParams<{ id: string }>();
  const { id } = params;

  const [clientName, setClientName] = useState<string | null>(null);
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>("30");

  useEffect(() => {
    fetch(`/api/lead-qual/clients/${id}/job-report`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error || "Couldn't load report");
        return r.json();
      })
      .then((data) => {
        setClientName(data.client?.name || null);
        setLeads(data.leads || []);
      })
      .catch((e) => setError(e.message));
  }, [id]);

  const filtered = useMemo(() => {
    if (!leads) return [];
    if (period === "all") return leads;
    const cutoff = Date.now() - Number(period) * 24 * 60 * 60 * 1000;
    return leads.filter((l) => new Date(l.created_at).getTime() >= cutoff);
  }, [leads, period]);

  const won = filtered.filter((l) => l.job_won_at);
  const lost = filtered.filter((l) => l.job_lost_reason);
  const totalValue = won.reduce((sum, l) => sum + (l.job_value || 0), 0);
  const pending = filtered.filter((l) => !l.job_won_at && !l.job_lost_reason && l.outcome === "qualified");

  if (error) {
    return <div style={{ padding: 40, color: "#b91c1c", fontSize: 13 }}>{error}</div>;
  }

  if (!leads) {
    return <div style={{ padding: 40, color: L.dimmed, fontSize: 13 }}>Loading…</div>;
  }

  return (
    <div style={{ background: "#f1f5f9", minHeight: "100vh" }}>
      <Topbar title={clientName ? `${clientName} — Job Report` : "Job Report"} subtitle="Pull this up live in the client check-in" />

      <div style={{ margin: "20px 28px 0", display: "flex", gap: 8 }}>
        {(Object.keys(PERIOD_LABEL) as Period[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            style={{
              padding: "6px 14px",
              borderRadius: 8,
              border: `1px solid ${period === p ? "#15803d" : L.border}`,
              background: period === p ? "#f0fdf4" : "#fff",
              color: period === p ? "#15803d" : L.muted,
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {PERIOD_LABEL[p]}
          </button>
        ))}
      </div>

      <div style={{ margin: "16px 28px 0", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        <StatTile label="Leads" value={String(filtered.length)} />
        <StatTile label="Jobs won" value={String(won.length)} color="#15803d" />
        <StatTile label="Jobs lost" value={String(lost.length)} color="#b91c1c" />
        <StatTile label="Total value" value={`$${totalValue.toLocaleString()}`} color="#15803d" />
        <StatTile label="Awaiting outcome" value={String(pending.length)} color="#b45309" />
      </div>

      {won.length > 0 && (
        <Section title="Won">
          {won.map((l) => (
            <Row key={l.id} name={leadName(l)} detail={jobType(l)} right={l.job_value ? `$${l.job_value.toLocaleString()}` : "No value logged"} color="#15803d" />
          ))}
        </Section>
      )}

      {lost.length > 0 && (
        <Section title="Lost">
          {lost.map((l) => (
            <Row key={l.id} name={leadName(l)} detail={jobType(l)} right={l.job_lost_reason || "Didn't convert"} color="#b91c1c" />
          ))}
        </Section>
      )}

      {pending.length > 0 && (
        <Section title="Still waiting on an outcome">
          {pending.map((l) => (
            <Row key={l.id} name={leadName(l)} detail={jobType(l)} right={new Date(l.created_at).toLocaleDateString()} color="#b45309" />
          ))}
        </Section>
      )}
    </div>
  );
}

function StatTile({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 10, padding: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: L.muted, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: color || L.text }}>{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ margin: "20px 28px 0" }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: L.muted, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.04em" }}>{title}</div>
      <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 10, overflow: "hidden" }}>{children}</div>
    </div>
  );
}

function Row({ name, detail, right, color }: { name: string; detail: string; right: string; color: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: `1px solid ${L.border}` }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: L.text }}>{name}</div>
        {detail && <div style={{ fontSize: 12, color: L.muted }}>{detail}</div>}
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color }}>{right}</div>
    </div>
  );
}
