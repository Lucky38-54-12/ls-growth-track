import { NextRequest, NextResponse } from "next/server";
import { renameSheetFile, hasTodayTag, stripTodayTag } from "@/lib/sheets";
import { google } from "googleapis";

export const dynamic = "force-dynamic";

// One-off cleanup: strip the 📞 TODAY — tag from specific sheet IDs passed
// via ?ids=a,b,c. Session-cookie protected (see middleware.ts), for stray
// tagged sheets living outside the folder the automated triage scans (see
// lib/sheets.ts's COLD_CALL_SHEETS_FOLDER_ID) — those never get picked up
// or cleaned by the normal cron/manual-trigger flow.
function getAuth() {
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!key) throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY env var not set");
  const credentials = JSON.parse(key);
  return new google.auth.GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/drive.readonly"] });
}

export async function GET(req: NextRequest) {
  const ids = (req.nextUrl.searchParams.get("ids") || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!ids.length) return NextResponse.json({ error: "ids query param required" }, { status: 400 });

  const drive = google.drive({ version: "v3", auth: getAuth() as any });
  const results = await Promise.all(ids.map(async (id) => {
    try {
      const file = await drive.files.get({ fileId: id, fields: "name", supportsAllDrives: true });
      const currentName = file.data.name || "";
      if (!hasTodayTag(currentName)) return { id, from: currentName, to: currentName, skipped: true };
      const newName = stripTodayTag(currentName);
      await renameSheetFile(id, newName);
      return { id, from: currentName, to: newName };
    } catch (e) {
      return { id, error: e instanceof Error ? e.message : "rename failed" };
    }
  }));

  return NextResponse.json({ results });
}
