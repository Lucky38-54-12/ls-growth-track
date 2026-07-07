import { createSupabaseClient, fetchAllRows } from "@/lib/supabase";
import { Lead, Campaign, EmailSend } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
import Topbar from "@/components/Topbar";

export const revalidate = 0;

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };

// Every step name that represents a fully automated send (no human clicks
// "send" in the loop) — deliberately excludes "custom" and
// "cold_call_followup", which are AI-drafted but human-reviewed before
// sending, so they don't belong on a "what's firing on its own" page.
const AUTOMATION_LABELS: Record<string, string> = {
  meeting_confirmation: "Meeting Confirmation",
  meeting_value_touchpoint: "Pre-Meeting Value Email",
  meeting_day_reminder: "Meeting Day Reminder",
  initial: "Cold Outreach: Initial",
  followup1: "Cold Outreach: Follow-up 1",
  followup2: "Cold Outreach: Follow-up 2",
  followup3: "Cold Outreach: Follow-up 3",
  followup4: "Cold Outreach: Follow-up 4",
  checkin: "Campaign Check-in",
};

const BADGE_COLORS: Record<string, { bg: string; fg: string }> = {
  meeting_confirmation: { bg: "#dbeafe", fg: "#1e40af" },
  meeting_value_touchpoint: { bg: "#ede9fe", fg: "#6d28d9" },
  meeting_day_reminder: { bg: "#fef9c3", fg: "#854d0e" },
  initial: { bg: "#f1f5f9", fg: "#475569" },
  followup1: { bg: "#f1f5f9", fg: "#475569" },
  followup2: { bg: "#f1f5f9", fg: "#475569" },
  followup3: { bg: "#f1f5f9", fg: "#475569" },
  followup4: { bg: "#f1f5f9", fg: "#475569" },
  checkin: { bg: "#dcfce7", fg: "#166534" },
};

const AUTOMATION_STEPS = Object.keys(AUTOMATION_LABELS);

export default async function AutomationsPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { type } = await searchParams;
  const activeType = type && AUTOMATION_STEPS.includes(type) ? type : "";

  const sb = createSupabaseClient();

  const [leads, campaigns, counts] = await Promise.all([
    fetchAllRows<Lead>((from, to) => sb.from("leads").select("*").range(from, to)),
    fetchAllRows<Campaign>((from, to) => sb.from("campaigns").select("*").range(from, to)),
    Promise.all(
      AUTOMATION_STEPS.map(async (step) => {
        const { count } = await sb.from("email_sends").select("*", { count: "exact", head: true }).eq("step", step);
        return [step, count || 0] as const;
      })
    ),
  ]);

  const { data: sendsData } = await sb
    .from("email_sends")
    .select("*")
    .in("step", activeType ? [activeType] : AUTOMATION_STEPS)
    .order("sent_at", { ascending: false })
    .limit(200);

  const leadById = new Map(leads.map((l) => [l.lead_id, l]));
  const campaignById = new Map(campaigns.map((c) => [c.id, c]));
  const countByStep = new Map(counts);
  const totalCount = counts.reduce((sum, [, c]) => sum + c, 0);

  const rows = ((sendsData || []) as EmailSend[]).map((s) => ({
    ...s,
    lead: leadById.get(s.lead_id),
  }));

  return (
    <div style={{ background: "#f1f5f9", minHeight: "100vh" }}>
      <Topbar title="AUTOMATIONS" subtitle="Every fully-automated email currently firing on its own — no human clicks send" />

      <div style={{ padding: "20px 28px 60px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          {[
            { label: "Meeting Confirmation", step: "meeting_confirmation" },
            { label: "Pre-Meeting Value Email", step: "meeting_value_touchpoint" },
            { label: "Meeting Day Reminder", step: "meeting_day_reminder" },
            { label: "Cold Outreach + Campaign Sequence", step: "" },
          ].map(({ label, step }) => {
            const value = step
              ? countByStep.get(step) || 0
              : ["initial", "followup1", "followup2", "followup3", "followup4", "checkin"].reduce((sum, s) => sum + (countByStep.get(s) || 0), 0);
            return (
              <div key={label} style={{ background: L.surface, border: `1px solid ${L.border}`, padding: "14px 16px" }}>
                <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: L.muted, marginBottom: 6 }}>{label}</p>
                <p style={{ fontSize: 24, fontWeight: 800, color: L.text }}>{value}</p>
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <a
            href="/dashboard/automations"
            style={{
              fontSize: 12, fontWeight: 700, padding: "6px 12px", borderRadius: 6, textDecoration: "none",
              background: activeType === "" ? "var(--red)" : L.surface, color: activeType === "" ? "#fff" : L.muted,
              border: `1px solid ${activeType === "" ? "var(--red)" : L.border}`,
            }}
          >
            All ({totalCount})
          </a>
          {AUTOMATION_STEPS.map((step) => (
            <a
              key={step}
              href={`/dashboard/automations?type=${step}`}
              style={{
                fontSize: 12, fontWeight: 700, padding: "6px 12px", borderRadius: 6, textDecoration: "none",
                background: activeType === step ? "var(--red)" : L.surface, color: activeType === step ? "#fff" : L.muted,
                border: `1px solid ${activeType === step ? "var(--red)" : L.border}`,
              }}
            >
              {AUTOMATION_LABELS[step]} ({countByStep.get(step) || 0})
            </a>
          ))}
        </div>

        <div style={{ background: L.surface, border: `1px solid ${L.border}`, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${L.border}`, fontSize: 11, fontWeight: 700, color: L.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Most Recent 200 — click a row to read the exact copy that went out
          </div>
          {rows.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: L.dimmed, fontSize: 13 }}>Nothing has fired for this automation yet.</div>
          ) : (
            <div>
              {rows.map((row) => {
                const badge = BADGE_COLORS[row.step] || { bg: "#f1f5f9", fg: L.muted };
                const campaignName = row.lead?.campaign_id ? campaignById.get(row.lead.campaign_id)?.name : null;
                return (
                  <details key={row.id} style={{ borderBottom: `1px solid ${L.border}` }}>
                    <summary style={{ padding: "11px 16px", cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: badge.bg, color: badge.fg, whiteSpace: "nowrap" }}>
                        {AUTOMATION_LABELS[row.step] || row.step}
                      </span>
                      <span style={{ fontWeight: 700, color: L.text }}>{row.lead?.company || "(deleted lead)"}</span>
                      <span style={{ fontSize: 12, color: L.muted }}>{row.lead?.contact_name}</span>
                      {campaignName && <span style={{ fontSize: 11, color: L.dimmed }}>{campaignName}</span>}
                      <span style={{ color: L.dimmed }}>&mdash;</span>
                      <span style={{ color: L.text }}>{row.subject}</span>
                      <span style={{ marginLeft: "auto", fontSize: 11.5, color: L.dimmed, whiteSpace: "nowrap" }}>{formatDateTime(row.sent_at)}</span>
                    </summary>
                    <div
                      style={{ padding: "14px 18px", borderTop: `1px solid ${L.border}`, background: "#fafafa", fontFamily: "Arial,Helvetica,sans-serif", fontSize: 14, color: L.text, lineHeight: 1.5 }}
                      dangerouslySetInnerHTML={{ __html: row.body_html }}
                    />
                  </details>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
