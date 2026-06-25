import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, SESSION_DURATION_MS, createSessionToken } from "@/lib/session";

export async function POST(req: NextRequest) {
  if (!process.env.DASHBOARD_PASSWORD) {
    return NextResponse.json({ error: "Login is not configured" }, { status: 500 });
  }

  const { password } = await req.json().catch(() => ({ password: "" }));
  if (password !== process.env.DASHBOARD_PASSWORD) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  const token = await createSessionToken();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_MS / 1000,
  });
  return res;
}
