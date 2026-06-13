import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const TRADES: Record<string, string> = {
  plumbing: "Plumbing",
  plumber: "Plumbing",
  electrical: "Electrical",
  electrician: "Electrical",
  cleaning: "Cleaning",
  cleaner: "Cleaning",
  landscaping: "Landscaping",
  gardening: "Gardening",
  builder: "Building",
  building: "Building",
  roofing: "Roofing",
  roofer: "Roofing",
  painting: "Painting",
  painter: "Painting",
  carpentry: "Carpentry",
  carpenter: "Carpentry",
  tiling: "Tiling",
  tiler: "Tiling",
  flooring: "Flooring",
  "pest control": "Pest Control",
  scaffolding: "Scaffolding",
  concrete: "Concrete",
  fencing: "Fencing",
  glazing: "Glazing",
  locksmith: "Locksmith",
  removals: "Removals",
  "gutter": "Gutter Cleaning",
  "lawn mowing": "Lawn Mowing",
  "heat pump": "Heat Pumps",
  hvac: "HVAC",
};

const LOCATIONS = [
  "Auckland", "Wellington", "Christchurch", "Hamilton", "Tauranga", "Dunedin",
  "Queenstown", "Rotorua", "Napier", "Hastings", "Nelson", "Palmerston North",
  "New Plymouth", "Whangarei", "Invercargill", "Gisborne", "Whanganui", "Timaru",
  "New Zealand", "NZ",
];

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function extractCompany(notes: string) {
  const firstLine = notes.split("\n")[0] || "";
  const segments = firstLine.split(/\s{2,}|\t/).map((s) => s.trim()).filter(Boolean);
  for (const seg of segments) {
    if (!seg.includes("@") && !/^https?:\/\//i.test(seg) && !/^["'+\d]/.test(seg) && seg.length > 1) {
      return seg.replace(/^["']|["']$/g, "");
    }
  }
  return "";
}

function extractContactName(notes: string) {
  const match = notes.match(/\b(?:spoke (?:to|with)|talked to|chatted with|chat(?:ted)? with|got onto|got through to|speaking with)\s+([A-Z][a-zA-Z]+)/i);
  return match ? match[1] : "";
}

function extractEmail(notes: string) {
  const match = notes.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  return match ? match[0] : "";
}

function extractTrade(notes: string) {
  const lower = notes.toLowerCase();
  for (const [keyword, label] of Object.entries(TRADES)) {
    if (lower.includes(keyword)) return label;
  }
  return "";
}

function extractLocation(notes: string) {
  for (const loc of LOCATIONS) {
    if (notes.toLowerCase().includes(loc.toLowerCase())) return loc;
  }
  return "";
}

function recap(notes: string) {
  const collapsed = notes.replace(/\s+/g, " ").trim();
  const truncated = collapsed.length > 400 ? `${collapsed.slice(0, 400)}…` : collapsed;
  return escapeHtml(truncated);
}

function whenPhrase(notes: string) {
  const day = notes.match(/\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
  const time = notes.match(/\b(\d{1,2}(?::\d{2})?\s?(?:am|pm))\b/i);
  return [day?.[0], time ? `at ${time[0]}` : ""].filter(Boolean).join(" ");
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { callNotes } = body;

  if (!callNotes || !callNotes.trim()) {
    return NextResponse.json({ error: "Add some call notes first." }, { status: 400 });
  }

  const company = extractCompany(callNotes);
  const contactName = extractContactName(callNotes);
  const email = extractEmail(callNotes);
  const trade = extractTrade(callNotes);
  const location = extractLocation(callNotes);
  const name = contactName || "there";
  const notesRecap = recap(callNotes);

  const day = callNotes.match(/\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
  const time = callNotes.match(/\b(\d{1,2}(?::\d{2})?\s?(?:am|pm))\b/i);
  const meetingBooked = (day && time) || /\b(meeting booked|call booked|booked (a|the) (call|meeting|chat))\b/i.test(callNotes);
  const sendInfo = /\b(send|flick|email (through|over|across)|pricing|quote|proposal|brochure|information)\b/i.test(callNotes);

  let subject: string;
  let bodyHtml: string;

  if (meetingBooked) {
    const when = whenPhrase(callNotes) || "soon";
    subject = `Catch-up ${when}, quick link inside`;
    bodyHtml = `<p>Hey ${name},</p>
<p>Looking forward to our chat ${when}. Here's the link to join:</p>
<p>[MEETING LINK]</p>
<p>Quick recap of what we covered: "${notesRecap}"</p>
<p>Should take about 20 to 30 minutes, let me know if you need to shift the time.</p>`;
  } else if (sendInfo) {
    subject = company ? `Following up, ${company}` : "Following up";
    bodyHtml = `<p>Hey ${name},</p>
<p>Thanks for the chat earlier. As promised, here's a quick recap and I'll get the rest over to you shortly:</p>
<p>"${notesRecap}"</p>
<p>In the meantime, feel free to reply with any questions, or grab a <a href="{{CTA_LINK}}">quick chat</a> if it's easier to talk through.</p>`;
  } else {
    subject = company ? `Good to chat, ${company}` : "Good to chat earlier";
    bodyHtml = `<p>Hey ${name},</p>
<p>Thanks for the chat earlier. Here's a quick recap of where we left things:</p>
<p>"${notesRecap}"</p>
<p>Worth a <a href="{{CTA_LINK}}">quick chat</a> about it this week?</p>`;
  }

  return NextResponse.json({ company, contact_name: contactName, email, trade, location, subject, bodyHtml });
}
