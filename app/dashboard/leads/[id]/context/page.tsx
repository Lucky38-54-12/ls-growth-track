import { createSupabaseClient } from "@/lib/supabase";
import { notFound } from "next/navigation";
import { EmailEvent, EmailSend, Lead } from "@/lib/types";
import { deviceFromUserAgent, formatDateTime } from "@/lib/format";
import { stripTrackingForDisplay } from "@/lib/templates";
import Topbar from "@/components/Topbar";

export const revalidate = 0;

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };

export default async function LeadContextPage({ params }: { params: { id: string } }) {
  const sb = createSupabaseClient();
  const [{ data: lead }, { data: events }, { data: sends }] = await Promise.all([
    sb.from("leads").select("*").eq("lead_id", params.id).single(),
    sb.from("email_events").select("*").eq("lead_id", params.id).order("created_at", { ascending: false }),
    sb.from("email_sends").select("*").eq("lead_id", params.id).order("sent_at", { ascending: false }),
  ]);
  if (!lead) notFound();
  const l = lead as Lead;
  const allSends = (sends || []) as EmailSend[];
  const allEvents = (events || []) as EmailEvent[];

  return (
    <div>
      <Topbar title={l.company} subtitle={[l.contact_name, l.phone, l.email].filter(Boolean).join(" · ")} />

      <div style={{ maxWidth: 720, margin: "32px auto", padding: "0 28px" }}>

        {/* Contact details */}
        <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 0, padding: 24, marginBottom: 20 }}>
          <div style={{ fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, fontWeight: 800, marginBottom: 10 }}>Contact details</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13.5, color: L.text }}>
            <div><span style={{ color: L.dimmed }}>Company:</span> {l.company}</div>
            {l.contact_name && <div><span style={{ color: L.dimmed }}>Name:</span> {l.contact_name}</div>}
            {l.phone && <div><span style={{ color: L.dimmed }}>Phone:</span> {l.phone}</div>}
            {l.email && <div><span style={{ color: L.dimmed }}>Email:</span> {l.email}</div>}
            {l.trade && <div><span style={{ color: L.dimmed }}>Trade:</span> {l.trade}</div>}
            {l.location && <div><span style={{ color: L.dimmed }}>Location:</span> {l.location}</div>}
          </div>
        </div>

        {/* Notes from sheets */}
        {l.notes?.trim() && (
          <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 0, padding: 24, marginBottom: 20 }}>
            <div style={{ fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, fontWeight: 800, marginBottom: 10 }}>Notes</div>
            <p style={{ fontSize: 13.5, whiteSpace: "pre-wrap", color: L.text }}>{l.notes}</p>
          </div>
        )}

        {/* Sent emails */}
        <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 0, padding: 24, marginBottom: 20 }}>
          <div style={{ fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, fontWeight: 800, marginBottom: 10 }}>
            Sent emails — {allSends.length}
          </div>
          {allSends.length === 0 ? (
            <p style={{ fontSize: 13, color: L.dimmed }}>No emails sent to this lead yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {allSends.map((s) => (
                <details key={s.id} style={{ border: `1px solid ${L.border}`, background: "#f8fafc" }}>
                  <summary style={{ padding: "10px 12px", cursor: "pointer", fontSize: 13 }}>
                    <span style={{ fontWeight: 700, color: L.text }}>{s.subject}</span>
                    <span style={{ color: L.dimmed, marginLeft: 8 }}>{formatDateTime(s.sent_at)}</span>
                  </summary>
                  <div
                    style={{ padding: "12px 16px", borderTop: `1px solid ${L.border}`, fontFamily: "Arial,Helvetica,sans-serif", fontSize: 14, color: L.text, lineHeight: 1.5 }}
                    dangerouslySetInnerHTML={{ __html: stripTrackingForDisplay(s.body_html) }}
                  />
                </details>
              ))}
            </div>
          )}
        </div>

        {/* Activity */}
        <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 0, padding: 24, marginBottom: 20 }}>
          <div style={{ fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, fontWeight: 800, marginBottom: 10 }}>
            Activity — {allEvents.length} event{allEvents.length !== 1 ? "s" : ""}
          </div>
          {allEvents.length === 0 ? (
            <p style={{ fontSize: 13, color: L.dimmed }}>No opens or clicks tracked yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {allEvents.map((ev) => {
                const isOpen = ev.event_type === "open";
                return (
                  <div key={ev.id} style={{
                    display: "flex", alignItems: "flex-start", gap: 12,
                    padding: "10px 12px", border: `1px solid ${L.border}`, background: "#f8fafc",
                  }}>
                    <div style={{
                      width: 32, height: 32, flexShrink: 0, borderRadius: 0,
                      background: isOpen ? "#dbeafe" : "#fce7f3",
                      color: isOpen ? "#1e40af" : "#9d174d",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontWeight: 900, fontSize: 13,
                    }}>
                      {isOpen ? "👁" : "🔗"}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: L.text }}>
                        {isOpen ? "Opened email" : "Clicked link"}
                      </div>
                      <div style={{ fontSize: 12, color: L.muted, marginTop: 1 }}>{formatDateTime(ev.created_at)}</div>
                      {!isOpen && ev.url && (
                        <div style={{ fontSize: 11.5, color: L.dimmed, marginTop: 2, wordBreak: "break-all" }}>{ev.url}</div>
                      )}
                      <div style={{ fontSize: 11.5, color: L.dimmed, marginTop: 2 }}>
                        {deviceFromUserAgent(ev.user_agent)}{ev.ip ? ` · ${ev.ip}` : ""}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <a href="/dashboard/today" className="btn-lift" style={{
          padding: "11px 20px", background: "#f8fafc", color: L.text,
          border: `1px solid ${L.border}`, borderRadius: 0, fontSize: 14, fontWeight: 700,
          display: "inline-flex", alignItems: "center", textDecoration: "none",
        }}>Back to Today</a>
      </div>
    </div>
  );
}
