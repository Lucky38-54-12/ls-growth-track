import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { listSheets, getSheetData, updateSheetCell } from "@/lib/sheets-connector";
import { buildScheduledEmails, getNextEmailStep } from "@/lib/email-scheduler";

const resend = new Resend(process.env.RESEND_API_KEY);

// Get the Drive ID from env or use a default "My Drive"
const DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || "root";

// The master spreadsheet that has all leads
const MASTER_SPREADSHEET_ID = process.env.GOOGLE_MASTER_SPREADSHEET_ID;

if (!MASTER_SPREADSHEET_ID) {
  console.error("GOOGLE_MASTER_SPREADSHEET_ID not set");
}

export async function POST(req: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!MASTER_SPREADSHEET_ID) {
      return NextResponse.json(
        { error: "Master spreadsheet ID not configured" },
        { status: 500 }
      );
    }

    console.log("Starting email schedule job...");

    // List all sheets in the master spreadsheet
    const sheetNames = await listSheets(MASTER_SPREADSHEET_ID);
    console.log(`Found ${sheetNames.length} sheets:`, sheetNames);

    let totalEmailsSent = 0;
    const results: any[] = [];

    // Process each sheet
    for (const sheetName of sheetNames) {
      console.log(`Processing sheet: ${sheetName}`);

      try {
        const sheetData = await getSheetData(MASTER_SPREADSHEET_ID, sheetName);
        console.log(`  Found ${sheetData.rows.length} leads`);

        // Build emails for this sheet
        const emails = buildScheduledEmails(
          sheetData.rows.map((row) => ({
            ...row,
            trade: sheetName.split("-")[0], // Extract trade from sheet name
            location: sheetName.split("-").slice(1).join("-"),
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
              tags: [email.step, sheetName],
            });

            if (response.error) {
              console.error(`  Failed to send to ${email.email}:`, response.error);
              continue;
            }

            totalEmailsSent++;
            console.log(`  ✓ Sent ${email.step} to ${email.email}`);

            // Log the send back to Sheets (append to a log sheet)
            await logEmailSend({
              spreadsheetId: MASTER_SPREADSHEET_ID,
              email: email.email,
              company: email.company,
              step: email.step,
              timestamp: new Date().toISOString(),
              sheetName,
            });

            // Mark in the original sheet that this email was sent
            // (This is a simplified approach - a real system would update the specific row)
          } catch (error) {
            console.error(`Error sending to ${email.email}:`, error);
          }
        }

        results.push({ sheet: sheetName, sent: emails.length, success: true });
      } catch (error) {
        console.error(`Error processing sheet ${sheetName}:`, error);
        results.push({ sheet: sheetName, success: false, error: String(error) });
      }
    }

    console.log(`Job complete. Sent ${totalEmailsSent} emails.`);

    return NextResponse.json({
      success: true,
      totalSent: totalEmailsSent,
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
