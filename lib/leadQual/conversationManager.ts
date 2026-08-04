import { createSupabaseClient } from "@/lib/supabase";
import { runQualifyingTurn, runPostCloseTurn, ClientConfigData, ConversationTurn } from "./ai";
import { evaluate, Rule, defaultRules } from "./qualification";
import { bookJobOnClientCalendar, resolveAvailableSlot } from "./googleCalendar";
import { enrollInNurture } from "./nurture";
import { notifySlack } from "@/lib/slackNotify";
import { sendReminderEmail } from "@/lib/email";

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

export interface FacebookFormLeadInput {
  clientId: string;
  channelId?: string;
  leadgenId: string;
  fields: Record<string, string>;
}

// A Facebook Lead Ads submission already has everything a qualifying chat
// spends nine exchanges gathering, so it skips runTurn entirely and lands
// straight in lq_leads — there's no conversation to hold a script against.
export async function createLeadFromFacebookForm({ clientId, channelId, leadgenId, fields }: FacebookFormLeadInput): Promise<void> {
  const sb = createSupabaseClient();

  const { data: conversation, error } = await sb
    .from("lq_conversations")
    .insert({
      client_id: clientId,
      channel_id: channelId || null,
      status: "qualified",
      extracted_fields: fields,
      contact: { leadgen_id: leadgenId, name: fields.name || null, email: fields.email || null, phone: fields.phone || null },
    })
    .select()
    .single();
  if (error) throw error;

  await sb.from("lq_leads").insert({
    conversation_id: conversation.id,
    client_id: clientId,
    outcome: "qualified",
    contact_email: fields.email || null,
    pipeline_stage: "new_inquiry",
    booking_status: "not_applicable",
  });

  const { data: client } = await sb.from("lq_clients").select("name").eq("id", clientId).single();
  await notifySlack(
    `📋 New Facebook Lead Ad — *${client?.name || "client"}*\n` +
    `${fields.name || "Unknown name"} — ${fields.job_type}${fields.location !== "Not provided" ? ` in ${fields.location}` : ""}\n` +
    `${fields.phone ? `Phone: ${fields.phone}\n` : ""}` +
    `${process.env.APP_URL || "https://app.lsgrowth.agency"}/dashboard/lead-qual/${clientId}`
  );
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
    trade: client?.trade,
    description: (businessInfo.description as string) || client?.trade || "",
    services: (configRow?.services as string[]) || [],
    serviceAreas: (configRow?.service_areas as string[]) || [],
    faqs: (configRow?.faqs as { question: string; answer: string }[]) || [],
    responseCommitment: (businessInfo.response_commitment as string) || "shortly",
    proofPoint: businessInfo.proof_point as string | undefined,
    websiteContent: businessInfo.website_content as string | undefined,
    extraContext: businessInfo.extra_context as string | undefined,
    timezone: client?.timezone || "Pacific/Auckland",
  };
  const rules: Rule[] = (configRow?.qualification_rules as Rule[]) || defaultRules();

  return { config, rules };
}

