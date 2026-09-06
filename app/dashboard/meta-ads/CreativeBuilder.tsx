"use client";
import { useEffect, useState, useCallback } from "react";
import { Plus, X, Trash2, Save } from "lucide-react";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };

type OptionCategory = "offer" | "angle" | "hook" | "style";

interface Option {
  id: string;
  category: OptionCategory;
  label: string;
  subtext: string | null;
}

interface Combo {
  id: string;
  service: string | null;
  offer: string | null;
  customer_reason: string | null;
  hypothesis: string | null;
  angle: string | null;
  hook: string | null;
  style: string | null;
  notes: string | null;
  status: "idea" | "shooting" | "live" | "tested";
  created_at: string;
}

const CATEGORIES: { key: OptionCategory; label: string; color: string }[] = [
  { key: "offer", label: "Offer", color: "#0369a1" },
  { key: "angle", label: "Angle", color: "#7c3aed" },
  { key: "hook", label: "Hook", color: "#b45309" },
  { key: "style", label: "Style", color: "#15803d" },
];

const STATUS_STYLE: Record<Combo["status"], { color: string; bg: string; label: string }> = {
  idea: { color: "#64748b", bg: "#f8fafc", label: "IDEA" },
  shooting: { color: "#b45309", bg: "#fffbeb", label: "SHOOTING" },
  live: { color: "#0369a1", bg: "#f0f9ff", label: "LIVE" },
  tested: { color: "#16a34a", bg: "#f0fdf4", label: "TESTED" },
};

