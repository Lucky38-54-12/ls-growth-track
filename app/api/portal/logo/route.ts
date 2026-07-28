import { createSupabaseClient } from "@/lib/supabase";
import { CLIENT_COOKIE_NAME, verifyClientSessionToken } from "@/lib/leadQual/clientAuth";
import { Jimp, JimpMime } from "jimp";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Client logos pulled from Facebook Pages often sit on a solid dark/black
// square canvas (see lib/leadQual/meta.ts) — this strips that out to
// transparency so the logo reads as a mark on the portal's own background
// instead of a black box. Soft-edged (a threshold band, not a hard cutoff)
// to avoid jagged pixel edges around the mark itself.
const FULLY_TRANSPARENT_BELOW = 20;
const FULLY_OPAQUE_ABOVE = 70;

export async function GET(request: NextRequest) {
  const token = request.cookies.get(CLIENT_COOKIE_NAME)?.value;
  const clientId = token ? await verifyClientSessionToken(token) : null;
  if (!clientId) return new NextResponse("Unauthorized", { status: 401 });

  const sb = createSupabaseClient();
  const { data: client } = await sb.from("lq_clients").select("logo_url").eq("id", clientId).single();
  if (!client?.logo_url) return new NextResponse("No logo", { status: 404 });

  try {
    const sourceRes = await fetch(client.logo_url);
    if (!sourceRes.ok) throw new Error(`source fetch failed: ${sourceRes.status}`);
    const buf = Buffer.from(await sourceRes.arrayBuffer());
    const image = await Jimp.read(buf);

    image.scan(0, 0, image.bitmap.width, image.bitmap.height, (_x, _y, idx) => {
      const data = image.bitmap.data;
      const brightness = Math.max(data[idx], data[idx + 1], data[idx + 2]);
      if (brightness <= FULLY_TRANSPARENT_BELOW) {
        data[idx + 3] = 0;
      } else if (brightness < FULLY_OPAQUE_ABOVE) {
        const t = (brightness - FULLY_TRANSPARENT_BELOW) / (FULLY_OPAQUE_ABOVE - FULLY_TRANSPARENT_BELOW);
        data[idx + 3] = Math.round(data[idx + 3] * t);
      }
    });

    const outBuf = await image.getBuffer(JimpMime.png);
    return new NextResponse(new Uint8Array(outBuf), {
      headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" },
    });
  } catch {
    // Source fetch/decode failed (e.g. the Facebook CDN URL expired) —
    // fall back to the raw logo rather than showing nothing at all.
    return NextResponse.redirect(client.logo_url);
  }
}
