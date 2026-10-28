"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PORTAL as L, portalCardStyle } from "@/lib/portalTheme";

interface Lead {
  id: string;
  contact_email: string | null;
  created_at: string;
  lq_conversations: { extracted_fields: Record<string, unknown> } | null;
}

type Done = Record<string, "won" | "lost" | "still">;

export default function CheckinPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [clientName, setClientName] = useState<string | null>(null);
  const [isCleaning, setIsCleaning] = useState(false);
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done>({});
  const [openWonFor, setOpenWonFor] = useState<string | null>(null);
  const [wonValue, setWonValue] = useState("");

  useEffect(() => {
    fetch(`/api/portal/checkin/${token}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error || "Couldn't load this link");
        return r.json();
      })
      .then((data) => {
        setClientName(data.client?.name || null);
        setIsCleaning(String(data.client?.trade || "").toLowerCase().includes("clean"));
        setLeads(data.leads || []);
      })
      .catch((e) => setError(e.message));
  }, [token]);

  async function submit(leadId: string, outcome: "won" | "lost" | "still", value?: number) {
    setDone((d) => ({ ...d, [leadId]: outcome }));
    setOpenWonFor(null);
    setWonValue("");
    try {
      await fetch(`/api/portal/checkin/${token}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, outcome, value }),
      });
    } catch {
      // keep the optimistic tap — a failed write just means it'll show up again next week
    }
  }

  if (error) {
    return (
      <div style={{ maxWidth: 480, margin: "80px auto", padding: 24, textAlign: "center", color: L.muted }}>
        This link's expired or isn't valid. Ping Lucky and he'll send a fresh one.
      </div>
    );
  }

  if (!leads) {
    return <div style={{ maxWidth: 480, margin: "80px auto", padding: 24, textAlign: "center", color: L.muted }}>Loading…</div>;
  }

  const allDone = leads.length > 0 && leads.every((l) => done[l.id]);

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "32px 16px 80px" }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: L.text, margin: "0 0 4px" }}>
        {clientName ? `Hey ${clientName}` : "Quick check-in"}
      </h1>
      <p style={{ fontSize: 14, color: L.muted, margin: "0 0 24px" }}>
        Tap through — {isCleaning ? "did these sign up?" : "did these turn into jobs?"} Takes under a minute.
      </p>

      {leads.length === 0 && (
        <div style={{ ...portalCardStyle, padding: 20, textAlign: "center", color: L.muted }}>
          Nothing waiting on an update right now.
        </div>
      )}

      {allDone && leads.length > 0 && (
        <div style={{ ...portalCardStyle, padding: 20, textAlign: "center", color: "#15803d", fontWeight: 700, marginBottom: 16 }}>
          All done — thanks!
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {leads.map((lead) => {
          const fields = lead.lq_conversations?.extracted_fields || {};
          const name = String(fields.name || lead.contact_email || "Unknown");
          const jobType = String(fields.job_type || "");
          const status = done[lead.id];

          return (
            <div key={lead.id} style={{ ...portalCardStyle, padding: 16, opacity: status ? 0.55 : 1 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: L.text }}>{name}</div>
              {jobType && <div style={{ fontSize: 13, color: L.muted, marginTop: 2 }}>{jobType}</div>}

              {status ? (
                <div style={{ fontSize: 13, fontWeight: 700, marginTop: 10, color: status === "won" ? "#15803d" : status === "lost" ? "#b91c1c" : L.muted }}>
                  {status === "won"
                    ? isCleaning ? "Marked as signed up" : "Marked as won"
                    : status === "lost"
                    ? isCleaning ? "Marked as didn't convert" : "Marked as lost"
                    : isCleaning ? "Still deciding — noted" : "Still talking — noted"}
                </div>
              ) : openWonFor === lead.id ? (
                <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
                  <input
                    type="number"
                    placeholder="Rough ballpark price"
                    value={wonValue}
                    onChange={(e) => setWonValue(e.target.value)}
                    style={{ flex: 1, padding: "8px 10px", border: `1px solid ${L.border}`, borderRadius: 6, fontSize: 13 }}
                  />
                  <button
                    onClick={() => submit(lead.id, "won", wonValue ? Number(wonValue) : undefined)}
                    style={{ padding: "8px 14px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 6, fontWeight: 700, fontSize: 13, cursor: "pointer" }}
                  >
                    Confirm
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  {isCleaning ? (
                    <button onClick={() => submit(lead.id, "won")} style={btnStyle("#16a34a", "#fff")}>Signed up</button>
                  ) : (
                    <button onClick={() => setOpenWonFor(lead.id)} style={btnStyle("#16a34a", "#fff")}>Won</button>
                  )}
                  <button onClick={() => submit(lead.id, "lost")} style={btnStyle("#fef2f2", "#b91c1c")}>{isCleaning ? "Didn't convert" : "Lost"}</button>
                  <button onClick={() => submit(lead.id, "still")} style={btnStyle("#f1f5f9", "#475569")}>{isCleaning ? "Still deciding" : "Still talking"}</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function btnStyle(bg: string, color: string): React.CSSProperties {
  return { padding: "8px 14px", background: bg, color, border: "none", borderRadius: 6, fontWeight: 700, fontSize: 13, cursor: "pointer" };
}
