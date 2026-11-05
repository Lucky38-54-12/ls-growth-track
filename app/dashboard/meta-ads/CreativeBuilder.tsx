"use client";
import { useEffect, useState, useCallback } from "react";
import { Plus, X, Trash2, Save, Sparkles, Check } from "lucide-react";

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
  script: string | null;
  script_status: "none" | "drafted" | "approved";
  design_brief: { headline: Record<string, string>; primaryText: string; cta: string } | null;
  design_preview_url: string | null;
  design_preview_status: "none" | "queued" | "drafted" | "approved";
  video_status: "none" | "queued" | "rendering" | "ready";
  video_url: string | null;
  launch_status: "none" | "pending" | "launched";
  meta_ad_id: string | null;
  created_at: string;
}

interface AdSet {
  id: string;
  name: string;
  status: string;
  campaignName: string;
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

  const [draftingId, setDraftingId] = useState<string | null>(null);
  const [editingScripts, setEditingScripts] = useState<Record<string, string>>({});

  async function draftScript(id: string) {
    setDraftingId(id);
    setError("");
    try {
      const res = await fetch("/api/meta-ads/creative-builder/combos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "draftScript" }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      loadCombos();
    } catch {
      setError("Failed to draft a script for this combo.");
    } finally {
      setDraftingId(null);
    }
  }

  async function saveScriptEdit(id: string) {
    const script = editingScripts[id];
    if (script === undefined) return;
    try {
      await fetch("/api/meta-ads/creative-builder/combos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, script }),
      });
      setEditingScripts((s) => { const n = { ...s }; delete n[id]; return n; });
      loadCombos();
    } catch {
      setError("Failed to save script edit.");
    }
  }

