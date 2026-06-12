"use client";
import { useSearchParams } from "next/navigation";

export default function FlashMessage() {
  const params = useSearchParams();
  const flash = params.get("flash");
  if (!flash) return null;
  return (
    <div style={{
      background: "#fef9c3", border: "1px solid #fde68a", color: "#713f12",
      padding: "10px 16px", borderRadius: 0, marginBottom: 18, fontSize: 14,
    }}>
      {flash}
    </div>
  );
}
