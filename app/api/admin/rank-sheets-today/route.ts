import { NextRequest, NextResponse } from "next/server";
import { listColdCallSheetFiles, rankColdCallSheets, COLD_CALL_SHEETS_FOLDER_ID } from "@/lib/sheets";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const folderId = req.nextUrl.searchParams.get("folderId") || process.env.GOOGLE_DRIVE_FOLDER_ID || COLD_CALL_SHEETS_FOLDER_ID;
  const offset = Number(req.nextUrl.searchParams.get("offset") || "0");
  const limit = Number(req.nextUrl.searchParams.get("limit") || "10");

  const files = await listColdCallSheetFiles(folderId);
  const batch = files.slice(offset, offset + limit);
  const { sheets, errors } = await rankColdCallSheets(batch);

  const nextOffset = offset + limit;
  return NextResponse.json({
    totalSheets: files.length,
    processed: `${offset}-${Math.min(nextOffset, files.length)}`,
    done: nextOffset >= files.length,
    nextOffset: nextOffset >= files.length ? null : nextOffset,
    sheets,
    errors,
  });
}
