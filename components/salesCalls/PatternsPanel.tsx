import { CallPatterns } from "@/lib/salesCallsStats";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b" };

export default function PatternsPanel({ patterns }: { patterns: CallPatterns }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ background: L.surface, border: `1px solid ${L.border}`, padding: 24 }}>
        <div style={{ fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, fontWeight: 800, marginBottom: 12 }}>Objections that keep coming up</div>
        {patterns.topObjections.length === 0 ? (
          <p style={{ fontSize: 13, color: L.muted }}>Nothing logged yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {patterns.topObjections.map((o, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <span style={{ fontSize: 13.5, color: L.text }}>{o.text}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: L.muted, flexShrink: 0 }}>{o.count}x</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ background: L.surface, border: `1px solid ${L.border}`, padding: 24 }}>
        <div style={{ fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, fontWeight: 800, marginBottom: 10 }}>Where deals stall</div>
        <p style={{ fontSize: 14, color: L.text, lineHeight: 1.6 }}>{patterns.stallInsight}</p>
      </div>

      <div style={{ background: L.surface, border: `1px solid ${L.border}`, padding: 24 }}>
        <div style={{ fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, fontWeight: 800, marginBottom: 10 }}>Next step rate trend</div>
        <p style={{ fontSize: 14, color: L.text, lineHeight: 1.6 }}>{patterns.trendInsight}</p>
      </div>

      <div style={{ background: L.surface, border: `1px solid ${L.border}`, padding: 24 }}>
        <div style={{ fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, fontWeight: 800, marginBottom: 10 }}>Recurring work ons</div>
        <p style={{ fontSize: 14, color: L.text, lineHeight: 1.6 }}>{patterns.workOnsInsight}</p>
      </div>
    </div>
  );
}
