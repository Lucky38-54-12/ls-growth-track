"use client";
import { useState, ReactNode } from "react";

const L = { border: "#e2e8f0", text: "#0f172a", muted: "#64748b" };

export interface Tab {
  id: string;
  label: string;
  badge?: number;
  content: ReactNode;
}

export default function SectionTabs({ tabs, defaultTab }: { tabs: Tab[]; defaultTab?: string }) {
  const [active, setActive] = useState(defaultTab || tabs[0]?.id);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${L.border}`, overflowX: "auto" }}>
        {tabs.map((tab) => {
          const isActive = tab.id === active;
          return (
            <button
              key={tab.id}
              onClick={() => setActive(tab.id)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "10px 16px",
                fontSize: 13, fontWeight: 700,
                color: isActive ? "var(--accent)" : L.muted,
                background: "none", border: "none",
                borderBottom: `2px solid ${isActive ? "var(--accent)" : "transparent"}`,
                cursor: "pointer", whiteSpace: "nowrap",
                marginBottom: -1,
              }}
            >
              {tab.label}
              {typeof tab.badge === "number" && tab.badge > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 800, padding: "1px 6px",
                  background: isActive ? "var(--accent)" : "#f1f5f9",
                  color: isActive ? "#fff" : L.text,
                }}>
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {tabs.map((tab) => (
        <div key={tab.id} style={{ display: tab.id === active ? "block" : "none" }}>
          {tab.content}
        </div>
      ))}
    </div>
  );
}
