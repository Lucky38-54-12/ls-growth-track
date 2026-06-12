const TRADE_KEYWORDS: { match: RegExp; label: string }[] = [
  { match: /plumb/i, label: "Plumbing" },
  { match: /electric/i, label: "Electrical" },
  { match: /roof/i, label: "Roofing" },
  { match: /paint/i, label: "Painting" },
  { match: /landscap/i, label: "Landscaping" },
  { match: /window clean/i, label: "Window Cleaning" },
  { match: /clean/i, label: "Cleaning" },
  { match: /builder|building|construction/i, label: "Building" },
  { match: /carpentr|joiner|cabinet/i, label: "Carpentry" },
  { match: /floor|tiling|tiler/i, label: "Flooring" },
  { match: /plaster/i, label: "Plastering" },
  { match: /scaffold/i, label: "Scaffolding" },
  { match: /glaz/i, label: "Glazing" },
  { match: /fenc/i, label: "Fencing" },
  { match: /concrete/i, label: "Concrete" },
  { match: /gutter/i, label: "Gutter Cleaning" },
  { match: /drainage|drain/i, label: "Drainage" },
  { match: /heat pump|hvac|air condition/i, label: "HVAC" },
  { match: /tree (service|surgeon|removal)/i, label: "Tree Services" },
  { match: /lawn ?mow|lawn care/i, label: "Lawn Care" },
  { match: /garden/i, label: "Gardening" },
  { match: /pest control|pest/i, label: "Pest Control" },
  { match: /pool/i, label: "Pool Services" },
  { match: /solar/i, label: "Solar" },
  { match: /locksmith/i, label: "Locksmith" },
  { match: /remov(al|ist)|moving/i, label: "Removals" },
  { match: /demolition/i, label: "Demolition" },
  { match: /excavat/i, label: "Excavation" },
  { match: /pav(e|ing)/i, label: "Paving" },
  { match: /deck/i, label: "Decking" },
  { match: /insulation/i, label: "Insulation" },
  { match: /pressure wash|water blast/i, label: "Pressure Washing" },
  { match: /security|alarm/i, label: "Security" },
  { match: /mechanic|automotive|panel ?beat/i, label: "Automotive" },
  { match: /signage|sign writ/i, label: "Signage" },
  { match: /upholster/i, label: "Upholstery" },
  { match: /carpet/i, label: "Carpet" },
  { match: /curtain|blind/i, label: "Curtains & Blinds" },
  { match: /kitchen/i, label: "Kitchens" },
  { match: /renovat/i, label: "Renovations" },
  { match: /handyman/i, label: "Handyman" },
];

const LOCATIONS = [
  "Auckland", "Wellington", "Christchurch", "Hamilton", "Tauranga", "Napier", "Hastings",
  "Dunedin", "Palmerston North", "Nelson", "Rotorua", "New Plymouth", "Whangarei",
  "Invercargill", "Whanganui", "Gisborne", "Queenstown", "Timaru", "Taupo", "Masterton",
  "Levin", "Blenheim", "Ashburton", "Cambridge", "Pukekohe", "Albany", "North Shore",
  "Manukau", "Waitakere", "Sydney", "Melbourne", "Brisbane", "Perth", "Adelaide",
  "Gold Coast", "Canberra", "Newcastle", "Wollongong", "Geelong", "Hobart", "Darwin",
  "Cairns", "Townsville", "Sunshine Coast",
];

export interface ParsedLead {
  company: string;
  contact_name: string;
  email: string;
  trade: string;
  location: string;
}

export function parseLeadText(raw: string): ParsedLead {
  const text = raw.trim();
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const emailMatch = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  const email = emailMatch ? emailMatch[0].toLowerCase() : "";

  let contact_name = "";
  const contactMatch = text.match(
    /\b(?:owner|contact|manager|director|founder)s?\s*[:\-]\s*([A-Za-z][A-Za-z'.-]*)/i
  );
  if (contactMatch) contact_name = contactMatch[1];

  let trade = "";
  for (const { match, label } of TRADE_KEYWORDS) {
    if (match.test(text)) {
      trade = label;
      break;
    }
  }

  let location = "";
  for (const city of LOCATIONS) {
    if (new RegExp(`\\b${city}\\b`, "i").test(text)) {
      location = city;
      break;
    }
  }
  if (location) {
    if (/\bNZ\b|New Zealand/i.test(text)) location += " NZ";
    else if (/\bAU\b|Australia/i.test(text)) location += " AU";
  }

  let company = "";
  for (const line of lines) {
    if (/^(owner|contact|manager|director|founder|phone|email|website|address)\s*[:\-]/i.test(line)) continue;

    // Google Maps / directory pastes often put the company name, phone,
    // email and website all on one tab (or multi-space) separated line —
    // take the first field rather than discarding the whole line.
    const firstField = line.split(/\t|\s{2,}/)[0].trim().replace(/^["']+|["']+$/g, "");
    if (!firstField) continue;
    if (/^https?:\/\//i.test(firstField)) continue;
    if (/@/.test(firstField)) continue;
    if (/^[+\d\s()-]{4,}$/.test(firstField)) continue;

    company = firstField;
    break;
  }

  return { company, contact_name, email, trade, location };
}
