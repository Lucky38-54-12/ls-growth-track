import Anthropic from "@anthropic-ai/sdk";
import { BrainAttachment } from "./brainAttachments";

type ContentBlock = Anthropic.Messages.ImageBlockParam | Anthropic.Messages.DocumentBlockParam;

const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

// Anthropic only accepts a URL source directly for PDFs and images — a plain
// text file (txt/md/csv/json) has no URL source type, so it's fetched here
// and inlined as a text document source instead.
async function textAttachmentBlock(attachment: BrainAttachment): Promise<ContentBlock> {
  const res = await fetch(attachment.url);
  if (!res.ok) throw new Error(`Could not fetch attachment "${attachment.name}"`);
  const text = await res.text();
  return {
    type: "document",
    title: attachment.name,
    source: { type: "text", media_type: "text/plain", data: text.slice(0, 150000) },
  };
}

export async function buildAttachmentBlocks(attachments: BrainAttachment[]): Promise<ContentBlock[]> {
  return Promise.all(
    attachments.map((a): Promise<ContentBlock> | ContentBlock => {
      if (a.mediaType === "application/pdf") {
        return { type: "document", title: a.name, source: { type: "url", url: a.url } };
      }
      if (IMAGE_TYPES.has(a.mediaType)) {
        return { type: "image", source: { type: "url", url: a.url } };
      }
      return textAttachmentBlock(a);
    })
  );
}
