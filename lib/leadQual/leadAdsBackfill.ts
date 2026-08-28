import { createSupabaseClient } from "@/lib/supabase";
import { decryptSecret } from "./crypto";
import { parseLeadgenFields, type LeadgenField } from "./meta";
import { createLeadFromFacebookForm } from "./conversationManager";

interface LeadgenForm {
  id: string;
  name: string;
}

// Facebook Lead Ad forms are listed per-Page, not per-ad-account — this is
// the same Page connection already stored for Messenger, reused here since
// leadgen access rides on the same Page Access Token.
async function fetchLeadFormsForPage(pageId: string, pageAccessToken: string): Promise<LeadgenForm[]> {
  const forms: LeadgenForm[] = [];
  let url: string | null =
    `https://graph.facebook.com/v20.0/${pageId}/leadgen_forms?fields=id,name&limit=100&access_token=${encodeURIComponent(pageAccessToken)}`;

  while (url) {
    const res: Response = await fetch(url);
    if (!res.ok) throw new Error(`leadgen_forms fetch failed: ${res.status} ${await res.text()}`);
    const body: { data?: LeadgenForm[]; paging?: { next?: string } } = await res.json();
    forms.push(...(body.data || []));
    url = body.paging?.next || null;
  }

  return forms;
}

interface HistoricalLead {
  id: string;
  created_time: string;
  field_data: LeadgenField[];
}

// Same pagination shape as fetchLeadFormsForPage — Meta's Graph API caps
// each page of results and hands back a `paging.next` URL (already carrying
// the access token) to walk through the rest.
async function fetchLeadsForForm(formId: string, pageAccessToken: string): Promise<HistoricalLead[]> {
  const leads: HistoricalLead[] = [];
  let url: string | null =
    `https://graph.facebook.com/v20.0/${formId}/leads?fields=id,created_time,field_data&limit=100&access_token=${encodeURIComponent(pageAccessToken)}`;

  while (url) {
    const res: Response = await fetch(url);
    if (!res.ok) throw new Error(`leads fetch failed for form ${formId}: ${res.status} ${await res.text()}`);
    const body: { data?: HistoricalLead[]; paging?: { next?: string } } = await res.json();
    leads.push(...(body.data || []));
    url = body.paging?.next || null;
  }

  return leads;
}

export interface BackfillResult {
  formsFound: number;
  leadsFound: number;
  leadsImported: number;
  leadsSkipped: number;
}

// Pulls every historical Lead Ad form submission for a client's connected
// Page and imports the ones we don't already have — for leads submitted
// before the Page was connected (or before leads_retrieval was approved),
// which the live webhook never saw. Safe to re-run: duplicates are caught
// by the same leadgen_id existence check the webhook uses.
export async function backfillLeadsForClient(clientId: string): Promise<BackfillResult> {
  const sb = createSupabaseClient();

  const { data: channel } = await sb
    .from("lq_channels")
    .select("id, external_page_id, credentials")
    .eq("client_id", clientId)
    .eq("type", "messenger")
    .maybeSingle();

  if (!channel || !channel.credentials) {
    throw new Error("This client has no connected Facebook Page to backfill from.");
  }

  const pageAccessToken = decryptSecret(channel.credentials as unknown as Buffer);
  const forms = await fetchLeadFormsForPage(channel.external_page_id, pageAccessToken);

  let leadsFound = 0;
  let leadsImported = 0;
  let leadsSkipped = 0;

  for (const form of forms) {
    const leads = await fetchLeadsForForm(form.id, pageAccessToken);
    leadsFound += leads.length;

    for (const lead of leads) {
      const { data: existing } = await sb
        .from("lq_conversations")
        .select("id")
        .eq("client_id", clientId)
        .contains("contact", { leadgen_id: lead.id })
        .maybeSingle();
      if (existing) {
        leadsSkipped++;
        continue;
      }

      // One bad lead (a transient Graph API hiccup, a genuine DB error)
      // shouldn't lose every lead after it in the batch — each is
      // independent, so isolate failures per-lead instead of letting one
      // throw abort the whole client's run.
      try {
        const fields = parseLeadgenFields(lead.field_data || []);
        const imported = await createLeadFromFacebookForm({
          clientId,
          channelId: channel.id,
          leadgenId: lead.id,
          fields,
          submittedAt: lead.created_time,
        });
        if (imported) leadsImported++;
        else leadsSkipped++;
      } catch (err) {
        console.error("lead-qual backfill: failed to import lead", lead.id, err);
        leadsSkipped++;
      }
    }
  }

  return { formsFound: forms.length, leadsFound, leadsImported, leadsSkipped };
}
