import { Lead } from "@/lib/types";
import { nextStepFor } from "@/lib/leads";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b" };
const CLOSED_STATUSES = new Set(["sequence_complete", "not_interested", "bounced"]);
const WARM_STATUSES = new Set(["replied", "booked"]);

export default function PipelineStats({ allLeads }: { allLeads: Lead[] }) {
  const active = allLeads.filter(l => !CLOSED_STATUSES.has(l.status));
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const thisWeek = allLeads.filter(l => l.date_added >= sevenDaysAgo).length;
  const due = allLeads.filter(l => nextStepFor(l) !== null).length;

  const contacted = allLeads.filter(l => l.status !== "not_contacted").length;
  const warm = allLeads.filter(l => WARM_STATUSES.has(l.status)).length;
  const replyRate = contacted > 0 ? Math.round((warm / contacted) * 100) : 0;

  const cards = [
    { label: "Total Pipeline", value: String(active.length), sub: "active leads", green: false },
    { label: "Added This Week", value: String(thisWeek), sub: "new leads", green: false },
    { label: "Due For Follow-up", value: String(due), sub: "ready to send", green: false },
    { label: "Reply Rate", value: `${replyRate}%`, sub: `${warm} replied or booked`, green: true },
  ];

  return (
    <div style={{
      display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16,
    }}>
      {cards.map(({ label, value, sub, green }) => (
        <div key={label} style={{
          background: green ? "var(--green)" : L.surface,
          border: `1px solid ${green ? "var(--green)" : L.border}`,
          padding: "16px 18px", position: "relative", overflow: "hidden",
        }}>
          {green && <div style={{ position: "absolute", bottom: -20, right: -20, width: 80, height: 80, borderRadius: "50%", background: "rgba(0,0,0,0.12)" }} />}
          <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: green ? "rgba(255,255,255,0.75)" : L.muted, marginBottom: 8 }}>{label}</p>
          <div style={{ fontSize: 38, fontWeight: 900, color: green ? "#fff" : L.text, lineHeight: 1, marginBottom: 5 }}>{value}</div>
          <p style={{ fontSize: 11, color: green ? "rgba(255,255,255,0.75)" : L.muted }}>{sub}</p>
        </div>
      ))}
    </div>
  );
}
