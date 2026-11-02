"use client";

import { useMemo, useState } from "react";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };

export interface PaymentClient {
  id: string;
  name: string;
  contact_name: string | null;
  trade: string | null;
  monthly_fee: number | null;
  billing_cycle_days: number;
  next_payment_due_date: string | null;
  last_paid_at: string | null;
}

function todayISODate(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Pacific/Auckland" }).format(new Date());
}

function daysBetween(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split("-").map(Number);
  const [ty, tm, td] = toIso.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
}

// Advances by one calendar month, preserving the day-of-month (e.g. the
// 10th -> the 10th) instead of a fixed 30-day offset, which drifts away
// from a fixed invoicing day over several cycles.
function addOneMonth(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCMonth(dt.getUTCMonth() + 1);
  return dt.toISOString().slice(0, 10);
}

function statusFor(dueDate: string | null, today: string): { label: string; bg: string; color: string } {
  if (!dueDate) return { label: "No due date set", bg: "#f1f5f9", color: L.dimmed };
  const days = daysBetween(today, dueDate);
  if (days < 0) return { label: `Overdue ${-days}d`, bg: "#fef2f2", color: "#b91c1c" };
  if (days === 0) return { label: "Due today", bg: "#fff7ed", color: "#c2410c" };
  if (days <= 3) return { label: `Due in ${days}d`, bg: "#fffbeb", color: "#b45309" };
  return { label: `Due ${dueDate}`, bg: "#f0fdf4", color: "#15803d" };
}

export default function PaymentsTable({ clients: initialClients }: { clients: PaymentClient[] }) {
  const [clients, setClients] = useState(initialClients);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const today = todayISODate();

  const sorted = useMemo(() => {
    return [...clients].sort((a, b) => {
      if (!a.next_payment_due_date && !b.next_payment_due_date) return a.name.localeCompare(b.name);
      if (!a.next_payment_due_date) return 1;
      if (!b.next_payment_due_date) return -1;
      return a.next_payment_due_date.localeCompare(b.next_payment_due_date);
    });
  }, [clients]);

  async function patch(id: string, body: Partial<PaymentClient>) {
    setSavingId(id);
    setError(null);
    const previous = clients;
    setClients((prev) => prev.map((c) => (c.id === id ? { ...c, ...body } : c)));
    try {
      const res = await fetch(`/api/lead-qual/clients/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setClients(previous);
        setError("Could not save that change.");
      }
    } catch {
      setClients(previous);
      setError("Something went wrong saving that change.");
    } finally {
      setSavingId(null);
    }
  }

  function markPaid(c: PaymentClient) {
    const nextDue = addOneMonth(c.next_payment_due_date || today);
    patch(c.id, { last_paid_at: today, next_payment_due_date: nextDue });
  }

  return (
    <div style={{ padding: "0 28px 60px" }}>
      {error && <p style={{ color: "#b91c1c", fontSize: 12.5, marginBottom: 10 }}>{error}</p>}

      <div style={{ background: L.surface, border: `1px solid ${L.border}`, borderRadius: 10, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 1fr 0.9fr", padding: "10px 16px", borderBottom: `1px solid ${L.border}`, fontSize: 10.5, fontWeight: 700, color: L.dimmed, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          <span>Client</span>
          <span>Monthly fee</span>
          <span>Next due date</span>
          <span>Status</span>
          <span>Last paid</span>
        </div>

        {sorted.length === 0 ? (
          <p style={{ padding: 32, textAlign: "center", color: L.dimmed, fontSize: 13 }}>No clients yet.</p>
        ) : (
          sorted.map((c) => {
            const status = statusFor(c.next_payment_due_date, today);
            const saving = savingId === c.id;
            return (
              <div
                key={c.id}
                style={{
                  display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 1fr 0.9fr", alignItems: "center",
                  padding: "10px 16px", borderBottom: `1px solid ${L.border}`, gap: 8, opacity: saving ? 0.6 : 1,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 13.5, fontWeight: 700, color: L.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</p>
                  <p style={{ fontSize: 11, color: L.dimmed }}>{c.contact_name || c.trade || ""}</p>
                </div>

                <input
                  type="number"
                  defaultValue={c.monthly_fee ?? ""}
                  placeholder="$"
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    patch(c.id, { monthly_fee: v === "" ? null : Number(v) });
                  }}
                  style={{ width: "100%", padding: "6px 8px", fontSize: 13, border: `1px solid ${L.border}`, borderRadius: 6 }}
                />

                <input
                  type="date"
                  defaultValue={c.next_payment_due_date ?? ""}
                  onChange={(e) => patch(c.id, { next_payment_due_date: e.target.value || null })}
                  style={{ width: "100%", padding: "6px 8px", fontSize: 13, border: `1px solid ${L.border}`, borderRadius: 6 }}
                />

                <span style={{ fontSize: 11.5, fontWeight: 700, color: status.color, background: status.bg, padding: "4px 10px", borderRadius: 20, width: "fit-content" }}>
                  {status.label}
                </span>

                <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
                  <span style={{ fontSize: 11.5, color: L.muted }}>{c.last_paid_at || "—"}</span>
                  <button
                    onClick={() => markPaid(c)}
                    disabled={saving}
                    style={{ fontSize: 11, fontWeight: 700, color: "#15803d", background: "#f0fdf4", border: "none", borderRadius: 6, padding: "4px 8px", cursor: "pointer" }}
                  >
                    Mark paid
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
