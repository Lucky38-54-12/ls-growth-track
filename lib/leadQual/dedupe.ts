import { createSupabaseClient } from "@/lib/supabase";

// NZ numbers show up formatted differently depending on where they came
// from ("+6421830061" from a Facebook Lead Ad vs "021 830 061" typed into
// Messenger) — comparing the last 8 digits absorbs the +64/0 country-code
// difference without needing a full phone-parsing library.
function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 7 ? digits.slice(-8) : null;
}

export interface ExistingLeadMatch {
  id: string;
  conversation_id: string | null;
  notes: string | null;
  contact_email: string | null;
  extracted_fields: Record<string, unknown>;
}

// A lead can reach a client through more than one channel — a Facebook Lead
// Ad form, then a Messenger chat, with no shared id between the two
// (leadgen submissions carry no PSID, Messenger events carry no
// leadgen_id). Phone number is the one field both paths usually capture,
// so it's what ties a second intake back to the first lead instead of
// spawning a duplicate pipeline card. Scans the client's recent leads
// in JS since the comparison needs digit-normalization Postgres can't do
// in a plain equality filter — fine at this volume (a client's whole
// pipeline, not a table scan).
export async function findExistingLeadByPhone(clientId: string, phone: string | null | undefined): Promise<ExistingLeadMatch | null> {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;

  const sb = createSupabaseClient();
  const { data: leads } = await sb
    .from("lq_leads")
    .select("id, conversation_id, notes, contact_email, lq_conversations(extracted_fields)")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(100);

  for (const lead of leads || []) {
    const fields = ((lead.lq_conversations as any)?.extracted_fields || {}) as Record<string, unknown>;
    if (normalizePhone(fields.phone as string | undefined) === normalized) {
      return { id: lead.id, conversation_id: lead.conversation_id, notes: lead.notes, contact_email: lead.contact_email, extracted_fields: fields };
    }
  }
  return null;
}

// Fills gaps in the existing lead's extracted_fields from a fresh intake
// (e.g. a name captured on the Lead Ad form that the Messenger chat never
// asked for) without overwriting anything already on file.
export async function mergeFieldsIntoExistingLead(match: ExistingLeadMatch, newFields: Record<string, unknown>): Promise<void> {
  if (!match.conversation_id) return;
  const filled: Record<string, unknown> = { ...match.extracted_fields };
  for (const [k, v] of Object.entries(newFields)) {
    if (!filled[k] && v) filled[k] = v;
  }
  const sb = createSupabaseClient();
  await sb.from("lq_conversations").update({ extracted_fields: filled }).eq("id", match.conversation_id);
}
