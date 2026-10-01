// One-off: existing calendar events were created before lib/calendar.ts set
// visibility:"public" explicitly, so they're stuck on the calendar's default
// (private) and invisible in detail to the lead-scraper's read-only service
// account. Patches every upcoming/recent booking to visibility:"public" so
// get_pending_meeting_companies() in lead-scraper/morning_gap_check.py can
// actually see them. Safe to re-run (no-op on events already public).
import fs from "fs";
import path from "path";
import { google } from "googleapis";

const envPath = path.join(__dirname, "..", ".env.local");
for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
}

import { getBookingGoogleAuthedClient } from "../lib/bookingCalendarAuth";

async function main() {
  const auth = await getBookingGoogleAuthedClient();
  const calendar = google.calendar({ version: "v3", auth });
  const calendarId = process.env.GOOGLE_CALENDAR_ID || "primary";

  const timeMin = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const timeMax = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const res = await calendar.events.list({
    calendarId, timeMin, timeMax, singleEvents: true, orderBy: "startTime", maxResults: 250,
  });
  const events = res.data.items || [];
  console.log(`Found ${events.length} event(s) in window.`);

  let patched = 0;
  for (const ev of events) {
    if (!ev.id) continue;
    if (ev.visibility === "public") continue;
    try {
      await calendar.events.patch({ calendarId, eventId: ev.id, requestBody: { visibility: "public" } });
      console.log(`  patched ${ev.id} (${ev.start?.dateTime || ev.start?.date})`);
      patched++;
    } catch (e: any) {
      console.log(`  ERROR patching ${ev.id}: ${e.message || e}`);
    }
  }
  console.log(`Done. Patched ${patched}/${events.length}.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
