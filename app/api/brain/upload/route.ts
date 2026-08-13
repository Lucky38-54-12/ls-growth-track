import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient } from "@/lib/supabase";
import { ALLOWED_ATTACHMENT_TYPES, MAX_ATTACHMENT_BYTES, isAllowedAttachmentType } from "@/lib/brainAttachments";

export const dynamic = "force-dynamic";

const BUCKET = "brain-attachments";
const SIGNED_URL_TTL_SECONDS = 600;

// Private bucket, not public — a signed URL good for 10 minutes is created
// per upload and only ever used server-side (Anthropic fetching the file for
// that one chat request), so nothing here is ever a publicly reachable link.
async function ensureBucket(sb: ReturnType<typeof createSupabaseClient>) {
  const { data } = await sb.storage.getBucket(BUCKET);
  if (data) return;
  await sb.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: MAX_ATTACHMENT_BYTES,
    allowedMimeTypes: [...ALLOWED_ATTACHMENT_TYPES],
  });
}

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file given." }, { status: 400 });
  }
  if (!isAllowedAttachmentType(file.type)) {
    return NextResponse.json({ error: `Unsupported file type "${file.type || "unknown"}". Attach a PDF, image, or text file.` }, { status: 400 });
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return NextResponse.json({ error: `File is too big (max ${Math.floor(MAX_ATTACHMENT_BYTES / 1024 / 1024)}MB).` }, { status: 400 });
  }

  const sb = createSupabaseClient();
  await ensureBucket(sb);

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100);
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;

  const { error: uploadError } = await sb.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { data: signed, error: signError } = await sb.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (signError || !signed) return NextResponse.json({ error: signError?.message || "Could not create a URL for the uploaded file." }, { status: 500 });

  return NextResponse.json({ url: signed.signedUrl, name: file.name, mediaType: file.type, size: file.size });
}
