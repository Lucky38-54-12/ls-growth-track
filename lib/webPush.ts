import webpush from "web-push";
import { createSupabaseClient, fetchAllRows } from "./supabase";

type PushSubRow = { id: string; endpoint: string; p256dh: string; auth: string };

let configured = false;
function ensureConfigured() {
  if (configured) return;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return;
  webpush.setVapidDetails("mailto:lucky@lsgrowth.agency", publicKey, privateKey);
  configured = true;
}

// Sends to every registered device, dropping subscriptions the browser has
// revoked (410 Gone / 404) so the table doesn't accumulate dead endpoints.
export async function notifyPush(title: string, body: string, url = "/dashboard/today"): Promise<void> {
  ensureConfigured();
  if (!configured) return;
  const sb = createSupabaseClient();
  const subs = await fetchAllRows<PushSubRow>((from, to) =>
    sb.from("push_subscriptions").select("*").range(from, to)
  );
  if (subs.length === 0) return;

  const payload = JSON.stringify({ title, body, url });
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
      } catch (err: any) {
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await sb.from("push_subscriptions").delete().eq("id", sub.id);
        }
      }
    })
  );
}