  async function approveScript(id: string) {
    try {
      await fetch("/api/meta-ads/creative-builder/combos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, scriptStatus: "approved" }),
      });
      loadCombos();
    } catch {
      setError("Failed to approve script.");
    }
  }

  const [briefingId, setBriefingId] = useState<string | null>(null);
  const [queueingId, setQueueingId] = useState<string | null>(null);
  const [adSets, setAdSets] = useState<AdSet[] | null>(null);
  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [launchAdSet, setLaunchAdSet] = useState<Record<string, string>>({});

  async function draftDesignBrief(id: string) {
    setBriefingId(id);
    setError("");
    try {
      const res = await fetch("/api/meta-ads/creative-builder/combos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "draftDesignBrief" }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      loadCombos();
    } catch {
      setError("Failed to draft a design brief.");
    } finally {
      setBriefingId(null);
    }
  }

  async function queueRender(id: string) {
    setQueueingId(id);
    setError("");
    try {
      const res = await fetch("/api/meta-ads/creative-builder/combos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "queueRender" }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      loadCombos();
    } catch {
      setError("Failed to queue this combo for render.");
    } finally {
      setQueueingId(null);
    }
  }

  const [previewQueueingId, setPreviewQueueingId] = useState<string | null>(null);
  const [previewApprovingId, setPreviewApprovingId] = useState<string | null>(null);

  async function queueDesignPreview(id: string) {
    setPreviewQueueingId(id);
    setError("");
    try {
      const res = await fetch("/api/meta-ads/creative-builder/combos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "queueDesignPreview" }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      loadCombos();
    } catch {
      setError("Failed to queue a design preview.");
    } finally {
      setPreviewQueueingId(null);
    }
  }

  async function setDesignPreviewStatus(id: string, designPreviewStatus: "drafted" | "approved") {
    setPreviewApprovingId(id);
    setError("");
    try {
      const res = await fetch("/api/meta-ads/creative-builder/combos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, designPreviewStatus }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      loadCombos();
    } catch {
      setError("Failed to update the design preview status.");
    } finally {
      setPreviewApprovingId(null);
    }
  }

  function loadAdSets() {
    if (adSets !== null) return;
    fetch(`/api/meta-ads/ad-sets?clientId=${clientId}`)
      .then((r) => r.json())
      .then((data) => { if (data.error) { setError(data.error); return; } setAdSets(data.adSets); })
      .catch(() => setError("Failed to load ad sets."));
  }

  async function launchCombo(id: string) {
    const adSetId = launchAdSet[id];
    if (!adSetId) { setError("Pick an ad set to launch into first."); return; }
    setLaunchingId(id);
    setError("");
    try {
      const res = await fetch("/api/meta-ads/creative-builder/combos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "launch", adSetId }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      loadCombos();
    } catch {
      setError("Failed to launch this combo to Meta.");
    } finally {
      setLaunchingId(null);
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

                  <div style={{ borderTop: `1px solid ${L.border}`, paddingTop: 10, marginTop: 2 }}>
                    {!c.script ? (
                      <button
                        onClick={() => draftScript(c.id)}
                        disabled={draftingId === c.id}
                        style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: `1px solid ${L.border}`, padding: "6px 10px", fontSize: 11.5, fontWeight: 700, color: "var(--accent)", cursor: draftingId === c.id ? "default" : "pointer" }}
                      >
                        <Sparkles style={{ width: 12, height: 12 }} />
                        {draftingId === c.id ? "Drafting script…" : "Draft script"}
                      </button>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: L.muted }}>
                            VO script {c.script_status === "approved" ? "— approved" : "— needs your review"}
                          </span>
                          {c.script_status !== "approved" && (
                            <button
                              onClick={() => approveScript(c.id)}
                              style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", color: "#16a34a", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
                            >
                              <Check style={{ width: 12, height: 12 }} /> Approve
                            </button>
                          )}
                        </div>
                        <textarea
                          value={editingScripts[c.id] ?? c.script}
                          onChange={(e) => setEditingScripts((s) => ({ ...s, [c.id]: e.target.value }))}
                          onBlur={() => { if (editingScripts[c.id] !== undefined && editingScripts[c.id] !== c.script) saveScriptEdit(c.id); }}
                          rows={5}
                          style={{ width: "100%", padding: 8, fontSize: 12.5, fontFamily: "inherit", border: `1px solid ${L.border}`, borderRadius: 6, resize: "vertical", color: L.text, background: c.script_status === "approved" ? "#f0fdf4" : L.surface }}
                        />
                        <button
                          onClick={() => draftScript(c.id)}
                          disabled={draftingId === c.id}
                          style={{ alignSelf: "flex-start", background: "none", border: "none", color: L.muted, fontSize: 11, cursor: draftingId === c.id ? "default" : "pointer", padding: 0 }}
                        >
                          {draftingId === c.id ? "Redrafting…" : "Redraft from scratch"}
                        </button>
                      </div>
                    )}
                  </div>

                  {c.script_status === "approved" && (
                    <div style={{ borderTop: `1px solid ${L.border}`, paddingTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
                      {/* Stage 04 — design brief */}
                      {!c.design_brief ? (
                        <button
                          onClick={() => draftDesignBrief(c.id)}
                          disabled={briefingId === c.id}
                          style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: `1px solid ${L.border}`, padding: "6px 10px", fontSize: 11.5, fontWeight: 700, color: "#7c3aed", cursor: briefingId === c.id ? "default" : "pointer", alignSelf: "flex-start" }}
                        >
                          <Sparkles style={{ width: 12, height: 12 }} />
                          {briefingId === c.id ? "Drafting design brief…" : "Draft design brief (statics)"}
                        </button>
                      ) : (
                        <div style={{ fontSize: 12, color: L.text, background: "#faf5ff", border: "1px solid #e9d5ff", borderRadius: 6, padding: 10, display: "flex", flexDirection: "column", gap: 4 }}>
                          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "#7c3aed" }}>Design brief — hand to Canva/designer</div>
                          <div><span style={{ color: L.muted }}>Headline (1:1): </span>{c.design_brief.headline["1x1"]}</div>
                          <div><span style={{ color: L.muted }}>Headline (4:5): </span>{c.design_brief.headline["4x5"]}</div>
                          <div><span style={{ color: L.muted }}>Headline (9:16): </span>{c.design_brief.headline["9x16"]}</div>
                          <div><span style={{ color: L.muted }}>Primary text: </span>{c.design_brief.primaryText}</div>
                          <div><span style={{ color: L.muted }}>CTA: </span>{c.design_brief.cta}</div>
                        </div>
                      )}

                      {/* Stage 04.5 — static-visual preview, built with the claude.ai Design
                          canvas (agent-processed, same reason as the render queue below) */}
                      {c.design_brief && c.design_preview_status === "none" && (
                        <button
                          onClick={() => queueDesignPreview(c.id)}
                          disabled={previewQueueingId === c.id}
                          style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: `1px solid ${L.border}`, padding: "6px 10px", fontSize: 11.5, fontWeight: 700, color: "#7c3aed", cursor: previewQueueingId === c.id ? "default" : "pointer", alignSelf: "flex-start" }}
                        >
                          <Sparkles style={{ width: 12, height: 12 }} />
                          {previewQueueingId === c.id ? "Queuing…" : "Draft design preview"}
                        </button>
                      )}
                      {c.design_preview_status === "queued" && (
                        <div style={{ fontSize: 11.5, color: "#b45309", fontWeight: 700 }}>Queued for design preview — ask the agent to work the design preview queue.</div>
                      )}
                      {(c.design_preview_status === "drafted" || c.design_preview_status === "approved") && c.design_preview_url && (
                        <div style={{ fontSize: 12, color: L.text, background: "#faf5ff", border: "1px solid #e9d5ff", borderRadius: 6, padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "#7c3aed" }}>
                            Design preview {c.design_preview_status === "approved" ? "— approved" : "— needs your review"}
                          </div>
                          <a href={c.design_preview_url} target="_blank" rel="noreferrer" style={{ color: "#0369a1", fontSize: 12 }}>Open preview</a>
                          {c.design_preview_status === "drafted" && (
                            <div style={{ display: "flex", gap: 6 }}>
                              <button
                                onClick={() => setDesignPreviewStatus(c.id, "approved")}
                                disabled={previewApprovingId === c.id}
                                style={{ display: "flex", alignItems: "center", gap: 4, background: "#16a34a", color: "#fff", border: "none", padding: "6px 10px", fontSize: 11.5, fontWeight: 700, cursor: previewApprovingId === c.id ? "default" : "pointer", borderRadius: 4 }}
                              >
                                <Check style={{ width: 12, height: 12 }} />
                                Approve preview
                              </button>
                              <button
                                onClick={() => queueDesignPreview(c.id)}
                                disabled={previewQueueingId === c.id}
                                style={{ background: "none", border: `1px solid ${L.border}`, padding: "6px 10px", fontSize: 11.5, fontWeight: 700, color: L.muted, cursor: previewQueueingId === c.id ? "default" : "pointer" }}
                              >
                                Redo preview
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Stage 05 — render queue (agent-processed, HyperFrames can't run in this app) */}
                      {c.design_preview_status === "approved" && c.video_status === "none" && (
                        <button
                          onClick={() => queueRender(c.id)}
                          disabled={queueingId === c.id}
                          style={{ background: "none", border: `1px solid ${L.border}`, padding: "6px 10px", fontSize: 11.5, fontWeight: 700, color: "#0369a1", cursor: queueingId === c.id ? "default" : "pointer", alignSelf: "flex-start" }}
                        >
                          {queueingId === c.id ? "Queuing…" : "Send to render queue"}
                        </button>
                      )}
                      {c.video_status === "queued" && (
                        <div style={{ fontSize: 11.5, color: "#b45309", fontWeight: 700 }}>Queued for render — ask the agent to work the render queue.</div>
                      )}
                      {c.video_status === "rendering" && (
                        <div style={{ fontSize: 11.5, color: "#b45309", fontWeight: 700 }}>Rendering…</div>
                      )}
                      {c.video_status === "ready" && c.video_url && (
                        <div style={{ fontSize: 11.5, color: "#16a34a", fontWeight: 700 }}>
                          Video ready — <a href={c.video_url} target="_blank" rel="noreferrer" style={{ color: "inherit" }}>view</a>
                        </div>
                      )}

                      {/* Stage 06 — launch (always PAUSED, never auto-spends) */}
                      {c.video_status === "ready" && c.launch_status === "none" && (
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }} onMouseEnter={loadAdSets}>
                          <select
                            value={launchAdSet[c.id] || ""}
                            onChange={(e) => setLaunchAdSet((s) => ({ ...s, [c.id]: e.target.value }))}
                            onFocus={loadAdSets}
                            style={{ fontSize: 11.5, padding: "6px 8px", border: `1px solid ${L.border}`, fontFamily: "inherit" }}
                          >
                            <option value="">{adSets === null ? "Loading ad sets…" : "Pick an ad set…"}</option>
                            {adSets?.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.campaignName})</option>)}
                          </select>
                          <button
                            onClick={() => launchCombo(c.id)}
                            disabled={launchingId === c.id || !launchAdSet[c.id]}
                            style={{ background: "#0f172a", color: "#fff", border: "none", padding: "7px 12px", fontSize: 11.5, fontWeight: 700, cursor: launchingId === c.id ? "default" : "pointer", borderRadius: 4 }}
                          >
                            {launchingId === c.id ? "Pushing to Meta…" : "Push to Meta (paused)"}
                          </button>
                        </div>
                      )}
                      {c.launch_status === "launched" && c.meta_ad_id && (
                        <div style={{ fontSize: 11.5, color: "#0369a1", fontWeight: 700 }}>
                          Launched as a PAUSED ad (id {c.meta_ad_id}) — review and switch it live in Ads Manager.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
