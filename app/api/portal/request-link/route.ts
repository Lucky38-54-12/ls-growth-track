import { createSupabaseClient } from "@/lib/supabase";
import { createMagicLinkToken } from "@/lib/leadQual/clientAuth";
import { sendReminderEmail } from "@/lib/email";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Public — sends a magic sign-in link to a client's own email. Callable two
// ways: with a known clientId (the "create your login" step at the end of
// onboarding, where we already know who this is) or with just an email (a
// future /portal/login page for someone returning without the original
// link). Always responds the same way regardless of whether a match was
// found, so this can't be used to enumerate which emails are registered.
export async function POST(request: NextRequest) {
  const body = await request.json();
  const clientId = typeof body.clientId === "string" ? body.clientId : null;
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : null;
  if (!clientId && !email) return NextResponse.json({ error: "clientId or email is required" }, { status: 400 });

  const sb = createSupabaseClient();
  const { data: client } = clientId
    ? await sb.from("lq_clients").select("id, name, email").eq("id", clientId).maybeSingle()
    : await sb.from("lq_clients").select("id, name, email").ilike("email", email!).maybeSingle();

  if (client?.email) {
    const token = await createMagicLinkToken(client.id);
    const link = `${process.env.APP_URL || "https://app.lsgrowth.agency"}/portal/verify?token=${encodeURIComponent(token)}`;
    await sendReminderEmail(
      client.email,
      `Your ${client.name} login link`,
      `Click below to sign in to your dashboard, no password needed.\n\n${link}\n\nThis link works for 30 minutes and can only be used once. If you didn't request this, you can ignore it.`
    );
  }
  // Same response either way — don't leak whether that email/client exists.
  return NextResponse.json({ ok: true });
}
