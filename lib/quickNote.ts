// Shared by the Cold Call page's "Cold call notes" box and the Notes sticky
// board's "Add to pipeline" button — both need the same extract-summarise-
// create-lead flow, just triggered from different places.
export async function pushNoteToPipeline(text: string): Promise<{ ok: true; company: string } | { ok: false; error: string }> {
  const quickRes = await fetch("/api/leads/quick-note", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  const quickData = await quickRes.json();
  if (quickData.error) return { ok: false, error: quickData.error };

  const res = await fetch("/api/leads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      company: quickData.company,
      contact_name: quickData.contact_name,
      source: "cold_call",
    }),
  });
  const data = await res.json();
  if (data.error) return { ok: false, error: data.error };

  // Appended separately (not embedded in the create call above) so a repeat
  // note about the same business — which dedupes to the same lead by company
  // name since there's no email yet — stacks onto the note history instead
  // of only ever landing on first creation.
  await fetch(`/api/leads/${data.lead.lead_id}/followup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callNotes: quickData.summary }),
  });

  return { ok: true, company: data.lead.company };
}
