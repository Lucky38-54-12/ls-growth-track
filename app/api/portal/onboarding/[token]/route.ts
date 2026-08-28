import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient } from "@/lib/supabase";
import { verifyOnboardingPortalToken } from "@/lib/onboardingPortalAuth";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const clientId = await verifyOnboardingPortalToken(params.token);
  if (!clientId) return NextResponse.json({ error: "This link has expired." }, { status: 401 });

  const sb = createSupabaseClient();
  const { data, error } = await sb
    .from("onboarding_clients")
    .select("company, name, services, ad_budget, business_manager_id, portal_photos_folder_url, client_intake_submitted_at")
    .eq("id", clientId)
    .single();
  if (error || !data) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest, { params }: { params: { token: string } }) {
  const clientId = await verifyOnboardingPortalToken(params.token);
  if (!clientId) return NextResponse.json({ error: "This link has expired." }, { status: 401 });

  const body = await req.json();
  const updates: Record<string, unknown> = { client_intake_submitted_at: new Date().toISOString() };
  if (Array.isArray(body.services)) updates.services = body.services.filter((s: unknown) => typeof s === "string" && s.trim());
  if (typeof body.ad_budget === "string") updates.ad_budget = body.ad_budget;
  if (typeof body.business_manager_id === "string") updates.business_manager_id = body.business_manager_id;

  const sb = createSupabaseClient();
  const { error } = await sb.from("onboarding_clients").update(updates).eq("id", clientId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
