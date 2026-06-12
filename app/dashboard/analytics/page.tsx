import { createSupabaseClient } from "@/lib/supabase";
import { EmailEvent, EmailSend } from "@/lib/types";
import { buildAnalytics, rate } from "@/lib/analytics";
import Topbar from "@/components/Topbar";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };

const STEP_LABEL: Record<string, string> = {
  initial: "Initial outreach",
  followup1: "Follow-up 1",
  followup2: "Follow-up 2",
  custom: "Personalized follow-up",
};

export const revalidate = 0;

function formatDay(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  return d.toLocaleDateString("en-NZ", { day: "numeric", month: "short" });
}

export default async function AnalyticsPage() {
  const sb = createSupabaseClient();

  const [{ data: sends }, { data: events }] = await Promise.all([
    sb.from("email_sends").select("*").order("sent_at", { ascending: false }),
    sb.from("email_events").select("*"),
  ]);

  const { overall, bySubject, byStep, byDay } = buildAnalytics(
    (sends || []) as EmailSend[],
    (events || []) as EmailEvent[]
  );

  const openRate = rate(overall.opened, overall.sent);
  const clickRate = rate(overall.clicked, overall.sent);

  return (
    <div>
      <Topbar title="ANALYTICS" subtitle="Open and click rates by sequence step and subject line" />

      <div style={{ maxWidth: 980, margin: "32px auto", padding: "0 28px" }}>
        {overall.sent === 0 ? (
          <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 0, padding: 24 }}>
            <p style={{ fontSize: 13, color: L.muted }}>
              No tracked sends yet. Once emails go out through the Send Queue, opens and clicks will show up here.
            </p>
          </div>
        ) : (
          <>
            {/* Overview */}
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
              background: "#fff", border: `1px solid ${L.border}`, borderRadius: 0,
              overflow: "hidden", marginBottom: 20,
            }}>
              {[
                { value: overall.sent, label: "Emails Sent", sub: "Tracked sends" },
                { value: `${openRate}%`, label: "Open Rate", sub: `${overall.opened} of ${overall.sent} opened` },
                { value: `${clickRate}%`, label: "Click Rate", sub: `${overall.clicked} of ${overall.sent} clicked` },
                { value: overall.totalOpens, label: "Total Opens", sub: `${overall.totalClicks} total clicks` },
              ].map(({ value, label, sub }, i, arr) => (
                <div key={label} style={{ padding: "22px 22px 20px", borderRight: i < arr.length - 1 ? `1px solid ${L.border}` : undefined }}>
                  <div style={{ fontSize: 38, fontWeight: 900, lineHeight: 1, color: L.text, marginBottom: 6 }}>{value}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: L.text, marginBottom: 3 }}>{label}</div>
                  <div style={{ fontSize: 12, color: L.dimmed }}>{sub}</div>
                </div>
              ))}
            </div>

            {/* By step */}
            <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 0, padding: 24, marginBottom: 20 }}>
              <div style={{ fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, fontWeight: 800, marginBottom: 16 }}>
                By Sequence Step
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {byStep.map((s) => {
                  const o = rate(s.opened, s.sent);
                  const c = rate(s.clicked, s.sent);
                  return (
                    <div key={s.step} style={{ border: `1px solid ${L.border}`, padding: "12px 16px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                        <span style={{ fontWeight: 700, fontSize: 14, color: L.text }}>{STEP_LABEL[s.step] || s.step}</span>
                        <span style={{ fontSize: 12, color: L.muted }}>{s.sent} sent</span>
                      </div>
                      <div style={{ display: "flex", gap: 24 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: L.muted, marginBottom: 4 }}>
                            <span>Open rate</span><span>{o}% ({s.opened})</span>
                          </div>
                          <div style={{ background: "#f1f5f9", height: 6 }}>
                            <div style={{ background: "var(--blue)", height: 6, width: `${o}%` }} />
                          </div>
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: L.muted, marginBottom: 4 }}>
                            <span>Click rate</span><span>{c}% ({s.clicked})</span>
                          </div>
                          <div style={{ background: "#f1f5f9", height: 6 }}>
                            <div style={{ background: "var(--green)", height: 6, width: `${c}%` }} />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* By subject */}
            <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 0, padding: 24, marginBottom: 20 }}>
              <div style={{ fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, fontWeight: 800, marginBottom: 4 }}>
                By Subject Line
              </div>
              <p style={{ fontSize: 12, color: L.muted, marginBottom: 16 }}>Sorted by open rate — best performing subject lines first.</p>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${L.border}` }}>
                    <th style={{ textAlign: "left", padding: "8px 8px", color: L.muted, fontWeight: 700, fontSize: 11.5, textTransform: "uppercase", letterSpacing: "0.04em" }}>Subject</th>
                    <th style={{ textAlign: "left", padding: "8px 8px", color: L.muted, fontWeight: 700, fontSize: 11.5, textTransform: "uppercase", letterSpacing: "0.04em" }}>Step</th>
                    <th style={{ textAlign: "right", padding: "8px 8px", color: L.muted, fontWeight: 700, fontSize: 11.5, textTransform: "uppercase", letterSpacing: "0.04em" }}>Sent</th>
                    <th style={{ textAlign: "right", padding: "8px 8px", color: L.muted, fontWeight: 700, fontSize: 11.5, textTransform: "uppercase", letterSpacing: "0.04em" }}>Open rate</th>
                    <th style={{ textAlign: "right", padding: "8px 8px", color: L.muted, fontWeight: 700, fontSize: 11.5, textTransform: "uppercase", letterSpacing: "0.04em" }}>Click rate</th>
                  </tr>
                </thead>
                <tbody>
                  {bySubject.map((s) => (
                    <tr key={`${s.step}::${s.subject}`} style={{ borderBottom: `1px solid ${L.border}` }}>
                      <td style={{ padding: "10px 8px", maxWidth: 360, color: L.text, fontWeight: 600 }}>{s.subject}</td>
                      <td style={{ padding: "10px 8px", color: L.muted }}>{STEP_LABEL[s.step] || s.step}</td>
                      <td style={{ padding: "10px 8px", textAlign: "right", color: L.text }}>{s.sent}</td>
                      <td style={{ padding: "10px 8px", textAlign: "right", color: L.text, fontWeight: 700 }}>{rate(s.opened, s.sent)}% <span style={{ color: L.dimmed, fontWeight: 400 }}>({s.opened})</span></td>
                      <td style={{ padding: "10px 8px", textAlign: "right", color: L.text, fontWeight: 700 }}>{rate(s.clicked, s.sent)}% <span style={{ color: L.dimmed, fontWeight: 400 }}>({s.clicked})</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Trend */}
            <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 0, padding: 24 }}>
              <div style={{ fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, fontWeight: 800, marginBottom: 16 }}>
                Sends by Day
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {byDay.slice(0, 14).map((d) => {
                  const o = rate(d.opened, d.sent);
                  return (
                    <div key={d.date} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ width: 56, fontSize: 12, color: L.muted, flexShrink: 0 }}>{formatDay(d.date)}</span>
                      <span style={{ width: 90, fontSize: 12.5, color: L.text, flexShrink: 0 }}>{d.sent} sent</span>
                      <div style={{ flex: 1, background: "#f1f5f9", height: 8 }}>
                        <div style={{ background: "var(--blue)", height: 8, width: `${o}%` }} />
                      </div>
                      <span style={{ width: 100, fontSize: 12, color: L.muted, textAlign: "right", flexShrink: 0 }}>{d.opened} opened ({o}%)</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
