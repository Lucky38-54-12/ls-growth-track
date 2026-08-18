import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { JWT } from "google-auth-library";
import { renameSheetFile } from "@/lib/sheets";

export const dynamic = "force-dynamic";

// One-off admin action: rename a set of sheets in Drive so they sort to the
// top of the folder (used for "here's what to call today" prioritization).
// Idempotent — skips files that already carry the prefix. The morning-brief
// cron does this same add/remove automatically now (see lib/morningBrief.ts);
// this endpoint stays around for manual overrides from the dashboard.
function getReadAuth(): JWT {
  const keyString = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!keyString) throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY env var not set");
  const key = JSON.parse(keyString);
  return new JWT({ email: key.client_email, key: key.private_key, scopes: ["https://www.googleapis.com/auth/drive.readonly"] });
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const sheetIds: string[] = body.sheetIds || [];
  const prefix: string = body.prefix || "📞 TODAY — ";
  const action: "add" | "remove" = body.action === "remove" ? "remove" : "add";
  if (!sheetIds.length) return NextResponse.json({ error: "sheetIds required" }, { status: 400 });

  const auth = getReadAuth();
  const drive = google.drive({ version: "v3", auth: auth as any });

  const results: { id: string; from?: string; to?: string; error?: string }[] = [];
  for (const id of sheetIds) {
    try {
      const file = await drive.files.get({ fileId: id, fields: "name", supportsAllDrives: true });
      const currentName = file.data.name || "";

      if (action === "remove") {
        if (!currentName.startsWith(prefix)) {
          results.push({ id, from: currentName, to: currentName });
          continue;
        }
        const newName = currentName.slice(prefix.length);
        await renameSheetFile(id, newName);
        results.push({ id, from: currentName, to: newName });
        continue;
      }

      if (currentName.startsWith(prefix)) {
        results.push({ id, from: currentName, to: currentName });
        continue;
      }
      const newName = `${prefix}${currentName}`;
      await renameSheetFile(id, newName);
      results.push({ id, from: currentName, to: newName });
    } catch (e) {
      results.push({ id, error: e instanceof Error ? e.message : "rename failed" });
    }
  }

  return NextResponse.json({ results });
}
