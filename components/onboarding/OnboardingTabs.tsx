"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { OnboardingClient, SalesCall } from "@/lib/types";
import { ONBOARDING_STEPS } from "@/lib/onboardingSteps";
import ClientAccountsPanel from "@/components/onboarding/ClientAccountsPanel";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "accounts", label: "Client Accounts" },
] as const;
type TabKey = typeof TABS[number]["key"];

function pill(bg: string, color: string, label: string) {
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: bg, color, whiteSpace: "nowrap" }}>
      {label}
    </span>
  );
}

function outcomePill(outcome: SalesCall["outcome"]) {
  const map: Record<SalesCall["outcome"], [string, string, string]> = {
    closed: ["#dcfce7", "#166534", "Closed"],
    follow_up: ["#fef3c7", "#92400e", "Follow up"],
    undecided: ["#f1f5f9", "#475569", "Undecided"],
    dead: ["#fee2e2", "#991b1b", "Dead"],
  };
  const [bg, color, label] = map[outcome];
  return pill(bg, color, label);
}

function recapPill(status: SalesCall["recap_status"] | undefined) {
  if (status === "sent") return pill("#dcfce7", "#166534", "Recap sent");
  if (status === "pending") return pill("#fef3c7", "#92400e", "Recap pending");
  return pill("#f1f5f9", "#94a3b8", "No recap");
}

function agreementPill(status: SalesCall["agreement_status"] | undefined) {
  if (status === "generated") return pill("#dbeafe", "#1e40af", "Agreement drafted");
  if (status === "failed") return pill("#fee2e2", "#991b1b", "Agreement failed");
  return pill("#f1f5f9", "#94a3b8", "No agreement");
}

function kickoffPill(status: OnboardingClient["kickoff_email_status"]) {
  if (status === "sent") return pill("#dcfce7", "#166534", "Kickoff sent");
  if (status === "pending") return pill("#fef3c7", "#92400e", "Kickoff pending");
  return pill("#f1f5f9", "#94a3b8", "No kickoff email");
}

interface Props {
  clients: OnboardingClient[];
  callsById: Record<string, SalesCall>;
}

export default function OnboardingTabs(props: Props) {
  return (
    <Suspense fallback={null}>
      <OnboardingTabsInner {...props} />
    </Suspense>
  );
}

function OnboardingTabsInner({ clients, callsById }: Props) {
  const searchParams = useSearchParams();
  const initialTab: TabKey = searchParams.get("tab") === "accounts" ? "accounts" : "overview";
  const [tab, setTab] = useState<TabKey>(initialTab);

  return (
    <div>
      <div style={{ padding: "0 28px 20px", display: "flex", gap: 4 }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", border: "none",
              background: tab === t.key ? "var(--accent)" : "#e2e8f0",
              color: tab === t.key ? "#fff" : L.muted,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ padding: "0 28px 60px" }}>
        {tab === "accounts" && <ClientAccountsPanel />}

        {tab === "overview" && (
          clients.length === 0 ? (
            <div style={{ background: L.surface, border: `1px solid ${L.border}`, padding: 32, textAlign: "center" }}>
              <p style={{ fontSize: 13, color: L.dimmed }}>No onboarding clients yet — these get created automatically once a sales call closes a deal.</p>
            </div>
          ) : (
            <div style={{ background: L.surface, border: `1px solid ${L.border}` }}>
              {clients.map((client) => {
                const call = client.sales_call_id ? callsById[client.sales_call_id] : undefined;
                const stepCount = (client.completed_steps || []).length;
                return (
                  <Link
                    key={client.id}
                    href={`/dashboard/sales-calls/onboarding/${client.id}`}
                    className="row-hover"
                    style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", borderBottom: `1px solid ${L.border}`, textDecoration: "none", color: "inherit" }}
                  >
                    <div style={{ minWidth: 0, flex: "1 1 220px" }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: L.text }}>{client.company}</div>
                      <div style={{ fontSize: 12, color: L.muted }}>{client.name}</div>
                    </div>
                    <div style={{ flexShrink: 0 }}>{call ? outcomePill(call.outcome) : pill("#f1f5f9", "#94a3b8", "No call linked")}</div>
                    <div style={{ flexShrink: 0 }}>{recapPill(call?.recap_status)}</div>
                    <div style={{ flexShrink: 0 }}>{agreementPill(call?.agreement_status)}</div>
                    <div style={{ flexShrink: 0 }}>{kickoffPill(client.kickoff_email_status)}</div>
                    <div style={{ flexShrink: 0, fontSize: 12, color: L.muted, minWidth: 120, textAlign: "right" }}>
                      Onboarding {stepCount}/{ONBOARDING_STEPS.length}
                    </div>
                  </Link>
                );
              })}
            </div>
          )
        )}
      </div>
    </div>
  );
}
