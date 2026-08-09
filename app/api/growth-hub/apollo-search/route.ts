import { searchApolloPeople } from "@/lib/apollo";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Admin-only — gated by the regular admin session cookie via middleware.ts.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  try {
    const results = await searchApolloPeople({
      personTitles: Array.isArray(body.personTitles) ? body.personTitles : undefined,
      organizationKeywords: body.organizationKeywords || undefined,
      locations: Array.isArray(body.locations) ? body.locations : undefined,
      perPage: body.perPage,
    });
    return NextResponse.json({ results });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Apollo search failed" }, { status: 400 });
  }
}
