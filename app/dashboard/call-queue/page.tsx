import { createSupabaseClient, fetchAllRows } from "@/lib/supabase";
import { Lead } from "@/lib/types";
import Topbar from "@/components/Topbar";
import ProspectFinder from "./ProspectFinder";
import { Phone, Globe, Link2 } from "lucide-react";
import Link from "next/link";

export const revalidate = 0;

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };

export default async function CallQueuePage() {
  const sb = createSupabaseClient();
  const queue = await fetchAllRows<Lead>((from, to) => sb
    .from("leads")
    .select("*")
    .eq("source", "cold_call")
    .eq("status", "not_contacted")
    .order("date_added", { ascending: false })
    .range(from, to));

  return (
    <div>
      <Topbar title="Call Queue" subtitle="Auto-found prospects, ready to call" />

      <div style={{ maxWidth: 860, margin: "28px auto", padding: "0 28px" }}>
        <ProspectFinder />

        {queue.length === 0 ? (
          <div style={{ background: L.surface, border: `1px solid ${L.border}`, padding: 40, textAlign: "center" }}>
            <p style={{ fontSize: 14, color: L.muted }}>No prospects queued yet — click &quot;Find Prospects&quot; above.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {queue.map((lead) => (
              <div key={lead.lead_id} style={{ background: L.surface, border: `1px solid ${L.border}`, padding: 20 }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: L.text }}>{lead.company}</div>
                    <div style={{ fontSize: 12, color: L.dimmed, marginTop: 2 }}>{lead.trade} &middot; {lead.location}</div>

                    <div style={{ display: "flex", gap: 14, marginTop: 8, flexWrap: "wrap" }}>
                      {lead.phone && (
                        <a href={`tel:${lead.phone}`} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, color: "var(--red)", fontWeight: 600, textDecoration: "none" }}>
                          <Phone style={{ width: 13, height: 13 }} /> {lead.phone}
                        </a>
                      )}
                      {lead.website && (
                        <a href={lead.website} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: L.muted, textDecoration: "none" }}>
                          <Globe style={{ width: 12, height: 12 }} /> Website
                        </a>
                      )}
                      {lead.facebook && (
                        <a href={lead.facebook} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: L.muted, textDecoration: "none" }}>
                          <Link2 style={{ width: 12, height: 12 }} /> Facebook
                        </a>
                      )}
                    </div>

                    {lead.notes?.trim() && (
                      <div style={{ marginTop: 12, padding: "10px 12px", background: "#f8fafc", border: `1px solid ${L.border}`, fontSize: 13, color: L.text, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                        {lead.notes}
                      </div>
                    )}
                  </div>

                  <Link
                    href={`/dashboard/leads/${lead.lead_id}`}
                    className="btn-lift"
                    style={{
                      display: "flex", alignItems: "center", gap: 6, background: "#0f172a", color: "#fff",
                      border: "none", padding: "9px 16px", fontSize: 13, fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap", flexShrink: 0,
                    }}
                  >
                    Log Call &rarr;
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
