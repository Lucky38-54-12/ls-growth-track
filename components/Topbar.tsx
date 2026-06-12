import Link from "next/link";

export default function Topbar({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ background: "#fff", borderBottom: "1px solid #e2e8f0", display: "flex", height: 68 }}>
      <div style={{ width: 4, background: "var(--red)", flexShrink: 0 }} />
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 28px", gap: 20, minWidth: 0 }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: 17, fontWeight: 900, letterSpacing: "0.04em" }}>{title}</h1>
          {subtitle && <p style={{ color: "#64748b", fontSize: 12, marginTop: 1 }}>{subtitle}</p>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 18, flexShrink: 0 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 800, color: "var(--green)" }}>
            <span style={{ width: 7, height: 7, background: "var(--green)", display: "inline-block" }} />
            LIVE
          </span>
          <Link href="/dashboard/new" className="btn-lift" style={{ padding: "9px 18px", background: "var(--red)", color: "#fff", fontSize: 13, fontWeight: 700, textDecoration: "none" }}>
            + Add Lead
          </Link>
          <div style={{ width: 34, height: 34, background: "#0f172a", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 12, flexShrink: 0 }}>
            LS
          </div>
        </div>
      </div>
    </div>
  );
}
