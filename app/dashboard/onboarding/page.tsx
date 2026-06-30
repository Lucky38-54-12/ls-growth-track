import { createSupabaseClient } from "@/lib/supabase";
import Topbar from "@/components/Topbar";
import Link from "next/link";
import { UserPlus, CheckCircle2, Circle } from "lucide-react";
import AddClientButton from "./AddClientButton";

export const revalidate = 0;

export const ONBOARDING_STEPS = [
  { key: "contract_signed",    label: "Contract signed" },
  { key: "kickoff_booked",     label: "Kick-off call booked" },
  { key: "kickoff_done",       label: "Kick-off call completed" },
  { key: "slack_invited",      label: "Added to Slack" },
  { key: "icp_documented",     label: "ICP / target market locked in" },
  { key: "email_setup",        label: "Email account set up & warming" },
  { key: "lead_list_approved", label: "Lead list approved" },
  { key: "templates_approved", label: "Email templates approved" },
  { key: "campaign_launched",  label: "First campaign launched" },
  { key: "first_review",       label: "First results review scheduled" },
];

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };

type OnboardingClient = {
  id: string;
  name: string;
  company: string;
  email: string | null;
  phone: string | null;
  completed_steps: string[];
  notes: string;
  created_at: string;
};

export default async function OnboardingPage() {
  const sb = createSupabaseClient();
  const { data: clients } = await sb
    .from("onboarding_clients")
    .select("*")
    .order("created_at", { ascending: false });

  const rows = (clients || []) as OnboardingClient[];
  const total = ONBOARDING_STEPS.length;

  return (
    <div style={{ background: "#f1f5f9", minHeight: "100vh" }}>
      <Topbar title="Client Onboarding" subtitle="Track every new client through setup" />

      <div style={{ padding: "24px 28px 60px" }}>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <p style={{ fontSize: 13, color: L.muted }}>
              {rows.length} client{rows.length !== 1 ? "s" : ""} in onboarding
            </p>
          </div>
          <AddClientButton />
        </div>

        {rows.length === 0 ? (
          <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 10, padding: 48, textAlign: "center" }}>
            <UserPlus style={{ width: 32, height: 32, color: L.dimmed, margin: "0 auto 12px" }} />
            <p style={{ fontSize: 14, color: L.dimmed }}>No clients yet — add your first one above.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {rows.map(client => {
              const done = client.completed_steps?.length || 0;
              const pct = Math.round((done / total) * 100);
              const complete = done === total;
              return (
                <Link
                  key={client.id}
                  href={`/dashboard/onboarding/${client.id}`}
                  className="card-hover"
                  style={{
                    display: "flex", alignItems: "center", gap: 16, padding: "16px 20px",
                    background: complete ? "#f0fdf4" : L.surface,
                    border: `1px solid ${complete ? "#bbf7d0" : L.border}`,
                    textDecoration: "none",
                  }}
                >
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: complete ? "#dcfce7" : "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {complete
                      ? <CheckCircle2 style={{ width: 20, height: 20, color: "#16a34a" }} />
                      : <Circle style={{ width: 20, height: 20, color: L.dimmed }} />
                    }
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: L.text }}>{client.company}</span>
                      <span style={{ fontSize: 12, color: L.muted }}>{client.name}</span>
                    </div>
                    <div style={{ marginTop: 8, display: "flex", gap: 4 }}>
                      {ONBOARDING_STEPS.map(s => {
                        const isDone = client.completed_steps?.includes(s.key);
                        return (
                          <div
                            key={s.key}
                            title={s.label}
                            style={{ height: 6, flex: 1, borderRadius: 3, background: isDone ? "var(--green)" : "#e2e8f0" }}
                          />
                        );
                      })}
                    </div>
                    <p style={{ fontSize: 11.5, color: L.muted, marginTop: 5 }}>
                      {complete ? "All done!" : `${done} / ${total} steps complete · ${pct}%`}
                    </p>
                  </div>

                  <div style={{ fontSize: 11, color: L.dimmed, flexShrink: 0 }}>
                    {new Date(client.created_at).toLocaleDateString("en-NZ", { day: "numeric", month: "short" })}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
