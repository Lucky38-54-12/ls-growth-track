import { Lead } from "@/lib/types";

const WARM_STATUSES = new Set(["replied", "booked"]);
const SEQUENCE_STATUSES = ["contacted", "followup_1_sent", "followup_2_sent"];

export default function PipelineStats({ allLeads }: { allLeads: Lead[] }) {
  const total = allLeads.length;
  const notContacted = allLeads.filter(l => l.status === "not_contacted").length;
  const inSequence = allLeads.filter(l => SEQUENCE_STATUSES.includes(l.status)).length;
  const warmCount = allLeads.filter(l => WARM_STATUSES.has(l.status)).length;

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const newThisWeek = allLeads.filter(l => l.date_added >= sevenDaysAgo).length;

  return (
    <>
      {/* Hero banner */}
      <div style={{
        background: "linear-gradient(135deg, #0b1220 0%, #1e293b 100%)",
        padding: "30px 32px", marginBottom: 16,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexWrap: "wrap", gap: 24,
      }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", color: "#ef4444", marginBottom: 8 }}>
            LS Growth Agency
          </div>
          <div style={{ fontSize: 28, fontWeight: 900, color: "#fff", letterSpacing: "0.02em", lineHeight: 1.1 }}>
            OUTREACH PIPELINE
          </div>
          <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 6 }}>
            Tracking {total} lead{total !== 1 ? "s" : ""} across every trade and stage
          </div>
        </div>
        <div style={{ display: "flex", gap: 36 }}>
          {[
            { value: total, label: "LEADS" },
            { value: total - notContacted, label: "CONTACTED" },
            { value: warmCount, label: "WARM" },
          ].map(s => (
            <div key={s.label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 34, fontWeight: 900, color: "#fff", lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700, letterSpacing: "0.1em", marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Stat cards */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(5, 1fr)",
        gap: 0, marginBottom: 16, overflow: "hidden", border: "1px solid #e2e8f0",
      }}>
        {[
          { value: total, label: "Total Leads", sub: "In pipeline", accent: false },
          { value: notContacted, label: "Not Contacted", sub: "Awaiting first email", accent: false },
          { value: inSequence, label: "In Sequence", sub: "Follow-ups running", accent: false },
          { value: warmCount, label: "Warm / Replied", sub: "Worth a call now", accent: false },
          { value: newThisWeek, label: "New This Week", sub: "Added in last 7 days", accent: true },
        ].map(({ value, label, sub, accent }, i, arr) => (
          <div key={label} style={{
            padding: "20px 22px",
            background: accent ? "var(--green)" : "#fff",
            borderRight: i < arr.length - 1 ? "1px solid #e2e8f0" : undefined,
          }}>
            <div style={{ fontSize: 34, fontWeight: 900, lineHeight: 1, color: accent ? "#fff" : "#0f172a", marginBottom: 6 }}>{value}</div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: accent ? "#fff" : "#0f172a", marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 11.5, color: accent ? "#dcfce7" : "#94a3b8" }}>{sub}</div>
          </div>
        ))}
      </div>
    </>
  );
}
