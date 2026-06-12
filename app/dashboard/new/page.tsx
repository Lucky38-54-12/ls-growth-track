"use client";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { renderTemplate } from "@/lib/templates";
import { parseLeadText } from "@/lib/parseLead";
import Topbar from "@/components/Topbar";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b" };

export default function NewLeadPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pasted, setPasted] = useState("");

  const [company, setCompany] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [trade, setTrade] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");

  function handleParse() {
    if (!pasted.trim()) return;
    const parsed = parseLeadText(pasted);
    if (parsed.company) setCompany(parsed.company);
    if (parsed.contact_name) setContactName(parsed.contact_name);
    if (parsed.email) setEmail(parsed.email);
    if (parsed.trade) setTrade(parsed.trade);
    if (parsed.location) setLocation(parsed.location);
    setNotes((prev) => prev || pasted.trim());
  }

  const draft = useMemo(() => {
    return renderTemplate("initial", {
      company: company || "[company]",
      contact_name: contactName || "there",
      trade: trade || "[trade]",
      location: location || "[location]",
      cta_link: "#",
      pixel: "",
    });
  }, [company, contactName, trade, location]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const body = { company, contact_name: contactName, email, trade, location, notes };
    const res = await fetch("/api/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    setLoading(false);
    if (data.error) { setError(data.error); return; }
    const msg = data.emailError ? `Added lead (email failed: ${data.emailError})` : `Added ${data.lead.company} and sent their first email.`;
    router.push(`/dashboard?flash=${encodeURIComponent(msg)}`);
  }

  return (
    <div>
      <Topbar title="ADD LEAD" subtitle="Paste details from anywhere, check the draft, then send" />

      <div style={{ maxWidth: 1080, margin: "32px auto", padding: "0 28px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" }}>
        <div>
          {error && <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", color: "#991b1b", padding: "10px 16px", borderRadius: 0, marginBottom: 18, fontSize: 14 }}>{error}</div>}

          <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 0, padding: 24, marginBottom: 20 }}>
            <div style={{ fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, fontWeight: 800, marginBottom: 4 }}>Quick add</div>
            <p style={{ fontSize: 13, color: L.muted, marginBottom: 12 }}>
              Copy and paste anything about the business (Google Maps listing, website text, directory entry). We&apos;ll pull out the company name, email, trade and location for you.
            </p>
            <textarea
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              rows={6}
              placeholder={"e.g.\nAcme Plumbing\n123 Queen St, Auckland, NZ\nOwner: Mike\ninfo@acmeplumbing.co.nz"}
              style={{ resize: "vertical", marginBottom: 12 }}
            />
            <button
              type="button"
              onClick={handleParse}
              className="btn-lift"
              style={{ padding: "10px 20px", background: "#0f172a", color: "#fff", border: "none", borderRadius: 0, fontSize: 13, fontWeight: 700, cursor: "pointer" }}
            >
              Fill in details
            </button>
          </div>

          <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 0, padding: 24 }}>
            <div style={{ fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, fontWeight: 800, marginBottom: 4 }}>New Lead</div>
            <p style={{ fontSize: 13, color: L.muted, marginBottom: 20 }}>Check these over, then saving will send the draft on the right.</p>
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label>Company</label>
                <input value={company} onChange={(e) => setCompany(e.target.value)} required placeholder="e.g. Acme Plumbing" />
              </div>
              <div>
                <label>Contact first name</label>
                <input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="e.g. Mike — leave blank for 'there'" />
              </div>
              <div>
                <label>Email</label>
                <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label>Trade</label>
                  <input value={trade} onChange={(e) => setTrade(e.target.value)} required placeholder="e.g. Plumbing" />
                </div>
                <div>
                  <label>Location</label>
                  <input value={location} onChange={(e) => setLocation(e.target.value)} required placeholder="e.g. Auckland NZ" />
                </div>
              </div>
              <div>
                <label>Notes <span style={{ fontWeight: 400, color: "#94a3b8" }}>(optional)</span></label>
                <input value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
              <div style={{ marginTop: 6, display: "flex", gap: 12 }}>
                <button type="submit" disabled={loading} className="btn-lift" style={{
                  padding: "11px 24px", background: loading ? "#fca5a5" : "var(--red)", color: "#fff",
                  border: "none", borderRadius: 0, fontSize: 14, fontWeight: 700, cursor: loading ? "default" : "pointer",
                }}>
                  {loading ? "Saving…" : "Save & send first email"}
                </button>
                <a href="/dashboard" className="btn-lift" style={{
                  padding: "11px 20px", background: "#f8fafc", color: L.text,
                  border: `1px solid ${L.border}`, borderRadius: 0, fontSize: 14, fontWeight: 700,
                  display: "inline-flex", alignItems: "center",
                }}>Cancel</a>
              </div>
            </form>
          </div>
        </div>

        <div style={{ position: "sticky", top: 20 }}>
          <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 0, padding: 24 }}>
            <div style={{ fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, fontWeight: 800, marginBottom: 4 }}>Draft email</div>
            <p style={{ fontSize: 13, color: L.muted, marginBottom: 16 }}>This is the initial outreach email that will be sent when you save this lead.</p>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, marginBottom: 4 }}>Subject</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: L.text, marginBottom: 14 }}>{draft.subject}</div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted, marginBottom: 8 }}>Body</div>
            <div style={{ border: `1px solid ${L.border}`, padding: 16, background: "#f8fafc" }} dangerouslySetInnerHTML={{ __html: draft.html }} />
          </div>
        </div>
      </div>
    </div>
  );
}
