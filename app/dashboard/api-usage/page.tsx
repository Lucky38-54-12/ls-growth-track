import Topbar from "@/components/Topbar";
import { buildKeyUsageReport } from "@/lib/anthropicUsage";
import { AlertTriangle, KeyRound } from "lucide-react";

export const revalidate = 0;
export const dynamic = "force-dynamic";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };
const DAYS_BACK = 30;

const money = (n: number) => `$${n.toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const KEY_COLORS = ["#2563eb", "#dc2626", "#16a34a", "#d97706", "#7c3aed", "#0891b2", "#be185d", "#4d7c0f"];

export default async function ApiUsagePage() {
  let report: Awaited<ReturnType<typeof buildKeyUsageReport>> | null = null;
  let error = "";

  try {
    report = await buildKeyUsageReport(DAYS_BACK);
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load usage data.";
  }

  return (
    <div style={{ background: "#f1f5f9", minHeight: "100vh" }}>
      <Topbar title="API Usage" subtitle={`Live spend by API key — last ${DAYS_BACK} days, pulled straight from Anthropic's Cost & Usage API`} />

      <div style={{ padding: "20px 28px 60px", display: "flex", flexDirection: "column", gap: 16 }}>

        {error && (
          <div className="surface-card" style={{ padding: "16px 20px", display: "flex", alignItems: "flex-start", gap: 10, background: "#fef2f2", borderColor: "#fecaca" }}>
            <AlertTriangle style={{ width: 16, height: 16, color: "#b91c1c", flexShrink: 0, marginTop: 1 }} />
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: "#b91c1c" }}>Couldn&apos;t load usage data</p>
              <p style={{ fontSize: 12.5, color: "#991b1b", marginTop: 4 }}>{error}</p>
            </div>
          </div>
        )}

        {report && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
              <div className="surface-card" style={{ padding: "14px 18px" }}>
                <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: L.muted, marginBottom: 6 }}>Total ({DAYS_BACK}d)</p>
                <p style={{ fontSize: 24, fontWeight: 800, color: L.text }}>{money(report.grandTotal)}</p>
              </div>
              {report.totalsByKey.slice(0, 3).map((k, i) => (
                <div key={k.label} className="surface-card" style={{ padding: "14px 18px", borderTop: `3px solid ${KEY_COLORS[i % KEY_COLORS.length]}` }}>
                  <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: L.muted, marginBottom: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k.label}</p>
                  <p style={{ fontSize: 24, fontWeight: 800, color: L.text }}>{money(k.total)}</p>
                  <p style={{ fontSize: 11, color: L.dimmed, marginTop: 2 }}>{report.grandTotal > 0 ? Math.round((k.total / report.grandTotal) * 100) : 0}% of total</p>
                </div>
              ))}
            </div>

            {/* Per-key breakdown with relative bars */}
            <div className="surface-card" style={{ overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: `1px solid ${L.border}` }}>
                <KeyRound style={{ width: 15, height: 15, color: L.muted }} />
                <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: L.text }}>Spend by Key</span>
              </div>
              {report.totalsByKey.length === 0 ? (
                <div style={{ padding: 32, textAlign: "center", color: L.dimmed, fontSize: 13 }}>No usage in the last {DAYS_BACK} days.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {report.totalsByKey.map((k, i) => {
                    const pct = report!.grandTotal > 0 ? (k.total / report!.grandTotal) * 100 : 0;
                    return (
                      <div key={k.label} style={{ padding: "12px 18px", borderBottom: `1px solid ${L.border}` }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: L.text, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k.label}</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: L.text, flexShrink: 0 }}>{money(k.total)}</span>
                          <span style={{ fontSize: 11.5, color: L.dimmed, flexShrink: 0, width: 40, textAlign: "right" }}>{Math.round(pct)}%</span>
                        </div>
                        <div style={{ width: "100%", height: 6, background: "#f1f5f9", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ width: `${pct}%`, height: "100%", background: KEY_COLORS[i % KEY_COLORS.length], borderRadius: 3 }} />
                        </div>
                      </div>
                    );
                  })}
                  {report.unattributedTotal > 0.01 && (
                    <div style={{ padding: "10px 18px", fontSize: 11.5, color: L.dimmed }}>
                      + {money(report.unattributedTotal)} in costs (code execution, session usage) not attributable to a specific key.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Daily table */}
            <div className="surface-card" style={{ overflow: "hidden" }}>
              <div style={{ padding: "14px 18px", borderBottom: `1px solid ${L.border}`, fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: L.text }}>
                Daily Breakdown
              </div>
              {report.days.filter(d => d.total > 0).length === 0 ? (
                <div style={{ padding: 32, textAlign: "center", color: L.dimmed, fontSize: 13 }}>Nothing spent in the last {DAYS_BACK} days.</div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", minWidth: 600, borderCollapse: "collapse", fontSize: 12.5 }}>
                    <thead>
                      <tr style={{ background: "#f8fafc" }}>
                        <th style={{ textAlign: "left", padding: "9px 14px", fontSize: 10, fontWeight: 700, color: L.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>Date</th>
                        {report.totalsByKey.map(k => (
                          <th key={k.label} style={{ textAlign: "right", padding: "9px 14px", fontSize: 10, fontWeight: 700, color: L.muted, textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>{k.label}</th>
                        ))}
                        <th style={{ textAlign: "right", padding: "9px 14px", fontSize: 10, fontWeight: 700, color: L.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...report.days].reverse().filter(d => d.total > 0).map(day => (
                        <tr key={day.date} style={{ borderBottom: `1px solid ${L.border}` }} className="row-hover">
                          <td style={{ padding: "8px 14px", color: L.text, fontWeight: 600 }}>{day.date}</td>
                          {report!.totalsByKey.map(k => (
                            <td key={k.label} style={{ padding: "8px 14px", textAlign: "right", color: day.byKey[k.label] ? L.text : L.dimmed }}>
                              {day.byKey[k.label] ? money(day.byKey[k.label]) : "—"}
                            </td>
                          ))}
                          <td style={{ padding: "8px 14px", textAlign: "right", color: L.text, fontWeight: 700 }}>{money(day.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
