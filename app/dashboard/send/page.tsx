import { createSupabaseClient } from "@/lib/supabase";
import { nextStepFor } from "@/lib/leads";
import { renderTemplate, EmailStep } from "@/lib/templates";
import { Lead } from "@/lib/types";
import SendButton from "@/components/SendButton";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };

export const revalidate = 0;

const STEP_LABEL: Record<EmailStep, string> = {
  initial: "Initial outreach",
  followup1: "Follow-up 1",
  followup2: "Follow-up 2",
};

export default async function SendQueuePage() {
  const sb = createSupabaseClient();
  const { data: leads } = await sb.from("leads").select("*").order("date_added", { ascending: false });
  const allLeads = (leads || []) as Lead[];

  const queue = allLeads
    .map((lead) => {
      const step = nextStepFor(lead);
      if (!step) return null;
      const { subject, html } = renderTemplate(step, {
        company: lead.company,
        contact_name: lead.contact_name || "there",
        trade: lead.trade,
        location: lead.location,
        cta_link: "#",
        pixel: "",
      });
      return { lead, step, subject, html };
    })
    .filter((x): x is { lead: Lead; step: EmailStep; subject: string; html: string } => x !== null);

  return (
    <div>
      <div style={{ background: "#fff", borderBottom: `1px solid ${L.border}`, padding: "0 28px", height: 68, display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 34, height: 34, borderRadius: 0, background: "var(--red)", flexShrink: 0 }} />
        <div>
          <h1 style={{ fontSize: 17, fontWeight: 900, letterSpacing: "0.04em" }}>SEND QUEUE</h1>
          <p style={{ color: L.muted, fontSize: 12, marginTop: 1 }}>Preview exactly what will be sent before it goes out</p>
        </div>
      </div>

      <div style={{ maxWidth: 760, margin: "32px auto", padding: "0 28px" }}>
        <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 0, padding: "18px 18px 16px", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: L.muted }}>Ready to send</span>
            {queue.length > 0 && (
              <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 0, background: "#fee2e2", color: "#dc2626" }}>{queue.length} due</span>
            )}
          </div>
          <p style={{ fontSize: 12.5, color: L.muted, marginBottom: 14, lineHeight: 1.5 }}>
            {queue.length > 0
              ? `${queue.length} lead${queue.length !== 1 ? "s" : ""} ready for their next email — expand any row below to see exactly what will be sent.`
              : "All caught up — no emails due right now."}
          </p>
          <SendButton due={queue.length} />
        </div>

        {queue.length === 0 ? (
          <div style={{ background: "#fff", border: `1px solid ${L.border}`, borderRadius: 0, padding: "32px", textAlign: "center", color: L.dimmed, fontSize: 13 }}>
            Nothing in the queue right now.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {queue.map(({ lead, step, subject, html }) => (
              <details key={lead.lead_id} style={{ background: "#fff", border: `1px solid ${L.border}`, borderRadius: 0 }}>
                <summary style={{
                  cursor: "pointer", listStyle: "none", padding: "14px 18px",
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 14, color: L.text }}>{lead.company}</div>
                    <div style={{ fontSize: 12, color: L.muted, marginTop: 2 }}>{lead.email}</div>
                  </div>
                  <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 0, background: "#fee2e2", color: "#dc2626", flexShrink: 0 }}>
                    {STEP_LABEL[step]}
                  </span>
                </summary>
                <div style={{ borderTop: `1px solid ${L.border}`, padding: 18 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, marginBottom: 4 }}>Subject</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: L.text, marginBottom: 14 }}>{subject}</div>
                  <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, marginBottom: 8 }}>Body</div>
                  <div style={{ border: `1px solid ${L.border}`, padding: 16, background: "#f8fafc" }} dangerouslySetInnerHTML={{ __html: html }} />
                </div>
              </details>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
