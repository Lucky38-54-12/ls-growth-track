import { CLIENT_COOKIE_NAME } from "@/lib/leadQual/clientAuth";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(CLIENT_COOKIE_NAME, "", { maxAge: 0, path: "/" });
  return response;
}
