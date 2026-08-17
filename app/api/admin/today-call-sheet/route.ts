import { NextResponse } from "next/server";
import { listColdCallSheetFiles, rankColdCallSheets, COLD_CALL_SHEETS_FOLDER_ID } from "@/lib/sheets";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Session-protected (via middleware, same as other /api/admin/* routes) view
// of the same ranking the 7am morning-brief cron uses, so Lucky can check
// "what's today's call sheet" on demand from a logged-in browser without
// needing CRON_SECRET.
const SCAN_LIMIT = Number(process.env.COLD_CALL_SHEETS_SCAN_LIMIT || "40");

export async function GET() {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID || COLD_CALL_SHEETS_FOLDER_ID;
  const files = await listColdCallSheetFiles(folderId);
  const { sheets, errors } = await rankColdCallSheets(files.slice(0, SCAN_LIMIT));
  const ranked = [...sheets].sort((a, b) => b.freshRows - a.freshRows);
  const totalFresh = sheets.reduce((sum, s) => sum + s.freshRows, 0);
  return NextResponse.json({ totalSheets: files.length, totalFresh, sheets: ranked, errors });
}
