import { Lead } from "@/lib/types";
import { nextStepFor } from "@/lib/leads";
import { Users, Sparkles, Clock, TrendingUp } from "lucide-react";

const L = { surface: "#ffffff", border: "#e6eaf0", text: "#0f172a", muted: "#64748b" };
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
    { label: "Total Pipeline", value: String(active.length), sub: "active leads", icon: Users, green: false },
    { label: "Added This Week", value: String(thisWeek), sub: "new leads", icon: Sparkles, green: false },
    { label: "Due For Follow-up", value: String(due), sub: "ready to send", icon: Clock, green: false },
    { label: "Reply Rate", value: `${replyRate}%`, sub: `${warm} replied or booked`, icon: TrendingUp, green: true },
  ];

  return (
    <div style={{
      display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 16,
    }}>
      {cards.map(({ label, value, sub, icon: Icon, green }) => (
        <div key={label} className="stat-card" style={{
          background: green ? "linear-gradient(135deg, #16a34a, #15803d)" : L.surface,
          borderColor: green ? "#15803d" : L.border,
          padding: "18px 20px", position: "relative", overflow: "hidden",
        }}>
          {green && <div style={{ position: "absolute", bottom: -24, right: -24, width: 96, height: 96, borderRadius: "50%", background: "rgba(255,255,255,0.1)" }} />}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: green ? "rgba(255,255,255,0.8)" : L.muted }}>{label}</p>
            <div style={{
              width: 28, height: 28, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              background: green ? "rgba(255,255,255,0.18)" : "#fef2f2",
            }}>
              <Icon style={{ width: 14, height: 14, color: green ? "#fff" : "var(--red)" }} />
            </div>
          </div>
          <div style={{ fontSize: 36, fontWeight: 800, color: green ? "#fff" : L.text, lineHeight: 1, marginBottom: 5, letterSpacing: "-0.02em" }}>{value}</div>
          <p style={{ fontSize: 11.5, color: green ? "rgba(255,255,255,0.8)" : L.muted, position: "relative" }}>{sub}</p>
        </div>
      ))}
    </div>
  );
}
