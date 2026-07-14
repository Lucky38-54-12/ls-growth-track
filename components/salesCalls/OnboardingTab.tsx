"use client";
import Link from "next/link";
import PipelineBoard from "@/components/PipelineBoard";
import { Lead, EngagementSummary, OnboardingClient } from "@/lib/types";
import { ONBOARDING_PIPELINE_COLUMNS } from "@/lib/onboardingSteps";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };

interface Props {
  pipelineLeads: Lead[];
  engagement: Record<string, EngagementSummary>;
  clients: OnboardingClient[];
}

export default function OnboardingTab({ pipelineLeads, engagement, clients }: Props) {
  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <PipelineBoard
          sections={[{ key: "onboarding", label: `${pipelineLeads.length} in pipeline`, leads: pipelineLeads }]}
          columns={ONBOARDING_PIPELINE_COLUMNS}
          engagement={engagement}
          activeSource="onboarding"
        />
      </div>

      <div style={{ maxWidth: 1080, margin: "0 auto 24px" }}>
        <div style={{ fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, fontWeight: 800, marginBottom: 10 }}>
          Onboarding clients
        </div>
        {clients.length === 0 ? (
          <div style={{ background: L.surface, border: `1px solid ${L.border}`, padding: 24, textAlign: "center", color: L.dimmed, fontSize: 13 }}>
            No clients yet. Log a call on the Log a Call tab, then send a recap from there once someone's ready to move forward.
          </div>
        ) : (
          <div style={{ background: L.surface, border: `1px solid ${L.border}` }}>
            {clients.map((c) => {
              const total = 10;
              const pct = Math.round(((c.completed_steps || []).length / total) * 100);
              return (
                <Link
                  key={c.id}
                  href={`/dashboard/sales-calls/onboarding/${c.id}`}
                  className="row-hover"
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", borderBottom: `1px solid ${L.border}`, textDecoration: "none" }}
                >
                  <span style={{ fontSize: 13, fontWeight: 700, color: L.text, minWidth: 0, flex: 1 }}>
                    {c.company} <span style={{ fontWeight: 500, color: L.muted }}>· {c.name}</span>
                  </span>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20,
                    background: c.decision_status === "ready" ? "#dcfce7" : "#fef9c3",
                    color: c.decision_status === "ready" ? "#15803d" : "#854d0e",
                    flexShrink: 0,
                  }}>
                    {c.decision_status === "ready" ? "Ready to onboard" : "Still deciding"}
                  </span>
                  {c.decision_status === "ready" && (
                    <span style={{ fontSize: 11, color: L.muted, flexShrink: 0, width: 70, textAlign: "right" }}>{pct}% done</span>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
