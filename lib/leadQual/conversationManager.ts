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
          const clientRecord = (await sb.from("lq_clients").select("timezone, email").eq("id", clientId).single()).data;
          const timezone = clientRecord?.timezone || "Pacific/Auckland";

          // visit_time_iso/callback_time_iso are the AI's own resolution of
          // whatever loose time the lead gave ("tomorrow arvo") into a real
          // local date/time — an on-site visit uses visit_time, a phone-only
          // quote uses callback_time. Actually checked against the client's
          // calendar (business hours + no conflicts) instead of blindly
          // booking a fixed 24h-from-now slot regardless of what was said.
          const isOnSite = mergedFields.quote_method === "on_site";
          const desiredLocalDateTime = (isOnSite ? mergedFields.visit_time_iso : mergedFields.callback_time_iso) as string | undefined;
          const durationMinutes = isOnSite ? 60 : 20;

          const slot = await resolveAvailableSlot({ clientId, desiredLocalDateTime, durationMinutes, timeZone: timezone });

          const requestedTimeLabel = isOnSite ? mergedFields.visit_time : mergedFields.callback_time;
          const { eventId } = await bookJobOnClientCalendar({
            clientId,
            summary: `${mergedFields.job_type || "Job"} — ${mergedFields.location || "location TBC"}`,
            description: `Qualified via AI chat.\nJob type: ${mergedFields.job_type || "?"}\nLocation: ${mergedFields.location || "?"}\nTimeline: ${mergedFields.timeline || "?"}${requestedTimeLabel ? `\nLead requested: ${requestedTimeLabel}` : ""}`,
            startISO: slot.toISOString(),
            durationMinutes,
            timeZone: timezone,
          });
          // booked_at is when this booking transaction happened; scheduled_at
          // is the actual appointment/callback time (slot) — the portal's
          // calendar and leads views need the latter, not the former.
          await sb.from("lq_leads").update({ booking_status: "booked", calendar_event_id: eventId, booked_at: new Date().toISOString(), scheduled_at: slot.toISOString() }).eq("id", lead.id);
          bookingStatus = "booked";

          const slotLabel = new Intl.DateTimeFormat("en-NZ", {
            timeZone: timezone, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
          }).format(slot);
          // Awaited, not fire-and-forget — this runs inside a serverless
          // webhook handler that returns shortly after, and an un-awaited
          // fetch can get cut off mid-flight when the function terminates.
          await notifySlack(
            `📅 New booking — *${config.businessName}*\n` +
            `${mergedFields.job_type || "Job"} in ${mergedFields.location || "location TBC"}, booked for ${slotLabel}\n` +
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
              `${isOnSite ? "Site visit" : "Callback"} booked for: ${slotLabel}\n` +
              `${mergedFields.phone ? `Their number: ${mergedFields.phone}\n` : ""}` +
              `${requestedTimeLabel ? `They asked for: ${requestedTimeLabel}\n` : ""}` +
              `\nGive them a call beforehand to confirm everything before you head out or call for the quote.`
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
