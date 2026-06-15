"use client";
import { useRouter } from "next/navigation";
import { sourceLabel } from "@/lib/types";

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b" };

export default function SourceFilter({
  sources,
  activeSource,
  trade,
}: {
  sources: string[];
  activeSource: string;
  trade: string;
}) {
  const router = useRouter();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams();
    if (trade !== "all") params.set("trade", trade);
    if (e.target.value !== "all") params.set("source", e.target.value);
    const query = params.toString();
    router.push(`/dashboard${query ? `?${query}` : ""}`);
  }

  return (
    <select
      value={activeSource}
      onChange={handleChange}
      style={{
        padding: "5px 10px",
        fontSize: 11,
        fontWeight: 600,
        color: L.muted,
        background: L.surface,
        border: `1px solid ${L.border}`,
        borderRadius: 0,
        cursor: "pointer",
      }}
    >
      <option value="all">All Sources</option>
      {sources.map((s) => (
        <option key={s} value={s}>{sourceLabel(s)}</option>
      ))}
    </select>
  );
}
