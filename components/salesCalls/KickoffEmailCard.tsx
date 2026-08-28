"use client";
import { useState } from "react";
import { OnboardingClient } from "@/lib/types";
import KickoffEmailPanel from "./KickoffEmailPanel";

export default function KickoffEmailCard({ client: initialClient }: { client: OnboardingClient }) {
  const [client, setClient] = useState(initialClient);
  if (client.kickoff_email_status === "none") return null;

  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", padding: "16px 18px", marginBottom: 20 }}>
      <KickoffEmailPanel client={client} onUpdated={setClient} />
    </div>
  );
}
