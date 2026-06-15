import { renderTemplate, EmailStep, industryKey, INDUSTRY_LABELS } from "@/lib/templates";
import Topbar from "@/components/Topbar";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };

export const revalidate = 0;

const STEPS: { step: EmailStep; label: string; hint: string }[] = [
  { step: "initial", label: "Initial outreach", hint: "First email sent to a brand new lead" },
  { step: "followup1", label: "Follow-up 1", hint: "Sent ~4 days after the initial email if there's no reply" },
  { step: "followup2", label: "Follow-up 2", hint: "Sent ~7 days after follow-up 1 if there's still no reply" },
];

export default function TemplatesPage({
  searchParams,
}: {
  searchParams: { company?: string; contact_name?: string; trade?: string; location?: string };
}) {
  const company = searchParams.company || "Smith Plumbing";
  const contact_name = searchParams.contact_name || "Dave";
  const trade = searchParams.trade || "plumbing";
  const location = searchParams.location || "Auckland NZ";

  const previews = STEPS.map(({ step, label, hint }) => {
    const { subject, html } = renderTemplate(step, {
      company,
      contact_name,
      trade,
      location,
      cta_link: "#",
      pixel: "",
    });
    return { step, label, hint, subject, html };
  });

  return (
    <div>
      <Topbar title="EMAIL TEMPLATES" subtitle="The 3-step sequence sent to leads — different industries get different copy" />

      <div style={{ maxWidth: 760, margin: "32px auto", padding: "0 28px" }}>
        <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 0, padding: 24, marginBottom: 20 }}>
          <div style={{ fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, fontWeight: 800, marginBottom: 4 }}>Preview with sample lead</div>
          <p style={{ fontSize: 13, color: L.muted, marginBottom: 4 }}>
            Fill in an example to see how the email reads for a different trade or location. Trades containing &quot;clean&quot; get the cleaning-specific copy — everything else gets the default copy.
          </p>
          <p style={{ fontSize: 12.5, color: "#2563eb", fontWeight: 700, marginBottom: 16 }}>
            Showing: {INDUSTRY_LABELS[industryKey(trade)]} template set
          </p>
          <form method="get" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label>Company</label>
              <input name="company" defaultValue={company} />
            </div>
            <div>
              <label>Contact name</label>
              <input name="contact_name" defaultValue={contact_name} />
            </div>
            <div>
              <label>Trade</label>
              <input name="trade" defaultValue={trade} placeholder="e.g. roofing, electrical, landscaping" />
            </div>
            <div>
              <label>Location</label>
              <input name="location" defaultValue={location} placeholder="e.g. Christchurch NZ" />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <button type="submit" className="btn-lift" style={{
                padding: "11px 24px", background: "var(--red)", color: "#fff",
                border: "none", borderRadius: 0, fontSize: 14, fontWeight: 700, cursor: "pointer",
              }}>Update preview</button>
            </div>
          </form>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {previews.map(({ step, label, hint, subject, html }) => (
            <details key={step} open style={{ background: "#fff", border: `1px solid ${L.border}`, borderRadius: 0 }}>
              <summary style={{
                cursor: "pointer", padding: "14px 18px",
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
              }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 14, color: L.text }}>{label}</div>
                  <div style={{ fontSize: 12, color: L.muted, marginTop: 2 }}>{hint}</div>
                </div>
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
      </div>
    </div>
  );
}
