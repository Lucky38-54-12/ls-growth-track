import { buildFacebookAuthUrl } from "@/lib/leadQual/facebookOAuth";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get("clientId");
  if (!clientId) {
    return NextResponse.json({ error: "clientId query param is required" }, { status: 400 });
  }
  return NextResponse.redirect(buildFacebookAuthUrl(clientId));
}