export async function runTurn({ clientId, conversationId, userMessage, channelId, contact, metaMessageId }: RunTurnInput): Promise<RunTurnOutput> {
  const sb = createSupabaseClient();

  // A paused client should not spend AI tokens or send replies at all — bail
  // out before touching the conversation row or calling the model. Schema
  // has supported this status for a while, but nothing actually enforced it.
  const { data: clientRow } = await sb.from("lq_clients").select("status").eq("id", clientId).single();
  if (clientRow?.status === "paused") {
    return {
      conversationId: conversationId || "",
      reply: null,
      status: "paused",
      extractedFields: {},
    };
  }

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

  // A staff member has taken this conversation over directly in the Page
  // inbox — the AI stays silent and just keeps logging inbound messages so
  // the human has full context, until someone clears paused_at manually.
  if (conversation.paused_at) {
    return {
      conversationId: conversation.id,
      reply: null,
      status: conversation.status,
      extractedFields: conversation.extracted_fields as Record<string, unknown>,
    };
  }

  const { data: priorMessages } = await sb
    .from("lq_messages")
    .select("role, content")
    .eq("conversation_id", conversation.id)
    .order("created_at", { ascending: true });

  // The qualifying script is ~9 exchanges (job type, location, timeline,
  // quote method, a time, phone, anything else) — 30 messages is generous
  // headroom for a normal conversation. Capped so an unusual conversation
  // (a lead going back and forth well past the script, or manual repeated
  // testing) can't grow the resent history, and therefore the per-turn
  // token cost, without bound. Every call resends this whole array from
  // scratch (see runQualifyingTurn), so an uncapped history is the single
  // biggest driver of runaway API spend on this route.
  const MAX_HISTORY_MESSAGES = 30;
  const history: ConversationTurn[] = (priorMessages || [])
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))
    .slice(-MAX_HISTORY_MESSAGES);

  const { config, rules } = await loadClientConfig(clientId);

  // needs_human means the AI itself decided a person has to take this one —
  // e.g. an existing customer complaint, not a fresh lead. It should go
  // silent exactly like paused_at, not keep firing lightweight auto-replies
  // at someone who's actively upset (that's what was happening to a Katie's
  // Elite Cleaning customer chasing up a botched job — they even asked "why
  // am I getting automated replies?").
  if (conversation.status === "needs_human") {
    return {
      conversationId: conversation.id,
      reply: null,
      status: conversation.status,
      extractedFields: conversation.extracted_fields as Record<string, unknown>,
    };
  }

  // The qualifying flow (extraction + evaluate + lead creation + calendar
  // booking) only ever runs once per conversation. A lead who messages again
  // after being qualified/nurtured/disqualified gets a lightweight reply
  // instead — re-running the full flow here would insert a second lq_leads
  // row and book a duplicate calendar event for the same conversation.
  const alreadyClosed = conversation.status !== "active";
  if (alreadyClosed) {
    const postClose = await runPostCloseTurn(config, userMessage);
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

  // runQualifyingTurn is an LLM call that can take several seconds — long
  // enough for staff to reply in the Page inbox and the echo webhook to set
  // paused_at while this turn was still in flight. The paused_at check at
  // the top of this function is now stale, so it's re-checked here, right
  // before the AI's reply would be persisted/sent, to avoid talking over a
  // human who has since taken the conversation over.
  const { data: freshConversation } = await sb.from("lq_conversations").select("paused_at").eq("id", conversation.id).single();
  if (freshConversation?.paused_at) {
    return {
      conversationId: conversation.id,
      reply: null,
      status: conversation.status,
      extractedFields: conversation.extracted_fields as Record<string, unknown>,
    };
  }

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
          pipeline_stage: result.outcome === "disqualified" ? "not_a_fit" : result.outcome === "nurture" ? "not_ready" : "new_inquiry",
        })
        .select()
        .single();

      if (result.outcome === "qualified" && lead) {
        try {
          const clientRecord = (await sb.from("lq_clients").select("timezone, email").eq("id", clientId).single()).data;
          const timezone = clientRecord?.timezone || "Pacific/Auckland";

          // Only the callback ever gets auto-booked onto the calendar, for
          // both quote methods — an on-site visit time is just what the lead
          // asked for, not something we can commit to on the tradesperson's
          // behalf (their day-to-day schedule isn't visible to us and
          // changes daily). The actual visit gets confirmed by the
          // tradesperson themselves during that call, not auto-locked in
          // from a Messenger chat. visit_time is still captured and surfaced
          // below so they know what the lead asked for going into the call.
          const isOnSite = mergedFields.quote_method === "on_site";
          const desiredLocalDateTime = mergedFields.callback_time_iso as string | undefined;
          const durationMinutes = 20;

          const slot = await resolveAvailableSlot({ clientId, desiredLocalDateTime, durationMinutes, timeZone: timezone });

          const requestedVisitLabel = mergedFields.visit_time as string | undefined;
          const { eventId } = await bookJobOnClientCalendar({
            clientId,
            summary: `Call — ${mergedFields.job_type || "Job"} — ${mergedFields.location || "location TBC"}`,
            description: `Qualified via AI chat.\nJob type: ${mergedFields.job_type || "?"}\nLocation: ${mergedFields.location || "?"}\nTimeline: ${mergedFields.timeline || "?"}${isOnSite && requestedVisitLabel ? `\nLead asked for someone to come round: ${requestedVisitLabel} — confirm on this call, don't assume it's locked in.` : ""}`,
            startISO: slot.toISOString(),
            durationMinutes,
            timeZone: timezone,
          });
          // booked_at is when this booking transaction happened; scheduled_at
          // is the actual appointment/callback time (slot) — the portal's
          // calendar and leads views need the latter, not the former.
          await sb.from("lq_leads").update({ booking_status: "booked", calendar_event_id: eventId, booked_at: new Date().toISOString(), scheduled_at: slot.toISOString(), pipeline_stage: "booked" }).eq("id", lead.id);
          bookingStatus = "booked";

          const slotLabel = new Intl.DateTimeFormat("en-NZ", {
            timeZone: timezone, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
          }).format(slot);
          // Awaited, not fire-and-forget — this runs inside a serverless
          // webhook handler that returns shortly after, and an un-awaited
          // fetch can get cut off mid-flight when the function terminates.
          await notifySlack(
            `📅 New booking — *${config.businessName}*\n` +
            `Call booked for ${slotLabel} — ${mergedFields.job_type || "Job"} in ${mergedFields.location || "location TBC"}\n` +
            `${isOnSite && requestedVisitLabel ? `Lead asked for someone to come round: ${requestedVisitLabel} (confirm on the call)\n` : ""}` +
            `${mergedFields.phone ? `Phone: ${mergedFields.phone}\n` : ""}` +
            `${process.env.APP_URL || "https://app.lsgrowth.agency"}/dashboard/lead-qual/${clientId}`
          );

          // The actual point of all this — the client themselves needs to
          // know a job landed on their calendar and who to call beforehand,
          // not just Lucky. Silently skipped if no email is on file yet
          // (see lq_clients.email, set from the client list page).
          if (clientRecord?.email) {
            await sendReminderEmail(
              clientRecord.email,
              `New job booked: ${mergedFields.job_type || "Job"} — ${slotLabel}`,
              `You've got a new job booked in from your Messenger chat.\n\n` +
              `Job: ${mergedFields.job_type || "Not specified"}\n` +
              `Location: ${mergedFields.location || "Not specified"}\n` +
              `Callback booked for: ${slotLabel}\n` +
              `${mergedFields.phone ? `Their number: ${mergedFields.phone}\n` : ""}` +
              `${isOnSite && requestedVisitLabel ? `They asked for someone to come round: ${requestedVisitLabel} — this isn't locked in, confirm it works for you on the call first.\n` : ""}` +
              `\nGive them a call at that time to sort the quote${isOnSite ? " and confirm a visit time that actually works for you" : ""}.`
            );
          }
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