function AddOptionRow({ onAdd }: { onAdd: (label: string, subtext: string) => void }) {
  const [label, setLabel] = useState("");
  const [subtext, setSubtext] = useState("");
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: `1px dashed ${L.border}`, padding: "6px 10px", fontSize: 11.5, fontWeight: 700, color: L.muted, cursor: "pointer", width: "100%", justifyContent: "center" }}
      >
        <Plus style={{ width: 11, height: 11 }} /> Add
      </button>
    );
  }
  return (
    <div style={{ border: `1px solid ${L.border}`, padding: 8, display: "flex", flexDirection: "column", gap: 6 }}>
      <input autoFocus value={label} onChange={e => setLabel(e.target.value)} placeholder="Label" style={{ padding: 6, fontSize: 12, border: `1px solid ${L.border}`, fontFamily: "inherit" }} />
      <input value={subtext} onChange={e => setSubtext(e.target.value)} placeholder="Why it works (optional)" style={{ padding: 6, fontSize: 11.5, border: `1px solid ${L.border}`, fontFamily: "inherit" }} />
      <div style={{ display: "flex", gap: 6 }}>
        <button
          onClick={() => { if (label.trim()) { onAdd(label.trim(), subtext.trim()); setLabel(""); setSubtext(""); setOpen(false); } }}
          style={{ flex: 1, background: "var(--accent)", color: "#fff", border: "none", padding: "6px 10px", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}
        >
          Save
        </button>
        <button onClick={() => { setOpen(false); setLabel(""); setSubtext(""); }} style={{ background: "none", border: `1px solid ${L.border}`, padding: "6px 10px", fontSize: 11.5, color: L.muted, cursor: "pointer" }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function CreativeBuilder({ clientId }: { clientId: string }) {
  const [options, setOptions] = useState<Option[] | null>(null);
  const [combos, setCombos] = useState<Combo[] | null>(null);
  const [error, setError] = useState("");

  const [slots, setSlots] = useState<Record<OptionCategory, string | null>>({ offer: null, angle: null, hook: null, style: null });
  const [service, setService] = useState("");
  const [customerReason, setCustomerReason] = useState("");
  const [hypothesis, setHypothesis] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState<OptionCategory | null>(null);

  const loadOptions = useCallback(() => {
    fetch(`/api/meta-ads/creative-builder/options?clientId=${clientId}`)
      .then(r => r.json())
      .then(data => { if (data.error) { setError(data.error); return; } setOptions(data.options); })
      .catch(() => setError("Failed to load the option library."));
  }, [clientId]);

  const loadCombos = useCallback(() => {
    fetch(`/api/meta-ads/creative-builder/combos?clientId=${clientId}`)
      .then(r => r.json())
      .then(data => { if (data.error) { setError(data.error); return; } setCombos(data.combos); })
      .catch(() => setError("Failed to load saved combos."));
  }, [clientId]);

  useEffect(() => { setOptions(null); setCombos(null); setSlots({ offer: null, angle: null, hook: null, style: null }); loadOptions(); loadCombos(); }, [clientId, loadOptions, loadCombos]);

  function pick(category: OptionCategory, label: string) {
    setSlots(s => ({ ...s, [category]: label }));
  }

  function clearSlot(category: OptionCategory) {
    setSlots(s => ({ ...s, [category]: null }));
  }

  async function addOption(category: OptionCategory, label: string, subtext: string) {
    setError("");
    try {
      const res = await fetch("/api/meta-ads/creative-builder/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, category, label, subtext: subtext || null }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      loadOptions();
    } catch {
      setError("Failed to add option.");
    }
  }

  async function removeOption(id: string, category: OptionCategory, label: string) {
    setError("");
    try {
      await fetch(`/api/meta-ads/creative-builder/options?id=${id}`, { method: "DELETE" });
      if (slots[category] === label) clearSlot(category);
      loadOptions();
    } catch {
      setError("Failed to remove option.");
    }
  }

  const hasAnySlot = !!(slots.offer || slots.angle || slots.hook || slots.style);

  async function saveCombo() {
    if (!hasAnySlot) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/meta-ads/creative-builder/combos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, service: service || null, customerReason: customerReason || null, hypothesis: hypothesis || null, notes: notes || null, ...slots }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      setSlots({ offer: null, angle: null, hook: null, style: null });
      setService("");
      setCustomerReason("");
      setHypothesis("");
      setNotes("");
      loadCombos();
    } catch {
      setError("Failed to save this combo.");
    } finally {
      setSaving(false);
    }
  }

  async function setComboStatus(id: string, status: Combo["status"]) {
    try {
      await fetch("/api/meta-ads/creative-builder/combos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      loadCombos();
    } catch {
      setError("Failed to update status.");
    }
  }

  async function removeCombo(id: string) {
    try {
      await fetch(`/api/meta-ads/creative-builder/combos?id=${id}`, { method: "DELETE" });
      loadCombos();
    } catch {
      setError("Failed to delete combo.");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <p style={{ fontSize: 12.5, color: L.muted, margin: 0 }}>
        Drag a chip into its slot below (or just click it), mix and match, then save the combo — it&apos;s yours to take and actually build the creative from.
      </p>

      {error && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", padding: 12, fontSize: 12 }}>{error}</div>}

      {/* Option columns */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {CATEGORIES.map(cat => (
          <div key={cat.key} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: cat.color }}>{cat.label}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, minHeight: 40 }}>
              {options === null && <div style={{ fontSize: 12, color: L.dimmed }}>Loading…</div>}
              {options?.filter(o => o.category === cat.key).map(o => (
                <div
                  key={o.id}
                  draggable
                  onDragStart={e => e.dataTransfer.setData("text/plain", JSON.stringify({ category: cat.key, label: o.label }))}
                  onClick={() => pick(cat.key, o.label)}
                  title={o.subtext || undefined}
                  style={{
                    position: "relative", cursor: "grab", background: slots[cat.key] === o.label ? "#fafafa" : L.surface,
                    border: `1px solid ${slots[cat.key] === o.label ? cat.color : L.border}`, borderRadius: 6, padding: "8px 26px 8px 10px",
                  }}
                >
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: L.text, lineHeight: 1.4 }}>{o.label}</div>
                  {o.subtext && <div style={{ fontSize: 10.5, color: L.dimmed, marginTop: 2, lineHeight: 1.4 }}>{o.subtext}</div>}
                  <button
                    onClick={e => { e.stopPropagation(); removeOption(o.id, cat.key, o.label); }}
                    title="Remove this option"
                    style={{ position: "absolute", top: 6, right: 6, background: "none", border: "none", color: L.dimmed, cursor: "pointer", padding: 2, display: "flex" }}
                  >
                    <X style={{ width: 11, height: 11 }} />
                  </button>
                </div>
              ))}
              <AddOptionRow onAdd={(label, subtext) => addOption(cat.key, label, subtext)} />
            </div>
          </div>
        ))}
      </div>

      {/* Combo tray */}
      <div style={{ background: "#0f172a", borderRadius: 10, padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "#93c5fd" }}>Your Combo</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {CATEGORIES.map(cat => (
            <div
              key={cat.key}
              onDragOver={e => { e.preventDefault(); setDragOver(cat.key); }}
              onDragLeave={() => setDragOver(d => (d === cat.key ? null : d))}
              onDrop={e => {
                e.preventDefault();
                setDragOver(null);
                try {
                  const data = JSON.parse(e.dataTransfer.getData("text/plain"));
                  if (data.category === cat.key) pick(cat.key, data.label);
                } catch {}
              }}
              style={{
                minHeight: 64, borderRadius: 8, padding: 10, display: "flex", flexDirection: "column", justifyContent: "center", gap: 4,
                border: `2px dashed ${dragOver === cat.key ? cat.color : "rgba(255,255,255,0.2)"}`,
                background: slots[cat.key] ? "rgba(255,255,255,0.06)" : "transparent",
              }}
            >
              <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "#94a3b8" }}>{cat.label}</div>
              {slots[cat.key] ? (
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#fff", lineHeight: 1.4 }}>{slots[cat.key]}</span>
                  <button onClick={() => clearSlot(cat.key)} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: 0, flexShrink: 0 }}>
                    <X style={{ width: 12, height: 12 }} />
                  </button>
                </div>
              ) : (
                <span style={{ fontSize: 11.5, color: "#64748b" }}>drop or click a chip</span>
              )}
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <input
            value={service}
            onChange={e => setService(e.target.value)}
            placeholder="Service (e.g. Window Cleaning)"
            style={{ padding: "8px 10px", fontSize: 12.5, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.06)", color: "#fff", fontFamily: "inherit", borderRadius: 6 }}
          />
          <input
            value={customerReason}
            onChange={e => setCustomerReason(e.target.value)}
            placeholder="Customer reason — e.g. they can't easily reach some windows"
            style={{ padding: "8px 10px", fontSize: 12.5, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.06)", color: "#fff", fontFamily: "inherit", borderRadius: 6 }}
          />
          <input
            value={hypothesis}
            onChange={e => setHypothesis(e.target.value)}
            placeholder="Hypothesis — e.g. they don't want to risk/hassle themselves"
            style={{ padding: "8px 10px", fontSize: 12.5, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.06)", color: "#fff", fontFamily: "inherit", borderRadius: 6 }}
          />
          <input
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Notes (optional)"
            style={{ padding: "8px 10px", fontSize: 12.5, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.06)", color: "#fff", fontFamily: "inherit", borderRadius: 6 }}
          />
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={saveCombo}
            disabled={!hasAnySlot || saving}
            style={{ display: "flex", alignItems: "center", gap: 6, background: hasAnySlot ? "var(--accent)" : "rgba(255,255,255,0.1)", color: "#fff", border: "none", padding: "9px 16px", fontSize: 12.5, fontWeight: 700, cursor: hasAnySlot && !saving ? "pointer" : "default", borderRadius: 6 }}
          >
            <Save style={{ width: 13, height: 13 }} />
            {saving ? "Saving…" : "Save this combo"}
          </button>
          {hasAnySlot && (
            <button
              onClick={() => setSlots({ offer: null, angle: null, hook: null, style: null })}
              style={{ background: "none", border: "1px solid rgba(255,255,255,0.2)", color: "#94a3b8", padding: "9px 14px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", borderRadius: 6 }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Saved combos */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: L.muted, marginBottom: 10 }}>Saved combos to build</div>
        {combos === null ? (
          <div style={{ padding: 20, textAlign: "center", color: L.dimmed, fontSize: 13 }}>Loading…</div>
        ) : combos.length === 0 ? (
          <div style={{ padding: 20, textAlign: "center", color: L.dimmed, fontSize: 13, background: L.surface, border: `1px solid ${L.border}` }}>
            Nothing saved yet — build a combo above and save it.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {combos.map((c, i) => {
              const status = STATUS_STYLE[c.status];
              const adNumber = combos.length - i;
              const fields: [string, string | null][] = [
                ["Offer", c.offer],
                ["Customer reason", c.customer_reason],
                ["Hypothesis", c.hypothesis],
                ["Angle", c.angle],
                ["Creative style", c.style],
                ["Hook", c.hook],
              ];
              return (
                <div key={c.id} style={{ background: L.surface, border: `1px solid ${L.border}`, padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: "var(--accent)" }}>Ad {adNumber}</span>
                      {c.service && <span style={{ fontSize: 12, color: L.muted }}>— {c.service}</span>}
                      <select
                        value={c.status}
                        onChange={e => setComboStatus(c.id, e.target.value as Combo["status"])}
                        style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.04em", color: status.color, background: status.bg, border: "none", padding: "2px 6px", borderRadius: 3, textTransform: "uppercase", cursor: "pointer" }}
                      >
                        {(Object.keys(STATUS_STYLE) as Combo["status"][]).map(s => <option key={s} value={s}>{STATUS_STYLE[s].label}</option>)}
                      </select>
                    </div>
                    <button onClick={() => removeCombo(c.id)} style={{ background: "none", border: "none", color: L.dimmed, cursor: "pointer", padding: 2, display: "flex" }}>
                      <Trash2 style={{ width: 13, height: 13 }} />
                    </button>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 12.5, color: L.text }}>
                    {fields.map(([label, value]) => value && (
                      <div key={label}><span style={{ color: L.muted }}>{label}: </span>{value}</div>
                    ))}
                  </div>
                  {c.notes && <div style={{ fontSize: 12, color: L.muted, fontStyle: "italic" }}>{c.notes}</div>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
