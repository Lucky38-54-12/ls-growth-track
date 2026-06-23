import { createSupabaseClient } from "@/lib/supabase";
import { Lead } from "@/lib/types";
import Topbar from "@/components/Topbar";
import StageSelect from "@/components/cold-call/StageSelect";
import { Phone, Mail, Plus } from "lucide-react";
import Link from "next/link";

export const revalidate = 0;

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };

const STAGES: { key: string; label: string }[] = [
  { key: "called", label: "Called" },
  { key: "emailed", label: "Emailed" },
  { key: "meeting_booked", label: "Meeting Booked" },
  { key: "replied", label: "Replied" },
  { key: "closed", label: "Closed" },
  { key: "not_interested", label: "Not Interested" },
];

function initials(name: string) {
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

function stageOf(status: string) {
  return STAGES.some(s => s.key === status) ? status : "called";
}

function LeadRow({ lead, isLast }: { lead: Lead; isLast: boolean }) {
  return (
    <tr style={{ borderBottom: isLast ? "none" : `1px solid ${L.border}` }}>
      <td style={{ padding: "8px 14px" }}>
        <Link href={`/dashboard/leads/${lead.lead_id}`} style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <div style={{ width: 26, height: 26, background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9.5, fontWeight: 700, color: L.muted, flexShrink: 0 }}>
            {initials(lead.company)}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: L.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{lead.company}</div>
            <div style={{ fontSize: 10.5, color: L.dimmed }}>{lead.contact_name || "—"}</div>
          </div>
        </Link>
      </td>
      <td style={{ padding: "8px 14px" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: L.muted }}>
          <Mail style={{ width: 11, height: 11 }} />{lead.email || "—"}
        </span>
      </td>
      <td style={{ padding: "8px 14px" }}>
        {lead.phone
          ? <a href={`tel:${lead.phone}`} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: L.muted, textDecoration: "none" }}>
              <Phone style={{ width: 11, height: 11 }} />{lead.phone}
            </a>
          : <span style={{ fontSize: 11, color: L.dimmed }}>—</span>}
      </td>
      <td style={{ padding: "8px 14px" }}>{lead.location || <span style={{ color: L.dimmed }}>—</span>}</td>
      <td style={{ padding: "8px 14px", textAlign: "right" }}>
        <StageSelect leadId={lead.lead_id} status={lead.status} />
      </td>
    </tr>
  );
}

function StageSection({ label, leads }: { label: string; leads: Lead[] }) {
  return (
    <div style={{ background: L.surface, border: `1px solid ${L.border}`, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", borderBottom: `1px solid ${L.border}`, background: "#f8fafc" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: L.text }}>{label}</span>
        <span style={{ fontSize: 10.5, fontWeight: 700, padding: "1px 7px", background: "#e2e8f0", color: L.muted }}>{leads.length}</span>
      </div>
      {leads.length === 0 ? (
        <div style={{ padding: 16, textAlign: "center", color: L.dimmed, fontSize: 12 }}>Empty</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            {leads.map((lead, i) => (
              <LeadRow key={lead.lead_id} lead={lead} isLast={i === leads.length - 1} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default async function ColdCallPipelinePage() {
  const sb = createSupabaseClient();
  const { data } = await sb.from("leads").select("*").eq("source", "cold_call").order("date_added", { ascending: false });
  const leads = (data || []) as Lead[];

  const active = leads.filter(l => stageOf(l.status) !== "not_interested");
  const notInterested = leads.filter(l => stageOf(l.status) === "not_interested");

  const closedCount = leads.filter(l => stageOf(l.status) === "closed").length;
  const convRate = leads.length > 0 ? Math.round((closedCount / leads.length) * 100) : 0;

  return (
    <div style={{ background: "#f1f5f9", minHeight: "100vh" }}>
      <Topbar title="Cold Call Pipeline" subtitle={`${leads.length} leads · ${closedCount} closed · ${convRate}% conversion`} />

      <div style={{ padding: "20px 28px 60px", display: "flex", flexDirection: "column", gap: 12 }}>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <p style={{ fontSize: 11, color: L.muted }}>
            Every lead added from the <Link href="/dashboard/cold-call" style={{ color: "var(--red)" }}>Cold Call</Link> page lands here — move it through stages as you follow up.
          </p>
          <Link href="/dashboard/cold-call" className="btn-lift" style={{
            display: "flex", alignItems: "center", gap: 6, background: "var(--red)", color: "#fff",
            border: "none", padding: "8px 16px", fontSize: 12, fontWeight: 700, textDecoration: "none", flexShrink: 0,
          }}>
            <Plus style={{ width: 13, height: 13 }} /> Log a Call
          </Link>
        </div>

        {STAGES.filter(s => s.key !== "not_interested").map(stage => (
          <StageSection
            key={stage.key}
            label={stage.label}
            leads={active.filter(l => stageOf(l.status) === stage.key)}
          />
        ))}

        <StageSection label="Not Interested" leads={notInterested} />
      </div>
    </div>
  );
}
