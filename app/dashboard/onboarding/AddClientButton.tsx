"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, X } from "lucide-react";

const L = { border: "#e2e8f0", text: "#0f172a", muted: "#64748b" };

export default function AddClientButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", company: "", email: "", phone: "" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.company.trim()) return;
    setSaving(true);
    await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    setOpen(false);
    setForm({ name: "", company: "", email: "", phone: "" });
    router.refresh();
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          display: "flex", alignItems: "center", gap: 7,
          padding: "9px 16px", background: "var(--red)", color: "#fff",
          border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer",
        }}
      >
        <UserPlus style={{ width: 15, height: 15 }} /> Add Client
      </button>

      {open && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setOpen(false)}
        >
          <div
            style={{ background: "#fff", borderRadius: 12, padding: 28, width: "100%", maxWidth: 420, margin: "0 16px", boxShadow: "0 20px 48px rgba(15,23,42,0.2)" }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <h2 style={{ fontSize: 16, fontWeight: 800, color: L.text }}>New Onboarding Client</h2>
              <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: L.muted, display: "flex" }}>
                <X style={{ width: 16, height: 16 }} />
              </button>
            </div>
            <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {[
                { key: "name", label: "Contact name", placeholder: "e.g. John Smith", required: true },
                { key: "company", label: "Company", placeholder: "e.g. ABC Plumbing", required: true },
                { key: "email", label: "Email", placeholder: "john@example.com", required: false },
                { key: "phone", label: "Phone", placeholder: "+64 21 000 000", required: false },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: L.muted, display: "block", marginBottom: 5 }}>
                    {f.label}{f.required && <span style={{ color: "var(--red)" }}> *</span>}
                  </label>
                  <input
                    type="text"
                    value={form[f.key as keyof typeof form]}
                    onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    required={f.required}
                    style={{ width: "100%", padding: "9px 12px", border: `1px solid ${L.border}`, borderRadius: 7, fontSize: 13, color: L.text, outline: "none", boxSizing: "border-box" }}
                  />
                </div>
              ))}
              <button
                type="submit"
                disabled={saving}
                style={{ marginTop: 4, padding: "10px", background: "var(--red)", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer" }}
              >
                {saving ? "Adding..." : "Add Client"}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
