import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { getSheetData, updateSheetCell } from "@/lib/sheets-connector";
import { buildScheduledEmails } from "@/lib/email-scheduler";
import { google } from "googleapis";
import { JWT } from "google-auth-library";

const resend = new Resend(process.env.RESEND_API_KEY);

// Get folder ID from env
const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;

if (!FOLDER_ID) {
  console.error("GOOGLE_DRIVE_FOLDER_ID not set");
}

function getServiceAccountAuth(): JWT {
  const keyString = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!keyString) throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY env var not set");

  const key = JSON.parse(keyString);
  const jwtClient = new JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: [
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/spreadsheets",
    ],
  });

  return jwtClient;
}

async function getSheetFilesInFolder(folderId: string): Promise<Array<{ id: string; name: string }>> {
  const auth = getServiceAccountAuth();
  const drive = google.drive({ version: "v3", auth });

  const response = await drive.files.list({
    q: `'${folderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
    spaces: "drive",
    fields: "files(id, name)",
    pageSize: 100,
  });

  return response.data.files || [];
}

export async function POST(req: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!FOLDER_ID) {
      return NextResponse.json(
        { error: "Google Drive folder ID not configured" },
        { status: 500 }
      );
    }

    console.log("Starting email schedule job...");

    // List all spreadsheets in the folder
    const spreadsheets = await getSheetFilesInFolder(FOLDER_ID);
    console.log(`Found ${spreadsheets.length} spreadsheets:`, spreadsheets.map((s) => s.name));

    let totalEmailsSent = 0;
    const results: any[] = [];

    // Process each spreadsheet
    for (const spreadsheet of spreadsheets) {
      console.log(`Processing spreadsheet: ${spreadsheet.name}`);

      try {
        // Get the first sheet (usually "Sheet1" or the main data sheet)
        const sheetData = await getSheetData(spreadsheet.id, "Sheet1");
        console.log(`  Found ${sheetData.rows.length} leads`);

        // Build emails for this sheet
        const emails = buildScheduledEmails(
          sheetData.rows.map((row) => ({
            ...row,
            trade: spreadsheet.name.split("-")[0].trim(),
            location: spreadsheet.name,
          }))
        );

        console.log(`  ${emails.length} emails due to send`);

        // Send each email
        for (const email of emails) {
          try {
            const response = await resend.emails.send({
              from: "LS Growth <outreach@lsgrowth.agency>",
              to: email.email,
              subject: email.subject,
              html: email.html,
              // Track opens/clicks for engagement metrics
              tags: [email.step, spreadsheet.name],
            });

            if (response.error) {
              console.error(`  Failed to send to ${email.email}:`, response.error);
              continue;
            }

            totalEmailsSent++;
            console.log(`  ✓ Sent ${email.step} to ${email.email}`);
          } catch (error) {
            console.error(`Error sending to ${email.email}:`, error);
          }
        }

        results.push({ spreadsheet: spreadsheet.name, sent: emails.length, success: true });
      } catch (error) {
        console.error(`Error processing spreadsheet ${spreadsheet.name}:`, error);
        results.push({
          spreadsheet: spreadsheet.name,
          success: false,
          error: String(error),
        });
      }
    }

    console.log(`Job complete. Sent ${totalEmailsSent} emails.`);

    return NextResponse.json({
      success: true,
      totalSent: totalEmailsSent,
      spreadsheets: spreadsheets.length,
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Email schedule error:", error);
    return NextResponse.json(
      { error: String(error), timestamp: new Date().toISOString() },
      { status: 500 }
    );
  }
}

async function logEmailSend({
  spreadsheetId,
  email,
  company,
  step,
  timestamp,
  sheetName,
}: {
  spreadsheetId: string;
  email: string;
  company: string;
  step: string;
  timestamp: string;
  sheetName: string;
}): Promise<void> {
  try {
    // Log to a "Send Log" sheet for tracking
    const logRange = "Send Log!A:E";
    await updateSheetCell(spreadsheetId, logRange, [
      [timestamp, sheetName, company, email, step],
    ]);
  } catch (error) {
    console.error("Failed to log email send:", error);
    // Don't throw - logging failure shouldn't block the send
  }
}

// For local testing
export async function GET() {
  return NextResponse.json({
    message: "Email scheduler endpoint. Call with POST + Bearer token.",
  });
}

import { updateSheetCell } from "@/lib/sheets-connector";
