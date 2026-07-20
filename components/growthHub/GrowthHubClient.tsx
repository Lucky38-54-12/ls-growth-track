"use client";
import { useState } from "react";
import { ContentIdea, Prospect } from "@/lib/types";
import ContentCalendarTab from "./ContentCalendarTab";
import ProspectsTab from "./ProspectsTab";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b" };

type TabKey = "calendar" | "prospects";

const TABS: { key: TabKey; label: string }[] = [
  { key: "calendar", label: "Content Calendar" },
  { key: "prospects", label: "Prospects" },
];

export default function GrowthHubClient({
  initialIdeas,
  initialProspects,
}: {
  initialIdeas: ContentIdea[];
  initialProspects: Prospect[];
}) {
  const [tab, setTab] = useState<TabKey>("calendar");

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {TABS.map(t => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="pill-hover"
              style={{
                padding: "7px 16px", fontSize: 12.5, fontWeight: 700, cursor: "pointer",
                border: `1px solid ${active ? "var(--red)" : L.border}`,
                background: active ? "#fef2f2" : L.surface,
                color: active ? "var(--red)" : L.muted,
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "calendar" ? (
        <ContentCalendarTab initialIdeas={initialIdeas} />
      ) : (
        <ProspectsTab initialProspects={initialProspects} />
      )}
    </div>
  );
}
