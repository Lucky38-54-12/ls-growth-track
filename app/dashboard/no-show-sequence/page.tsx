import { createSupabaseClient, fetchAllRows } from "@/lib/supabase";
import { Lead } from "@/lib/types";
import { NO_SHOW_STEP_GAP_DAYS } from "@/lib/noShowSequence";
import { formatDateTime } from "@/lib/format";
import Topbar from "@/components/Topbar";
import Link from "next/link";

export const revalidate = 0;

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };

const STEP_LABELS = ["Not started", "1st check-in sent", "2nd check-in sent", "Sequence complete"];

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

function nextDueLabel(lead: Lead): string {
  const step = lead.no_show_sequence_step || 0;
  if (step >= 3) return "—";
  if (lead.trade?.toLowerCase().includes("clean")) return "Held (cleaning trade — manual only)";
  const since = lead.no_show_last_sent_at || lead.no_show_at;
  const days = daysSince(since);
  if (days === null) return "—";
  const gap = NO_SHOW_STEP_GAP_DAYS[step];
  const daysLeft = gap - days;
  return daysLeft <= 0 ? "Due now" : `In ${daysLeft} day${daysLeft !== 1 ? "s" : ""}`;
}

export default async function NoShowSequencePage() {
  const sb = createSupabaseClient();

  const leads = await fetchAllRows<Lead>((from, to) =>
    sb.from("leads").select("*").eq("status", "no_show").order("no_show_at", { ascending: false }).range(from, to)
  );

  const inSequence = leads.filter(l => (l.no_show_sequence_step || 0) < 3);
  const complete = leads.filter(l => (l.no_show_sequence_step || 0) >= 3);

  function Row({ lead }: { lead: Lead }) {
    const step = lead.no_show_sequence_step || 0;
    return (
      <tr style={{ borderBottom: `1px solid ${L.border}` }} className="row-hover">
        <td style={{ padding: "10px 14px" }}>
          <Link href={`/dashboard/leads/${lead.lead_id}`} style={{ fontSize: 13, fontWeight: 700, color: L.text, textDecoration: "none" }}>{lead.company}</Link>
          <div style={{ fontSize: 11.5, color: L.dimmed }}>{lead.contact_name}</div>
        </td>
        <td style={{ padding: "10px 14px", fontSize: 12.5, color: L.text }}>{lead.no_show_at ? formatDateTime(lead.no_show_at) : "—"}</td>
        <td style={{ padding: "10px 14px", fontSize: 12.5, color: L.text }}>{STEP_LABELS[step]}</td>
        <td style={{ padding: "10px 14px", fontSize: 12.5, color: L.text }}>{lead.no_show_last_sent_at ? formatDateTime(lead.no_show_last_sent_at) : "—"}</td>
        <td style={{ padding: "10px 14px", fontSize: 12.5, color: step >= 3 ? "#16a34a" : L.text, fontWeight: step >= 3 ? 700 : 400 }}>{nextDueLabel(lead)}</td>
      </tr>
    );
  }

  return (
    <div style={{ background: "#f1f5f9", minHeight: "100vh" }}>
      <Topbar title="No-Show Sequence" subtitle="Automated week-long check-in for missed meetings — then it stops and waits for you to call" />

      <div style={{ padding: "20px 28px 60px", display: "flex", flexDirection: "column", gap: 20 }}>

        <div style={{ background: L.surface, border: `1px solid ${L.border}` }}>
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${L.border}`, fontSize: 11, fontWeight: 700, color: L.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            In Sequence — {inSequence.length}
          </div>
          {inSequence.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: L.dimmed, fontSize: 13 }}>No one currently in the no-show sequence.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", minWidth: 700, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    {["Lead", "No-show since", "Step", "Last sent", "Next nudge"].map(h => (
                      <th key={h} style={{ textAlign: "left", padding: "9px 14px", fontSize: 10, fontWeight: 700, color: L.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>{inSequence.map(lead => <Row key={lead.lead_id} lead={lead} />)}</tbody>
              </table>
            </div>
          )}
        </div>

        <div style={{ background: L.surface, border: `1px solid ${L.border}` }}>
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${L.border}`, fontSize: 11, fontWeight: 700, color: L.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Sequence Complete — Ready For You To Call — {complete.length}
          </div>
          {complete.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: L.dimmed, fontSize: 13 }}>Nobody's finished the sequence yet.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", minWidth: 700, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    {["Lead", "No-show since", "Step", "Last sent", "Next nudge"].map(h => (
                      <th key={h} style={{ textAlign: "left", padding: "9px 14px", fontSize: 10, fontWeight: 700, color: L.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>{complete.map(lead => <Row key={lead.lead_id} lead={lead} />)}</tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
