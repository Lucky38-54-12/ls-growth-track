import { createSupabaseClient } from "@/lib/supabase";
import { runQualifyingTurn, runPostCloseTurn, ClientConfigData, ConversationTurn } from "./ai";
import { evaluate, Rule, defaultRules } from "./qualification";
import { bookJobOnClientCalendar } from "./googleCalendar";
import { enrollInNurture } from "./nurture";

export interface RunTurnInput {
  clientId: string;
  conversationId: string | null;
  userMessage: string;
  channelId?: string;
  contact?: Record<string, unknown>;
  metaMessageId?: string;
}

export interface RunTurnOutput {
  conversationId: string;
  reply: string | null;
  status: string;
  outcome?: string;
  bookingStatus?: string;
  extractedFields: Record<string, unknown>;
}

async function loadClientConfig(clientId: string): Promise<{ config: ClientConfigData; rules: Rule[] }> {
  const sb = createSupabaseClient();
  const { data: client } = await sb.from("lq_clients").select("name, trade, timezone").eq("id", clientId).single();
  const { data: configRow } = await sb
    .from("lq_client_configs")
    .select("*")
    .eq("client_id", clientId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const businessInfo = (configRow?.business_info as Record<string, unknown>) || {};
  const config: ClientConfigData = {
    businessName: client?.name || "the business",
    description: (businessInfo.description as string) || client?.trade || "",
    services: (configRow?.services as string[]) || [],
    serviceAreas: (configRow?.service_areas as string[]) || [],
    faqs: (configRow?.faqs as { question: string; answer: string }[]) || [],
    responseCommitment: (businessInfo.response_commitment as string) || "shortly",
    proofPoint: businessInfo.proof_point as string | undefined,
    websiteContent: businessInfo.website_content as string | undefined,
    extraContext: businessInfo.extra_context as string | undefined,
  };
  const rules: Rule[] = (configRow?.qualification_rules as Rule[]) || defaultRules();

  return { config, rules };
}

export async function runTurn({ clientId, conversationId, userMessage, channelId, contact, metaMessageId }: RunTurnInput): Promise<RunTurnOutput> {
  const sb = createSupabaseClient();

  let conversation;
  if (conversationId) {
    const { data } = await sb.from("lq_conversations").select("*").eq("id", conversationId).single();
    conversation = data;
  } else {
    const { data, error } = await sb
      .from("lq_conversations")
      .insert({ client_id: clientId, channel_id: channelId || null, status: "active", extracted_fields: {}, contact: contact || {} })
      .select()
      .single();
    if (error) throw error;
    conversation = data;
  }
  if (!conversation) throw new Error("Conversation not found");

  await sb.from("lq_messages").insert({ conversation_id: conversation.id, role: "user", content: userMessage, meta_message_id: metaMessageId || null });

  const { data: priorMessages } = await sb
    .from("lq_messages")
    .select("role, content")
    .eq("conversation_id", conversation.id)
    .order("created_at", { ascending: true });

  const history: ConversationTurn[] = (priorMessages || [])
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  const { config, rules } = await loadClientConfig(clientId);

  // The qualifying flow (extraction + evaluate + lead creation + calendar
  // booking) only ever runs once per conversation. A lead who messages again
  // after being qualified/nurtured/disqualified gets a lightweight reply
  // instead — re-running the full flow here would insert a second lq_leads
  // row and book a duplicate calendar event for the same conversation.
  const alreadyClosed = conversation.status !== "active";
  if (alreadyClosed) {
    const postClose = await runPostCloseTurn(config, history);
    if (postClose.reply_text) {
      await sb.from("lq_messages").insert({
        conversation_id: conversation.id,
        role: "assistant",
        content: postClose.reply_text,
      });
    }
    return {
      conversationId: conversation.id,
      reply: postClose.reply_text,
      status: conversation.status,
      extractedFields: conversation.extracted_fields as Record<string, unknown>,
    };
  }

  const turn = await runQualifyingTurn(config, history);

  const mergedFields = { ...(conversation.extracted_fields as Record<string, unknown>), ...turn.extracted_fields };

  await sb.from("lq_messages").insert({
    conversation_id: conversation.id,
    role: "assistant",
    content: turn.reply_text,
    structured_output: turn,
  });

  let status = conversation.status;
  let outcome: string | undefined;
  let bookingStatus: string | undefined;

  if (turn.next_action === "needs_human") {
    status = "needs_human";
  } else if (turn.next_action === "ready_for_qualification") {
    const result = evaluate({ rules, extracted: mergedFields, confidence: turn.confidence });
    outcome = result.outcome;
    status = result.outcome === "qualified" ? "qualified" : result.outcome === "nurture" ? "nurturing" : result.outcome;

    if (result.outcome !== "needs_human") {
      const contactEmail = typeof mergedFields.email === "string" ? mergedFields.email : undefined;
      const { data: lead } = await sb
        .from("lq_leads")
        .insert({
          conversation_id: conversation.id,
          client_id: clientId,
          outcome: result.outcome,
          score: result.score,
          contact_email: contactEmail || null,
        })
        .select()
        .single();

      if (result.outcome === "qualified" && lead) {
        try {
          const timezone = (await sb.from("lq_clients").select("timezone").eq("id", clientId).single()).data?.timezone || "Pacific/Auckland";
          const startISO = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // placeholder: next-day slot, real scheduling logic comes later
          const { eventId } = await bookJobOnClientCalendar({
            clientId,
            summary: `${mergedFields.job_type || "Job"} — ${mergedFields.location || "location TBC"}`,
            description: `Qualified via AI chat.\nJob type: ${mergedFields.job_type || "?"}\nLocation: ${mergedFields.location || "?"}\nTimeline: ${mergedFields.timeline || "?"}`,
            startISO,
            timeZone: timezone,
          });
          await sb.from("lq_leads").update({ booking_status: "booked", calendar_event_id: eventId, booked_at: new Date().toISOString() }).eq("id", lead.id);
          bookingStatus = "booked";
        } catch {
          // No calendar connected yet, or booking failed — lead is still
          // recorded as qualified, just not auto-booked. Surfaced in the UI
          // so it can be booked manually instead.
          await sb.from("lq_leads").update({ booking_status: "failed" }).eq("id", lead.id);
          bookingStatus = "failed";
        }
      }

      if (result.outcome === "nurture" && lead && contactEmail) {
        try {
          await enrollInNurture(lead.id, clientId, contactEmail);
        } catch (err) {
          console.error("nurture enrollment failed", err);
        }
      }
    }
  }

  await sb.from("lq_conversations").update({ status, extracted_fields: mergedFields }).eq("id", conversation.id);

  return {
    conversationId: conversation.id,
    reply: turn.reply_text,
    status,
    outcome,
    bookingStatus,
    extractedFields: mergedFields,
  };
}
