import { dispatchDueNurtureEmails } from "@/lib/leadQual/nurtureEmail";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await dispatchDueNurtureEmails();
  return NextResponse.json(result);
}
