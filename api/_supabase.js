const { createClient } = require("@supabase/supabase-js");

let client = null;

function getSupabase() {
  if (!client) {
    client = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  return client;
}

async function logEvent({ leadId, eventType, url }) {
  if (!leadId) return;
  const supabase = getSupabase();
  await supabase.from("email_events").insert({
    lead_id: leadId,
    event_type: eventType,
    url: url || null,
  });
}

module.exports = { logEvent };
