"use client";
import { useState, useMemo } from "react";
import { Plus, Trash2, X, ExternalLink, Search } from "lucide-react";
import { Prospect } from "@/lib/types";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };

export default function ProspectsTab({ initialProspects }: { initialProspects: Prospect[] }) {
  const [prospects, setProspects] = useState(initialProspects);
  const [q, setQ] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [pasteMode, setPasteMode] = useState(false);

  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [industry, setIndustry] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [pasteText, setPasteText] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return prospects;
    return prospects.filter(p =>
      p.name.toLowerCase().includes(query) ||
      (p.company || "").toLowerCase().includes(query) ||
      (p.industry || "").toLowerCase().includes(query)
    );
  }, [prospects, q]);

  const connectedCount = prospects.filter(p => p.connected).length;

  function openAddForm() {
    setName(""); setCompany(""); setIndustry(""); setLinkedinUrl(""); setPasteText("");
    setPasteMode(false); setError(""); setFormOpen(true);
  }

  async function handleToggleConnected(p: Prospect) {
    setProspects(prev => prev.map(x => x.id === p.id ? { ...x, connected: !x.connected } : x));
    await fetch(`/api/growth-hub/prospects/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connected: !p.connected }),
    });
  }

  async function handleDelete(id: string) {
    setProspects(prev => prev.filter(p => p.id !== id));
    await fetch(`/api/growth-hub/prospects/${id}`, { method: "DELETE" });
  }

  // Parses pasted rows (tab or comma separated) copied straight out of
  // Apollo/a spreadsheet: name, company, industry, linkedin url — in that
  // column order, one prospect per line.
  function parsePastedRows(text: string) {
    return text
      .split("\n")
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => {
        const parts = line.includes("\t") ? line.split("\t") : line.split(",");
        const [n, c, ind, url] = parts.map(p => (p || "").trim());
        return { name: n, company: c || null, industry: ind || null, linkedin_url: url || null };
      })
      .filter(row => row.name);
  }

  async function handleAdd() {
    setError(""); setBusy(true);
    try {
      const body = pasteMode
        ? parsePastedRows(pasteText)
        : { name, company: company || null, industry: industry || null, linkedin_url: linkedinUrl || null };

      if (pasteMode && (body as unknown[]).length === 0) {
        throw new Error("Paste at least one row with a name");
      }
      if (!pasteMode && !name.trim()) {
        throw new Error("Name is required");
      }

      const res = await fetch("/api/growth-hub/prospects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add prospect(s)");
      const added = Array.isArray(data) ? data : [data];
      setProspects(prev => [...added, ...prev]);
      setFormOpen(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, height: 36, padding: "0 12px", border: `1px solid ${L.border}`, background: L.surface, flex: 1, minWidth: 220 }}>
          <Search style={{ width: 13, height: 13, color: L.dimmed }} />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search name, company, industry…"
            style={{ flex: 1, border: "none", outline: "none", fontSize: 13, color: L.text, fontFamily: "inherit", background: "transparent" }}
          />
        </div>
        <span style={{ fontSize: 12, color: L.muted, fontWeight: 600 }}>{prospects.length} total · {connectedCount} connected</span>
        <button onClick={openAddForm} className="pill-hover" style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", fontSize: 12.5, fontWeight: 700, color: "#fff", background: "var(--red)", border: "none", cursor: "pointer" }}>
          <Plus style={{ width: 13, height: 13 }} /> Add Prospect
        </button>
      </div>

      <div className="surface-card" style={{ overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${L.border}`, background: "#f8fafc" }}>
              {["Name", "Company", "Industry", "LinkedIn", "Connected", ""].map(h => (
                <th key={h} style={{ textAlign: "left", padding: "10px 14px", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: L.dimmed }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: 24, textAlign: "center", color: L.dimmed, fontSize: 12.5 }}>No prospects yet.</td></tr>
            ) : (
              filtered.map(p => (
                <tr key={p.id} className="row-hover" style={{ borderBottom: `1px solid ${L.border}` }}>
                  <td style={{ padding: "10px 14px", fontSize: 13, fontWeight: 700, color: L.text }}>{p.name}</td>
                  <td style={{ padding: "10px 14px", fontSize: 13, color: L.muted }}>{p.company || "—"}</td>
                  <td style={{ padding: "10px 14px", fontSize: 13, color: L.muted }}>{p.industry || "—"}</td>
                  <td style={{ padding: "10px 14px" }}>
                    {p.linkedin_url ? (
                      <a href={p.linkedin_url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", color: "var(--blue)" }}>
                        <ExternalLink style={{ width: 15, height: 15 }} />
                      </a>
                    ) : (
                      <span style={{ color: L.dimmed }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    <input type="checkbox" checked={p.connected} onChange={() => handleToggleConnected(p)} style={{ width: 16, height: 16, cursor: "pointer" }} />
                  </td>
                  <td style={{ padding: "10px 14px", textAlign: "right" }}>
                    <button onClick={() => handleDelete(p.id)} style={{ background: "none", border: "none", cursor: "pointer", color: L.dimmed, display: "inline-flex", padding: 4 }}>
                      <Trash2 style={{ width: 13, height: 13 }} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {formOpen && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setFormOpen(false)}
        >
          <div
            style={{ width: "100%", maxWidth: 460, background: "#fff", margin: "0 16px", border: `1px solid ${L.border}`, borderRadius: 14, overflow: "hidden", boxShadow: "0 20px 48px rgba(15,23,42,0.22)" }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: `1px solid ${L.border}` }}>
              <p style={{ fontSize: 13, fontWeight: 800, color: L.text }}>Add prospect{pasteMode ? "s" : ""}</p>
              <button onClick={() => setFormOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: L.dimmed, display: "flex", padding: 4 }}>
                <X style={{ width: 14, height: 14 }} />
              </button>
            </div>

            <div style={{ padding: "10px 18px 0", display: "flex", gap: 6 }}>
              <button onClick={() => setPasteMode(false)} className="pill-hover" style={{ padding: "5px 12px", fontSize: 11.5, fontWeight: 700, border: `1px solid ${!pasteMode ? "var(--red)" : L.border}`, background: !pasteMode ? "#fef2f2" : L.surface, color: !pasteMode ? "var(--red)" : L.muted, cursor: "pointer" }}>Single</button>
              <button onClick={() => setPasteMode(true)} className="pill-hover" style={{ padding: "5px 12px", fontSize: 11.5, fontWeight: 700, border: `1px solid ${pasteMode ? "var(--red)" : L.border}`, background: pasteMode ? "#fef2f2" : L.surface, color: pasteMode ? "var(--red)" : L.muted, cursor: "pointer" }}>Bulk paste</button>
            </div>

            <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
              {pasteMode ? (
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: L.muted, display: "block", marginBottom: 5 }}>
                    Paste rows — Name, Company, Industry, LinkedIn URL
                  </label>
                  <textarea
                    value={pasteText}
                    onChange={e => setPasteText(e.target.value)}
                    rows={8}
                    placeholder={"John Smith\tAcme Electrical\tElectrician\thttps://linkedin.com/in/johnsmith"}
                    style={{ width: "100%", padding: "8px 10px", border: `1px solid ${L.border}`, fontSize: 12.5, color: L.text, fontFamily: "inherit", outline: "none", boxSizing: "border-box", resize: "vertical" }}
                  />
                  <p style={{ fontSize: 11, color: L.dimmed, marginTop: 4 }}>One prospect per line, pasted straight from a spreadsheet or Apollo export.</p>
                </div>
              ) : (
                <>
                  <div>
                    <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: L.muted, display: "block", marginBottom: 5 }}>Name</label>
                    <input value={name} onChange={e => setName(e.target.value)} style={{ width: "100%", padding: "8px 10px", border: `1px solid ${L.border}`, fontSize: 13, color: L.text, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: L.muted, display: "block", marginBottom: 5 }}>Company</label>
                    <input value={company} onChange={e => setCompany(e.target.value)} style={{ width: "100%", padding: "8px 10px", border: `1px solid ${L.border}`, fontSize: 13, color: L.text, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: L.muted, display: "block", marginBottom: 5 }}>Industry</label>
                    <input value={industry} onChange={e => setIndustry(e.target.value)} style={{ width: "100%", padding: "8px 10px", border: `1px solid ${L.border}`, fontSize: 13, color: L.text, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: L.muted, display: "block", marginBottom: 5 }}>LinkedIn URL</label>
                    <input value={linkedinUrl} onChange={e => setLinkedinUrl(e.target.value)} style={{ width: "100%", padding: "8px 10px", border: `1px solid ${L.border}`, fontSize: 13, color: L.text, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
                  </div>
                </>
              )}
              {error && <p style={{ fontSize: 12, color: "var(--red)", background: "#fef2f2", padding: "8px 10px" }}>{error}</p>}
            </div>

            <div style={{ padding: "12px 18px", borderTop: `1px solid ${L.border}`, display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => setFormOpen(false)} style={{ padding: "8px 16px", fontSize: 12, fontWeight: 600, color: L.muted, background: "#fff", border: `1px solid ${L.border}`, cursor: "pointer" }}>Cancel</button>
              <button onClick={handleAdd} disabled={busy} style={{ padding: "8px 18px", fontSize: 12, fontWeight: 700, background: "var(--red)", color: "#fff", border: "none", cursor: busy ? "wait" : "pointer", opacity: busy ? 0.6 : 1 }}>
                {busy ? "Saving..." : "Add"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
