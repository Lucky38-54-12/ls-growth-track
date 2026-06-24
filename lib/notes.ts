export interface NoteEntry {
  label: string;
  text: string;
}

// Notes accumulate as "[label] text" blocks, one per line, appended over time
// by both manual call logging (followup/route.ts) and the sheet sync
// (sheetSync.ts) — the same outcome often gets logged by both, so the raw
// field ends up with two near-identical blobs back to back. Split into
// entries so the UI can show just the most recent one instead of the whole
// pile.
export function parseNoteEntries(notes: string | null | undefined): NoteEntry[] {
  if (!notes?.trim()) return [];
  const lines = notes.split("\n").map((l) => l.trim()).filter(Boolean);
  const entries: NoteEntry[] = [];
  for (const line of lines) {
    const match = line.match(/^\[([^\]]+)\]\s*(.*)$/);
    if (match) {
      entries.push({ label: match[1], text: match[2] });
    } else if (entries.length) {
      entries[entries.length - 1].text += " " + line;
    } else {
      entries.push({ label: "", text: line });
    }
  }
  return entries;
}

// Two entries logged for the same call (one manual, one sheet-synced) usually
// share one long stretch of text even though their prefixes/wording differ —
// a 30-char shared chunk is a reliable enough signal that they're duplicates.
function overlaps(a: string, b: string): boolean {
  const chunk = a.length < b.length ? a : b;
  const other = a.length < b.length ? b : a;
  if (chunk.length < 20) return false;
  return other.includes(chunk.slice(0, Math.min(40, chunk.length)));
}

// Keeps the longest entry out of any group of overlapping ones, in
// chronological order.
export function dedupeNoteEntries(entries: NoteEntry[]): NoteEntry[] {
  const kept: NoteEntry[] = [];
  for (const entry of entries) {
    const dupIndex = kept.findIndex((k) => overlaps(k.text, entry.text));
    if (dupIndex === -1) {
      kept.push(entry);
    } else if (entry.text.length > kept[dupIndex].text.length) {
      kept[dupIndex] = entry;
    }
  }
  return kept;
}

// A date like "26/06/2026" or "26/06/2026 1:30pm" — used to surface a
// detected meeting time directly on the lead card.
const MEETING_TIME_RE = /\b\d{1,2}\/\d{1,2}\/\d{4}(\s+\d{1,2}(:\d{2})?\s*[ap]m)?\b/i;

export function extractMeetingTime(entries: NoteEntry[]): string | null {
  for (const entry of entries) {
    const match = entry.text.match(MEETING_TIME_RE);
    if (match) return match[0];
  }
  return null;
}

export function cleanNotes(notes: string | null | undefined): NoteEntry[] {
  return dedupeNoteEntries(parseNoteEntries(notes));
}
