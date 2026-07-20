"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { DollarSign, Plus, Pencil, X, Trash2 } from "lucide-react";
import { RevenueClient } from "@/lib/types";

interface Props {
  clients: RevenueClient[];
  monthlyGoal: number;
}

const L = { border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dim: "#94a3b8" };
const money = (n: number) => `$${n.toLocaleString("en-NZ", { maximumFractionDigits: 0 })}`;

export default function RevenueGoalCard({ clients, monthlyGoal }: Props) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [goalInput, setGoalInput] = useState(String(monthlyGoal));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const total = clients.reduce((sum, c) => sum + Number(c.amount), 0);
  const pct = monthlyGoal > 0 ? Math.min(100, Math.round((total / monthlyGoal) * 100)) : 0;

  async function handleAddClient() {
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/revenue/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, amount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add client");
      setAddOpen(false);
      setName("");
      setAmount("");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveGoal() {
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/revenue/goal", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monthly_goal: goalInput }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save goal");
      setGoalOpen(false);
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(id: string) {
    await fetch(`/api/revenue/clients/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="surface-card" style={{ overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: `1px solid ${L.border}` }}>
        <DollarSign style={{ width: 15, height: 15, color: L.muted }} />
        <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: L.text }}>Monthly Revenue Goal</span>
        <button
          onClick={() => { setGoalInput(String(monthlyGoal)); setError(""); setGoalOpen(true); }}
          className="pill-hover"
          style={{ marginLeft: "auto", display: "flex", alignItems: "center", padding: 4, background: "none", border: "none", color: L.dim, cursor: "pointer" }}
        >
          <Pencil style={{ width: 12, height: 12 }} />
        </button>
      </div>

      <div style={{ padding: "16px 18px", borderBottom: `1px solid ${L.border}` }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 10 }}>
          <span style={{ fontSize: 28, fontWeight: 800, color: "#16a34a", letterSpacing: "-0.02em" }}>{money(total)}</span>
          <span style={{ fontSize: 13, color: L.muted }}>/ {money(monthlyGoal)}</span>
          <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color: L.muted }}>{pct}%</span>
        </div>
        <div style={{ width: "100%", height: 8, background: "#f1f5f9", borderRadius: 4, overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: "#16a34a", borderRadius: 4, transition: "width 0.3s" }} />
        </div>
      </div>

      {clients.length === 0 ? (
        <div style={{ padding: 24, textAlign: "center", color: L.dim, fontSize: 12.5 }}>No clients added yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", maxHeight: 260, overflowY: "auto" }}>
          {clients.map(c => (
            <div key={c.id} className="row-hover" style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 18px", borderBottom: `1px solid ${L.border}` }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: L.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#16a34a", flexShrink: 0 }}>{money(Number(c.amount))}/mo</span>
              <button
                onClick={() => handleRemove(c.id)}
                style={{ display: "flex", padding: 4, background: "none", border: "none", color: L.dim, cursor: "pointer", flexShrink: 0 }}
              >
                <Trash2 style={{ width: 12, height: 12 }} />
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => { setName(""); setAmount(""); setError(""); setAddOpen(true); }}
        className="pill-hover"
        style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "12px 18px",
          fontSize: 12.5, fontWeight: 700, color: "var(--blue, #2563eb)", background: "none", border: "none", cursor: "pointer", width: "100%",
        }}
      >
        <Plus style={{ width: 13, height: 13 }} /> Add Client
      </button>

      {(addOpen || goalOpen) && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => { setAddOpen(false); setGoalOpen(false); }}
        >
          <div
            style={{ width: "100%", maxWidth: 420, background: "#fff", margin: "0 16px", border: `1px solid ${L.border}`, borderRadius: 14, overflow: "hidden", boxShadow: "0 20px 48px rgba(15,23,42,0.22)" }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: `1px solid ${L.border}` }}>
              <p style={{ fontSize: 13, fontWeight: 800, color: L.text }}>{addOpen ? "Add client" : "Set monthly goal"}</p>
              <button onClick={() => { setAddOpen(false); setGoalOpen(false); }} style={{ background: "none", border: "none", cursor: "pointer", color: L.dim, display: "flex", padding: 4 }}>
                <X style={{ width: 14, height: 14 }} />
              </button>
            </div>

            <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
              {addOpen ? (
                <>
                  <div>
                    <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: L.muted, display: "block", marginBottom: 5 }}>Client name</label>
                    <input
                      value={name}
                      onChange={e => setName(e.target.value)}
                      style={{ width: "100%", padding: "8px 10px", border: `1px solid ${L.border}`, fontSize: 13, color: L.text, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: L.muted, display: "block", marginBottom: 5 }}>Amount per month ($)</label>
                    <input
                      type="number"
                      value={amount}
                      onChange={e => setAmount(e.target.value)}
                      style={{ width: "100%", padding: "8px 10px", border: `1px solid ${L.border}`, fontSize: 13, color: L.text, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
                    />
                  </div>
                </>
              ) : (
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: L.muted, display: "block", marginBottom: 5 }}>Monthly goal ($)</label>
                  <input
                    type="number"
                    value={goalInput}
                    onChange={e => setGoalInput(e.target.value)}
                    style={{ width: "100%", padding: "8px 10px", border: `1px solid ${L.border}`, fontSize: 13, color: L.text, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
                  />
                </div>
              )}

              {error && (
                <p style={{ fontSize: 12, color: "var(--red)", background: "#fef2f2", padding: "8px 10px" }}>{error}</p>
              )}
            </div>

            <div style={{ padding: "12px 18px", borderTop: `1px solid ${L.border}`, display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => { setAddOpen(false); setGoalOpen(false); }} style={{
                padding: "8px 16px", fontSize: 12, fontWeight: 600, color: L.muted, background: "#fff",
                border: `1px solid ${L.border}`, cursor: "pointer",
              }}>Cancel</button>
              <button
                onClick={addOpen ? handleAddClient : handleSaveGoal}
                disabled={busy}
                style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "8px 18px", fontSize: 12, fontWeight: 700,
                  background: "#16a34a", color: "#fff", border: "none", cursor: busy ? "wait" : "pointer", opacity: busy ? 0.7 : 1,
                }}
              >
                {busy ? "Saving..." : addOpen ? "Add Client" : "Save Goal"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
