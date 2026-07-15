export const NOTES_KEY = "notes-list";

export interface Note {
  id: string;
  text: string;
  reminderTime: string;
  createdAt: number;
}

// Shared with components/DailyNotes.tsx so other pages (e.g. the cold-call
// quick note box) can drop a note straight into the same sticky-note board
// instead of it only living on the lead record.
export function addNoteToStorage(text: string): void {
  if (typeof window === "undefined") return;
  try {
    const notes: Note[] = JSON.parse(localStorage.getItem(NOTES_KEY) || "[]");
    notes.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, text, reminderTime: "", createdAt: Date.now() });
    localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
  } catch {
    // localStorage unavailable (private browsing, etc.) — note still saved on the lead
  }
}
