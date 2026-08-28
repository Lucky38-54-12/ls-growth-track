import type { CSSProperties } from "react";

// Shared look for the client-facing portal (app/portal/(dashboard)/*) —
// rounded, soft-shadow cards instead of the flat 1px-border style used
// elsewhere in the app, so every portal page reads as one consistent design
// rather than each page inventing its own card treatment.
export const PORTAL = {
  surface: "#ffffff",
  border: "#e2e8f0",
  text: "#0f172a",
  muted: "#64748b",
  dimmed: "#94a3b8",
  cardRadius: 14,
  cardShadow: "0 1px 2px rgba(15, 23, 42, 0.04), 0 4px 16px rgba(15, 23, 42, 0.05)",
};

export const portalCardStyle: CSSProperties = {
  background: PORTAL.surface,
  border: `1px solid ${PORTAL.border}`,
  borderRadius: PORTAL.cardRadius,
  boxShadow: PORTAL.cardShadow,
};

export function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
