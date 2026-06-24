import { NextRequest } from "next/server";
import { spawn } from "child_process";
import path from "path";
import { createSupabaseClient, fetchAllRows } from "@/lib/supabase";
import { generateLeadId } from "@/lib/leads";
import { generateColdCallPrep } from "@/lib/ai";
import { findCoverageGap } from "@/lib/prospecting";
import { listSheetsInFolder, createLeadSheet, appendToSheet } from "@/lib/sheets-connector";

export const dynamic = "force-dynamic";

// Auto-prospector — looks at which trade + major-city combos don't have a
// sheet yet in the Email Outreach Drive folder, picks the most under-covered
// one (cycling across all of Lucky's trades, not just one), runs the local
// Google Maps scraper, writes AI cold-call prep notes for each new business,
// and saves them straight to the call queue (source = "cold_call", status =
// "not_contacted"). It also creates a properly-named sheet for that combo and
// registers it for daily sync, so it slots into Lucky's normal workflow.
const DEFAULT_FOLDER_ID = "1_2E0ugCHU8POB7O3abgksA0OKGMlVOeR";

interface ScrapedLead {
  name: string;
  phone: string;
  email: string;
  website: string;
  facebook: string;
}

function parseScraperOutput(text: string): ScrapedLead[] {
  const leads: ScrapedLead[] = [];
  let current: ScrapedLead | null = null;

  for (const line of text.split("\n")) {
    const nameMatch = line.match(/^\s*\[\d+\]\s+(.+?)\s*$/);
    if (nameMatch) {
      if (current?.name) leads.push(current);
      current = { name: nameMatch[1], phone: "", email: "", website: "", facebook: "" };
      continue;
    }
    const contactMatch = line.match(/phone:\s*(.+?)\s*\|\s*email:\s*(.+?)\s*$/);
    if (contactMatch && current) {
      current.phone = contactMatch[1] === "—" ? "" : contactMatch[1].trim();
      current.email = contactMatch[2] === "—" ? "" : contactMatch[2].trim();
      continue;
    }
    const webMatch = line.match(/website:\s*(.+?)\s*\|\s*facebook:\s*(.+?)\s*$/);
    if (webMatch && current) {
      current.website = webMatch[1] === "—" ? "" : webMatch[1].trim();
      current.facebook = webMatch[2] === "—" ? "" : webMatch[2].trim();
    }
  }
  if (current?.name) leads.push(current);
  return leads;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const max = Math.max(1, Math.min(Number(url.searchParams.get("max")) || 20, 50));
  const regionOverride = url.searchParams.get("region")?.trim();
  const tradeOverride = url.searchParams.get("trade")?.trim();

  const sb = createSupabaseClient();

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      function send(payload: object) {
        controller.enqueue(enc.encode(`data: ${JSON.stringify(payload)}\n\n`));
      }

      const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID || DEFAULT_FOLDER_ID;

      try {
        const existingLeads = await fetchAllRows<{ trade: string; location: string; email: string; lead_id: string }>(
          (from, to) => sb.from("leads").select("trade, location, email, lead_id").range(from, to)
        );

        let trade: string;
        let region: string;

        if (tradeOverride && regionOverride) {
          // Suggestion buttons already know exactly which combo to run —
          // skip the Drive lookup and auto-pick entirely.
          trade = tradeOverride;
          region = regionOverride;
          send({ type: "start", msg: `Running ${trade} in ${region}. Searching "${trade.toLowerCase()} companies ${region}" (up to ${max})...\n` });
        } else {
          let sheetTitles: string[] = [];
          try {
            sheetTitles = (await listSheetsInFolder(folderId)).map((s) => s.title);
          } catch (e) {
            send({ type: "stderr", msg: `Could not list the Email Outreach folder (continuing with lead-count fallback): ${e instanceof Error ? e.message : String(e)}\n` });
          }

          const gap = findCoverageGap(sheetTitles, existingLeads);
          trade = tradeOverride || gap.trade;
          region = regionOverride || gap.city;
          send({ type: "start", msg: `Auto-picked ${trade} in ${region} (no sheet found for that combo yet). Searching "${trade.toLowerCase()} companies ${region}" (up to ${max})...\n` });
        }

        const query = `${trade.toLowerCase()} companies ${region}`;

        const scriptPath = path.join(process.env.LEAD_SCRAPER_PATH || "C:\\Users\\lucky\\lead-scraper", "scraper.py");
        const pythonBin =
          process.env.PYTHON_BIN || "C:\\Users\\lucky\\AppData\\Local\\Programs\\Python\\Python313\\python.exe";

        const args = [scriptPath, "--query", query, "--location", region, "--max", String(max)];
        const proc = spawn(pythonBin, args, { cwd: path.dirname(scriptPath), env: { ...process.env } });

        let stdoutBuf = "";
        proc.stdout.on("data", (chunk: Buffer) => {
          const text = chunk.toString();
          stdoutBuf += text;
          send({ type: "stdout", msg: text });
        });
        proc.stderr.on("data", (chunk: Buffer) => {
          send({ type: "stderr", msg: chunk.toString() });
        });

        proc.on("error", (err) => {
          send({ type: "error", msg: `Failed to start scraper: ${err.message}\n` });
          controller.close();
        });

        proc.on("close", async () => {
          try {
            const scraped = parseScraperOutput(stdoutBuf);
            const existingEmails = new Set(
              existingLeads.map((l) => l.email?.toLowerCase()).filter(Boolean)
            );
            const existingIds = new Set<string>(existingLeads.map((l) => l.lead_id));

            const fresh = scraped.filter(
              (l) => l.email && l.email.includes("@") && !existingEmails.has(l.email.toLowerCase())
            );
            send({
              type: "stdout",
              msg: `\nFound ${scraped.length} businesses, ${fresh.length} new (with email, not already a lead).\nWriting cold-call prep notes...\n`,
            });

            const today = new Date().toISOString().split("T")[0];
            let inserted = 0;
            const insertedRows: ScrapedLead[] = [];
            for (const lead of fresh) {
              let notes = "";
              try {
                notes = await generateColdCallPrep({
                  company: lead.name,
                  trade,
                  location: `${region} NZ`,
                  website: lead.website || null,
                  facebook: lead.facebook || null,
                });
              } catch {
                // leave notes blank — still worth saving the lead
              }

              const leadId = generateLeadId(lead.name, existingIds);
              existingIds.add(leadId);

              const row = {
                lead_id: leadId,
                company: lead.name,
                contact_name: "there",
                email: lead.email.toLowerCase(),
                trade,
                location: `${region} NZ`,
                status: "not_contacted",
                date_added: today,
                date_contacted: null,
                last_followup: null,
                followup_count: 0,
                notes,
                source: "cold_call",
                website: lead.website || null,
                facebook: lead.facebook || null,
                personalization_hook: null,
                phone: lead.phone || null,
              };
              const { error } = await sb.from("leads").insert(row);
              if (!error) {
                inserted++;
                insertedRows.push(lead);
                existingEmails.add(lead.email.toLowerCase());
                send({ type: "stdout", msg: `  Saved ${lead.name} to the call queue.\n` });
              } else {
                send({ type: "stderr", msg: `  Could not save ${lead.name}: ${error.message}\n` });
              }
            }

            if (insertedRows.length > 0) {
              const sheetTitle = `${region} ${trade}`;
              try {
                const sheetId = await createLeadSheet(sheetTitle, folderId);
                const sheetRows = insertedRows.map((l) => [l.name, l.phone || "", l.email || "", l.website || "", l.facebook || "", "", "", "", ""]);
                await appendToSheet(sheetId, "A2", sheetRows);
                await sb.from("tracked_sheets").insert({
                  sheet_id: sheetId,
                  trade_default: trade,
                  location_default: `${region} NZ`,
                  personalize: false,
                  send_fresh: false,
                  active: true,
                });
                send({ type: "stdout", msg: `Created sheet "${sheetTitle}" in the Email Outreach folder and registered it for daily sync.\n` });
              } catch (e) {
                send({ type: "stderr", msg: `Could not create/sync the Drive sheet (leads are still saved to the queue): ${e instanceof Error ? e.message : String(e)}\n` });
              }
            }

            send({ type: "done", code: 0, msg: `\nDone — ${inserted} new prospect(s) added to the call queue.\n` });
          } catch (e) {
            send({ type: "error", msg: `Error while saving prospects: ${e instanceof Error ? e.message : String(e)}\n` });
          } finally {
            controller.close();
          }
        });
      } catch (e) {
        send({ type: "error", msg: `Error: ${e instanceof Error ? e.message : String(e)}\n` });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
