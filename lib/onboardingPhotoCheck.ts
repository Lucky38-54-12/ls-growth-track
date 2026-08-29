import { google } from "googleapis";
import { getLuckyGoogleAuthedClient } from "@/lib/luckyGoogleAuth";
import { createSupabaseClient } from "@/lib/supabase";
import { notifySlack } from "@/lib/slackNotify";

const FOLDER_ID_RE = /folders\/([^/?]+)/;

// A client's upload folder accepts anonymous "anyone with the link" edits
// (see lib/googleDocs.ts createSharedUploadFolder), which means Drive's own
// activity notifications never fire for it — there's no signed-in actor to
// attach the alert to. This is the once-a-day substitute: compare each
// client's file count against what was last seen and Slack-ping on growth.
// Runs from the daily-maintenance cron, not its own faster schedule — Lucky
// confirmed once a day is fine, the client usually messages him anyway.
export async function checkOnboardingPhotoUploads(): Promise<{ checked: number; notified: number }> {
  const sb = createSupabaseClient();
  const { data: clients } = await sb
    .from("onboarding_clients")
    .select("id, company, portal_photos_folder_url, photos_file_count")
    .not("portal_photos_folder_url", "is", null);

  if (!clients || clients.length === 0) return { checked: 0, notified: 0 };

  const auth = await getLuckyGoogleAuthedClient();
  const drive = google.drive({ version: "v3", auth });

  let notified = 0;
  for (const client of clients) {
    const match = client.portal_photos_folder_url?.match(FOLDER_ID_RE);
    if (!match) continue;
    const folderId = match[1];

    try {
      const list = await drive.files.list({
        q: `'${folderId}' in parents and trashed=false`,
        fields: "files(id)",
        pageSize: 1000,
      });
      const currentCount = list.data.files?.length || 0;
      const previousCount = client.photos_file_count || 0;

      if (currentCount > previousCount) {
        const added = currentCount - previousCount;
        await notifySlack(
          `📁 *${client.company}* dropped ${added} new file${added === 1 ? "" : "s"} into their upload folder (${currentCount} total): ${client.portal_photos_folder_url}`
        );
        notified++;
      }

      if (currentCount !== previousCount) {
        await sb.from("onboarding_clients").update({ photos_file_count: currentCount }).eq("id", client.id);
      }
    } catch (err) {
      console.error("checkOnboardingPhotoUploads failed for client", client.id, err);
    }
  }

  return { checked: clients.length, notified };
}
