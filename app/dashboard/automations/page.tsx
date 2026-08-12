import { createSupabaseClient } from "@/lib/supabase";
import { formatDateTime } from "@/lib/format";
import Topbar from "@/components/Topbar";
import { ExternalLink, CircleCheck, CircleX, CircleDashed } from "lucide-react";

export const revalidate = 0;

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };

interface Automation {
  id: string;
  slug: string;
  name: string;
  description: string;
  schedule_label: string;
  kind: "routine" | "cron";
  external_url: string | null;
  enabled: boolean;
  last_run_at: string | null;
  last_status: "ok" | "error" | null;
  last_summary: string | null;
}

export default async function AutomationsPage() {
  const sb = createSupabaseClient();
  const { data } = await sb.from("automations").select("*").order("created_at", { ascending: true });
  const automations = (data || []) as Automation[];

  return (
    <div style={{ background: "#f1f5f9", minHeight: "100vh" }}>
      <Topbar title="AUTOMATIONS" subtitle="Business tasks running on their own — what's set up, whether it's firing, and what it did last" />

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "20px 28px 60px", display: "flex", flexDirection: "column", gap: 12 }}>
        {automations.length === 0 ? (
          <div style={{ background: L.surface, border: `1px solid ${L.border}`, padding: 32, textAlign: "center", color: L.dimmed, fontSize: 13 }}>
            Nothing set up yet.
          </div>
        ) : (
          automations.map((a) => <AutomationCard key={a.id} automation={a} />)
        )}
      </div>
    </div>
  );
}

function AutomationCard({ automation: a }: { automation: Automation }) {
  const status = statusInfo(a);
  return (
    <div style={{ background: L.surface, border: `1px solid ${L.border}`, padding: 20 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: L.text }}>{a.name}</span>
            <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", background: "#f1f5f9", color: L.muted, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              {a.kind}
            </span>
            {!a.enabled && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", background: "#fef2f2", color: "#b91c1c", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Disabled
              </span>
            )}
          </div>
          <p style={{ fontSize: 12.5, color: L.muted, marginTop: 6, lineHeight: 1.5 }}>{a.description}</p>
        </div>
        {a.external_url && (
          <a href={a.external_url} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 700, color: "var(--red)", textDecoration: "none", whiteSpace: "nowrap", flexShrink: 0 }}>
            View <ExternalLink style={{ width: 11, height: 11 }} />
          </a>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginTop: 12, paddingTop: 12, borderTop: `1px solid ${L.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <status.Icon style={{ width: 14, height: 14, color: status.color }} />
          <span style={{ fontSize: 12.5, fontWeight: 700, color: status.color }}>{status.label}</span>
        </div>
        <span style={{ fontSize: 12, color: L.dimmed }}>{a.schedule_label}</span>
        {a.last_run_at && (
          <span style={{ fontSize: 12, color: L.dimmed }}>Last ran {formatDateTime(a.last_run_at)}</span>
        )}
      </div>

      {a.last_summary && (
        <div style={{ marginTop: 12, padding: "10px 12px", background: "#fafbfc", border: `1px solid ${L.border}`, fontSize: 12.5, color: L.text, whiteSpace: "pre-line", lineHeight: 1.6 }}>
          {a.last_summary}
        </div>
      )}
    </div>
  );
}

function statusInfo(a: Automation) {
  if (!a.last_run_at) return { Icon: CircleDashed, color: L.dimmed, label: "Never run yet" };
  if (a.last_status === "error") return { Icon: CircleX, color: "#b91c1c", label: "Last run failed" };
  return { Icon: CircleCheck, color: "#166534", label: "Running fine" };
}
