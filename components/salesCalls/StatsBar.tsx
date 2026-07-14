import { CallStats } from "@/lib/salesCallsStats";
import { Phone, CheckCircle2, TrendingUp, Target } from "lucide-react";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b" };

export default function StatsBar({ stats }: { stats: CallStats }) {
  const cards = [
    { label: "Total Calls", value: String(stats.total), sub: "logged so far", icon: Phone, hero: false },
    { label: "Closed", value: String(stats.closed), sub: "deals won", icon: CheckCircle2, hero: false },
    { label: "Close Rate", value: `${stats.closeRate}%`, sub: `${stats.closed} of ${stats.total} calls`, icon: TrendingUp, hero: false },
    { label: "Next Step Rate", value: `${stats.nextStepRate}%`, sub: `${stats.nextStepCount} of ${stats.total} ended somewhere concrete`, icon: Target, hero: true },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 20 }}>
      {cards.map(({ label, value, sub, icon: Icon, hero }) => (
        <div key={label} className="stat-card" style={{
          background: hero ? "linear-gradient(135deg, #dc2626, #b91c1c)" : L.surface,
          borderColor: hero ? "#b91c1c" : L.border,
          padding: hero ? "22px 22px" : "18px 20px", position: "relative", overflow: "hidden",
        }}>
          {hero && <div style={{ position: "absolute", bottom: -24, right: -24, width: 96, height: 96, borderRadius: "50%", background: "rgba(255,255,255,0.12)" }} />}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <p style={{ fontSize: hero ? 10 : 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: hero ? "rgba(255,255,255,0.85)" : L.muted }}>{label}</p>
            <div style={{
              width: hero ? 32 : 28, height: hero ? 32 : 28, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              background: hero ? "rgba(255,255,255,0.18)" : "#fef2f2",
            }}>
              <Icon style={{ width: hero ? 16 : 14, height: hero ? 16 : 14, color: hero ? "#fff" : "var(--red)" }} />
            </div>
          </div>
          <div style={{ fontSize: hero ? 44 : 36, fontWeight: 800, color: hero ? "#fff" : L.text, lineHeight: 1, marginBottom: 5, letterSpacing: "-0.02em" }}>{value}</div>
          <p style={{ fontSize: 11.5, color: hero ? "rgba(255,255,255,0.85)" : L.muted, position: "relative" }}>{sub}</p>
        </div>
      ))}
    </div>
  );
}
