import Link from "next/link";
import { Phone, PhoneCall, Clock, Ban, Flame } from "lucide-react";
import { createSupabaseClient, fetchAllRows } from "@/lib/supabase";
import { Lead } from "@/lib/types";
import { buildCallQueue, segmentLabel, LOW_QUEUE_THRESHOLD } from "@/lib/leads";
import Topbar from "@/components/Topbar";
import WarmLeadRow, { WarmLead } from "@/components/WarmLeadRow";

export const revalidate = 0;

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };

export default async function CallQueuePage() {
  const sb = createSupabaseClient();
  const leads = await fetchAllRows<Lead>((from, to) =>
    sb.from("leads").select("*").eq("source", "cold_call").order("date_added", { ascending: true }).range(from, to)
  );
  const { data: warmLeadRows } = await sb.from("warm_leads").select("*").eq("called", false).order("created_at", { ascending: true });
  const warmLeads = (warmLeadRows || []) as WarmLead[];
  const warmBySegment = new Map<string, WarmLead[]>();
  for (const w of warmLeads) {
    const key = segmentLabel(w.trade, w.location);
    warmBySegment.set(key, [...(warmBySegment.get(key) || []), w]);
  }

  const queue = buildCallQueue(leads);
  const totalFresh = queue.freshBySegment.reduce((sum, g) => sum + g.leads.length, 0);

  return (
    <div>
      <Topbar title="Call Queue" subtitle="Who to call next, and who's asked for a callback" />

      <div style={{ maxWidth: 1080, margin: "32px auto", padding: "0 28px", display: "flex", flexDirection: "column", gap: 24 }}>
        {/* Callbacks due */}
        <div style={{ background: L.surface, border: `1px solid ${L.border}`, padding: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
            <Clock style={{ width: 14, height: 14, color: "var(--accent)" }} />
            <span style={{ fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: L.text, fontWeight: 800 }}>
              Call Back — {queue.callbacksDue.length}
            </span>
          </div>
          {queue.callbacksDue.length === 0 ? (
            <p style={{ color: L.muted, fontSize: 13 }}>Nobody due for a callback right now.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {queue.callbacksDue.map((lead) => (
                <QueueRow key={lead.lead_id} lead={lead} note={`Follow up was due ${lead.follow_up_at}`} overdue />
              ))}
            </div>
          )}
        </div>

        {/* Warm leads — genuine interest surfaced from the old cold-call sheets */}
        <div style={{ background: L.surface, border: `1px solid ${L.border}`, padding: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <Flame style={{ width: 14, height: 14, color: "var(--accent)" }} />
            <span style={{ fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: L.text, fontWeight: 800 }}>
              Warm Leads — {warmLeads.length}
            </span>
          </div>
          <p style={{ fontSize: 12.5, color: L.muted, marginBottom: 18 }}>
            Pulled from old cold-call sheets — people who showed real interest but weren't ready yet. Mark called once you've followed up.
          </p>
          {warmLeads.length === 0 ? (
            <p style={{ color: L.muted, fontSize: 13 }}>None left to follow up on.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
              {Array.from(warmBySegment.entries()).map(([label, group]) => (
                <div key={label}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 800, color: L.text }}>{label}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: L.dimmed }}>{group.length}</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {group.map((w) => (
                      <WarmLeadRow key={w.id} lead={w} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Fresh leads by segment */}
        <div style={{ background: L.surface, border: `1px solid ${L.border}`, padding: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
            <PhoneCall style={{ width: 14, height: 14, color: "var(--accent)" }} />
            <span style={{ fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: L.text, fontWeight: 800 }}>
              New Leads To Call — {totalFresh}
            </span>
          </div>
          {queue.freshBySegment.length === 0 ? (
            <p style={{ color: L.muted, fontSize: 13 }}>
              No fresh leads waiting. Run the <Link href="/dashboard/scraper" style={{ color: "var(--accent)" }}>Scraper</Link> to add more.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
              {queue.freshBySegment.map((group) => {
                const low = group.leads.length <= LOW_QUEUE_THRESHOLD;
                return (
                  <div key={group.key}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 800, color: L.text }}>
                        {segmentLabel(group.trade, group.location)}
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: L.dimmed }}>{group.leads.length} left</span>
                      {low && (
                        <Link
                          href={`/dashboard/scraper?q=${encodeURIComponent(`${group.trade} ${group.location}`.trim())}`}
                          style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", background: "#fef3c7", color: "#92400e", textDecoration: "none" }}
                        >
                          Running low — scrape more
                        </Link>
                      )}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {group.leads.slice(0, 15).map((lead) => (
                        <QueueRow key={lead.lead_id} lead={lead} />
                      ))}
                      {group.leads.length > 15 && (
                        <span style={{ fontSize: 12, color: L.dimmed, padding: "4px 0" }}>
                          +{group.leads.length - 15} more in this segment
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Saturated segments */}
        {queue.saturatedSegments.length > 0 && (
          <div style={{ background: L.surface, border: `1px solid ${L.border}`, padding: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <Ban style={{ width: 14, height: 14, color: L.muted }} />
              <span style={{ fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: L.text, fontWeight: 800 }}>
                Paused — Already Got Meetings
              </span>
            </div>
            <p style={{ fontSize: 12.5, color: L.muted, marginBottom: 14 }}>
              These trade+city combos have {"≥"}3 live or won meetings, so their remaining leads are held back out of the queue above.
              If a meeting falls through, that lead frees up on its own.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {queue.saturatedSegments.map((s) => (
                <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                  <span style={{ fontWeight: 700, color: L.text }}>{segmentLabel(s.trade, s.location)}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", background: "#dcfce7", color: "#166534" }}>
                    {s.count} live/won meeting{s.count !== 1 ? "s" : ""}
                  </span>
                  {s.dormantCount > 0 && (
                    <span style={{ fontSize: 11, color: L.dimmed }}>{s.dormantCount} lead{s.dormantCount !== 1 ? "s" : ""} held back</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function QueueRow({ lead, note, overdue }: { lead: Lead; note?: string; overdue?: boolean }) {
  return (
    <div
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
        padding: "10px 12px", border: `1px solid ${overdue ? "#fecaca" : L.border}`,
        background: overdue ? "#fef2f2" : "#fafbfc",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <Link href={`/dashboard/leads/${lead.lead_id}`} style={{ color: "var(--accent)", fontWeight: 700, fontSize: 13.5 }}>
          {lead.company}
        </Link>
        <div style={{ fontSize: 12, color: L.muted, marginTop: 2 }}>
          {lead.contact_name && lead.contact_name !== "there" ? `${lead.contact_name} · ` : ""}
          {[lead.trade, lead.location].filter(Boolean).join(" · ") || "—"}
        </div>
        {note && <div style={{ fontSize: 11.5, color: overdue ? "#b91c1c" : L.dimmed, marginTop: 2, fontWeight: 600 }}>{note}</div>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        {lead.phone && (
          <a
            href={`tel:${lead.phone}`}
            style={{ display: "flex", alignItems: "center", gap: 5, background: "var(--accent)", color: "#fff", padding: "6px 12px", fontSize: 12, fontWeight: 700, textDecoration: "none" }}
          >
            <Phone style={{ width: 12, height: 12 }} />
            {lead.phone}
          </a>
        )}
        <Link
          href="/dashboard/cold-call"
          style={{ fontSize: 11.5, fontWeight: 700, color: L.muted, textDecoration: "none", padding: "6px 8px" }}
        >
          Log call
        </Link>
      </div>
    </div>
  );
}
