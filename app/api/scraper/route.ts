import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";

export const dynamic = "force-dynamic";

// POST /api/scraper — runs the Python scraper and streams stdout/stderr back as SSE.
// Body: { query: string, location: string, max: number, sheetId?: string }
//
// Only works when running locally (dev server). The Python scraper launches a
// visible Chromium browser — it cannot run on Vercel's serverless functions.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { query, location, max = 50, sheetId = "" } = body;

  if (!query || !location) {
    return NextResponse.json({ error: "query and location are required" }, { status: 400 });
  }

  const scriptPath = path.join(
    process.env.LEAD_SCRAPER_PATH || "C:\\Users\\lucky\\lead-scraper",
    "scraper.py"
  );

  const args = [
    scriptPath,
    "--query", query,
    "--location", location,
    "--max", String(Math.max(1, Math.min(Number(max), 200))),
    ...(sheetId ? ["--sheet-id", sheetId] : []),
  ];

  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();

      function send(payload: object) {
        controller.enqueue(enc.encode(`data: ${JSON.stringify(payload)}\n\n`));
      }

      send({ type: "start", msg: `Starting scraper: "${query}" in "${location}" (max ${max})...\n` });

      const pythonBin =
        process.env.PYTHON_BIN ||
        "C:\\Users\\lucky\\AppData\\Local\\Programs\\Python\\Python313\\python.exe";

      const proc = spawn(pythonBin, args, {
        cwd: path.dirname(scriptPath),
        env: { ...process.env },
      });

      proc.stdout.on("data", (chunk: Buffer) => {
        send({ type: "stdout", msg: chunk.toString() });
      });

      proc.stderr.on("data", (chunk: Buffer) => {
        send({ type: "stderr", msg: chunk.toString() });
      });

      proc.on("error", (err) => {
        send({ type: "error", msg: `Failed to start scraper: ${err.message}\n` });
        controller.close();
      });

      proc.on("close", (code) => {
        send({ type: "done", code: code ?? 0 });
        controller.close();
      });
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
