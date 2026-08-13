// Shared between the client (BrainChat.tsx, validates before upload) and the
// server (upload route, validates again — never trust the client alone).
export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024; // Vercel serverless functions cap request bodies around 4.5MB, so uploads stay comfortably under that.
export const MAX_ATTACHMENTS_PER_MESSAGE = 5;

export const ALLOWED_ATTACHMENT_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
] as const;

export type AllowedAttachmentType = (typeof ALLOWED_ATTACHMENT_TYPES)[number];

export function isAllowedAttachmentType(type: string): type is AllowedAttachmentType {
  return (ALLOWED_ATTACHMENT_TYPES as readonly string[]).includes(type);
}

export interface BrainAttachment {
  url: string;
  name: string;
  mediaType: string;
}
