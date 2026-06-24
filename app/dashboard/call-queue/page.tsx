import { createSupabaseClient, fetchAllRows } from "@/lib/supabase";
import { listSheetsInFolder } from "@/lib/sheets-connector";
import { findCoverageGaps } from "@/lib/prospecting";
import Topbar from "@/components/Topbar";
import SuggestionsPanel from "./SuggestionsPanel";

export const revalidate = 0;

const DEFAULT_FOLDER_ID = "1_2E0ugCHU8POB7O3abgksA0OKGMlVOeR";

export default async function CallQueuePage() {
  const sb = createSupabaseClient();
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID || DEFAULT_FOLDER_ID;

  const leads = await fetchAllRows<{ trade: string; location: string }>((from, to) =>
    sb.from("leads").select("trade, location").range(from, to)
  );

  let sheetTitles: string[] = [];
  try {
    sheetTitles = (await listSheetsInFolder(folderId)).map((s) => s.title);
  } catch {
    // Suggestions still work off the lead-count fallback if the Drive folder can't be reached.
  }

  const suggestions = findCoverageGaps(sheetTitles, leads, 5);

  return (
    <div>
      <Topbar title="Call Queue" subtitle="Pick a trade + city to prospect next" />

      <div style={{ maxWidth: 860, margin: "28px auto", padding: "0 28px" }}>
        <SuggestionsPanel suggestions={suggestions} />
      </div>
    </div>
  );
}
