import { createSupabaseClient } from "@/lib/supabase";
import { sendReminderEmail } from "@/lib/email";

// Facebook and Calendar can connect in either order (whichever OAuth the
// client does last is the one that should fire this), so both callbacks call
// this after their own connection succeeds. The atomic update — only send if
// onboarding_notified_at is still null — is what keeps it a one-time email
// instead of firing again every time either channel gets reconnected.
export async function checkAndNotifyOnboardingComplete(clientId: string): Promise<void> {
  const sb = createSupabaseClient();
  const { data: client } = await sb
    .from("lq_clients")
    .select("id, name, email, lq_calendar_connections(google_account_email), lq_channels(type)")
    .eq("id", clientId)
    .maybeSingle();
  if (!client) return;

  const calendarConnected = !!client.lq_calendar_connections;
  const facebookConnected = !!client.lq_channels?.some((c: { type: string }) => c.type === "messenger");
  if (!calendarConnected || !facebookConnected) return;

  const { data: won } = await sb
    .from("lq_clients")
    .update({ onboarding_notified_at: new Date().toISOString() })
    .eq("id", clientId)
    .is("onboarding_notified_at", null)
    .select("id")
    .maybeSingle();
  if (!won) return; // already notified — someone else won the race or it fired before

  const to = process.env.GMAIL_USER;
  if (!to) return;
  await sendReminderEmail(
    to,
    `Onboarding complete: ${client.name}`,
    `${client.name} has connected both Facebook and Calendar — onboarding's done and leads should start flowing.\n\nClient contact email: ${client.email || "not set yet"}`
  );
}
