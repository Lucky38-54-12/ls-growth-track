import Link from "next/link";
import { AlertTriangle, CalendarX, Sparkles } from "lucide-react";
import { createSupabaseClient } from "@/lib/supabase";
import Topbar from "@/components/Topbar";

export const revalidate = 0;

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };

const CATEGORY_LABEL: Record<string, string> = {
  budget: "Budget", creative: "Creative", audience: "Audience", location: "Location", qualification: "Qualification", general: "General",
};

interface Item {
  kind: "recommendation" | "needs_human" | "booking_failed";
  clientName: string;
  title: string;
  detail: string;
  priority: number;
  href: string;
}

export default async function OperatorDashboardPage() {
  const sb = createSupabaseClient();

  const [{ data: drafts }, { data: conversations }, { data: failedLeads }, { data: clients }] = await Promise.all([
    sb.from("chat_drafts").select("id, title, content, payload, created_at").eq("kind", "recommendation").eq("status", "pending"),
    sb.from("lq_conversations").select("id, client_id, contact, started_at").eq("status", "needs_human"),
    sb.from("lq_leads").select("id, client_id, contact_email, created_at, conversation_id").eq("booking_status", "failed"),
    sb.from("lq_clients").select("id, name"),
  ]);

  const clientName = new Map((clients || []).map((c) => [c.id, c.name]));

  const items: Item[] = [];

  for (const d of drafts || []) {
    const payload = (d.payload || {}) as { clientId?: string; clientName?: string; category?: string; priority?: number };
    items.push({
      kind: "recommendation",
      clientName: payload.clientName || "Unknown client",
      title: d.title,
      detail: `${payload.category ? `${CATEGORY_LABEL[payload.category] || payload.category} — ` : ""}${d.content}`,
      priority: payload.priority || 3,
      href: "/dashboard/approvals",
    });
  }

  for (const c of conversations || []) {
    const contact = (c.contact || {}) as { name?: string };
    items.push({
      kind: "needs_human",
      clientName: clientName.get(c.client_id) || "Unknown client",
      title: `Conversation needs a human — ${contact.name || "unnamed lead"}`,
      detail: "The AI qualifier couldn't confidently continue this conversation. Check it directly with the client.",
      priority: 1,
      href: `/dashboard/lead-qual/${c.client_id}`,
    });
  }

  for (const l of failedLeads || []) {
    items.push({
      kind: "booking_failed",
      clientName: clientName.get(l.client_id) || "Unknown client",
      title: `Booking failed — ${l.contact_email || "no email captured"}`,
      detail: "This lead qualified but the calendar booking didn't go through. Book it manually.",
      priority: 1,
      href: `/dashboard/lead-qual/${l.client_id}`,
    });
  }

  items.sort((a, b) => a.priority - b.priority);
  const top = items.slice(0, 10);

  return (
    <div style={{ background: "#f1f5f9", minHeight: "100vh" }}>
      <Topbar title="Operator Dashboard" subtitle="What actually needs your attention across every onboarded client — not raw data" />
      <div style={{ padding: "20px 28px 60px", maxWidth: 900, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 10, padding: "14px 18px" }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: L.text }}>
            {top.length === 0 ? "Nothing needs you right now." : `${top.length} thing${top.length === 1 ? "" : "s"} to do${items.length > top.length ? ` (of ${items.length} total)` : ""}`}
          </p>
        </div>

        {top.length === 0 && (
          <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 10, padding: 40, textAlign: "center", color: L.dimmed, fontSize: 13 }}>
            All caught up — no pending recommendations, no conversations needing review, no failed bookings.
          </div>
        )}

        {top.map((item, i) => {
          const Icon = item.kind === "recommendation" ? Sparkles : item.kind === "needs_human" ? AlertTriangle : CalendarX;
          const iconColor = item.kind === "recommendation" ? "#2563eb" : item.kind === "needs_human" ? "#b45309" : "#dc2626";
          return (
            <Link
              key={i}
              href={item.href}
              style={{ display: "flex", alignItems: "flex-start", gap: 12, background: L.surface, border: `1px solid ${L.border}`, borderRadius: 10, padding: 16, textDecoration: "none" }}
              className="card-hover"
            >
              <Icon style={{ width: 16, height: 16, color: iconColor, flexShrink: 0, marginTop: 2 }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: L.text }}>
                  {item.title} <span style={{ fontWeight: 500, color: L.dimmed }}>· {item.clientName}</span>
                </p>
                <p style={{ fontSize: 12, color: L.muted, marginTop: 3, lineHeight: 1.5 }}>{item.detail}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
