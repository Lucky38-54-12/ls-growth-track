import Link from "next/link";
import Topbar from "@/components/Topbar";
import { listColdCallSheetFiles, rankColdCallSheets, COLD_CALL_SHEETS_FOLDER_ID } from "@/lib/sheets";

export const revalidate = 0;
export const maxDuration = 60;

const L = { surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", dimmed: "#94a3b8" };
const LOW_THRESHOLD = Number(process.env.COLD_CALL_SHEETS_LOW_THRESHOLD || "30");

export default async function ColdCallSheetsPage() {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID || COLD_CALL_SHEETS_FOLDER_ID;
  const files = await listColdCallSheetFiles(folderId);
  const { sheets, errors, scanned } = await rankColdCallSheets(files);
  const ranked = [...sheets].sort((a, b) => b.freshRows - a.freshRows);
  const totalFresh = sheets.reduce((sum, s) => sum + s.freshRows, 0);

  return (
    <div>
      <Topbar title="Cold Call Sheets" subtitle="Which sheet has the most untouched leads left to call today" />

      <div style={{ maxWidth: 780, margin: "32px auto", padding: "0 28px", display: "flex", flexDirection: "column", gap: 24 }}>
        {scanned < files.length && (
          <p style={{ fontSize: 12.5, color: L.muted }}>
            Scanned {scanned} of {files.length} sheets in the folder — stopped early to stay fast, so sheets further down the Drive folder weren't ranked this time.
          </p>
        )}

        {totalFresh < LOW_THRESHOLD && (
          <div style={{ background: "#fef3c7", border: "1px solid #fde68a", padding: "12px 16px", fontSize: 13, color: "#92400e", fontWeight: 600 }}>
            ⚠️ Only {totalFresh} untouched leads left across scanned sheets — time to prospect more.
          </div>
        )}

        <div style={{ background: L.surface, border: `1px solid ${L.border}`, padding: 24 }}>
          <div style={{ fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: L.text, fontWeight: 800, marginBottom: 18 }}>
            Ranked by untouched leads
          </div>
          {ranked.length === 0 ? (
            <p style={{ color: L.muted, fontSize: 13 }}>No sheets found in the Drive folder.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {ranked.map((sheet, i) => (
                <a
                  key={sheet.sheetId}
                  href={`https://docs.google.com/spreadsheets/d/${sheet.sheetId}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "12px 14px", border: `1px solid ${i === 0 ? "var(--accent)" : L.border}`,
                    textDecoration: "none", color: L.text,
                  }}
                >
                  <span style={{ fontSize: 13.5, fontWeight: i === 0 ? 800 : 600 }}>
                    {i === 0 ? "👉 " : ""}{sheet.sheetTitle}
                  </span>
                  <span style={{ fontSize: 12.5, color: L.muted }}>
                    {sheet.freshRows} untouched / {sheet.totalRows} total
                  </span>
                </a>
              ))}
            </div>
          )}
          {errors.length > 0 && (
            <p style={{ fontSize: 12, color: "#b91c1c", marginTop: 14 }}>
              {errors.length} sheet{errors.length !== 1 ? "s" : ""} failed to read.
            </p>
          )}
        </div>

        <Link href="/dashboard/call-queue" style={{ fontSize: 12.5, color: L.dimmed }}>← Back to Call Queue</Link>
      </div>
    </div>
  );
}
