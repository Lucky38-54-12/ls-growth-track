import { NextResponse } from "next/server";
import { sendReminderEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let to: string, subject: string, body: string;
  try {
    ({ to, subject, body } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (!to || !subject || !body) {
    return NextResponse.json({ error: "Missing to, subject, or body" }, { status: 400 });
  }
  try {
    await sendReminderEmail(to, subject, body);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
