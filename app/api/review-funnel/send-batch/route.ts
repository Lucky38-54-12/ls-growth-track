import { createSupabaseClient } from "@/lib/supabase";
import { sendReviewRequestEmail } from "@/lib/email";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.lsgrowth.agency";

interface BatchCustomer {
  name: string;
  email: string;
  job?: string;
}

// Behind the dashboard session cookie. Takes a slug + a list of past/
// completed-job customers (pasted in from the dashboard UI), logs one
// review_funnel_sends row per customer, and fires the initial "how'd we
// go?" email for each — this is the one-shot way to catch up a client's
// whole backlog instead of waiting on new jobs to trickle in one at a time.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const slug = body?.slug as string | undefined;
  const customers = body?.customers as BatchCustomer[] | undefined;

  if (!slug || !Array.isArray(customers) || customers.length === 0) {
    return NextResponse.json({ error: "slug and a non-empty customers array are required" }, { status: 400 });
  }

  const sb = createSupabaseClient();
  const { data: client, error } = await sb
    .from("review_funnel_clients")
    .select("id, slug, business_name, owner_email")
    .eq("slug", slug)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!client) return NextResponse.json({ error: "not found" }, { status: 404 });

  const results: { email: string; ok: boolean; error?: string }[] = [];

  for (const c of customers) {
    if (!c.email) { results.push({ email: c.email || "(blank)", ok: false, error: "missing email" }); continue; }
    try {
      const { data: send, error: sendErr } = await sb
        .from("review_funnel_sends")
        .insert({ review_funnel_client_id: client.id, customer_name: c.name || null, customer_email: c.email, job_description: c.job || null })
        .select("id")
        .single();
      if (sendErr || !send) throw new Error(sendErr?.message || "insert failed");

      const reviewLink = `${APP_URL}/review/${client.slug}?s=${send.id}`;
      await sendReviewRequestEmail({
        to: c.email,
        businessName: client.business_name,
        ownerEmail: client.owner_email,
        customerName: c.name || "",
        jobDescription: c.job || null,
        reviewLink,
      });
      results.push({ email: c.email, ok: true });
    } catch (err) {
      results.push({ email: c.email, ok: false, error: err instanceof Error ? err.message : "send failed" });
    }
  }

  return NextResponse.json({ results });
}
