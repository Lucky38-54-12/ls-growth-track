export interface ApolloPersonPreview {
  // Apollo's internal person id — needed to reveal full contact details later.
  id: string;
  // Search results only ever return a masked last name (e.g. "Du***a") —
  // full name only comes back after a reveal, which spends an Apollo credit.
  firstName: string;
  lastNameMasked: string | null;
  title: string | null;
  company: string | null;
  hasEmail: boolean;
  hasDirectPhone: boolean;
}

export interface ApolloSearchInput {
  // Free-text job title match, e.g. "owner", "franchise owner"
  personTitles?: string[];
  // Free-text company/industry keyword, e.g. "cleaning franchise"
  organizationKeywords?: string;
  locations?: string[];
  perPage?: number;
}

// Apollo's People Search API — used to source prospects for cold outreach
// (see the "find 5 cleaning franchise owners" validation plan) instead of
// manually browsing Apollo's UI and copy-pasting rows. This only returns
// masked previews (no email/phone/full name) — that's Apollo's own design,
// not a limitation here: revealing real contact info is a separate,
// credit-metered call (see revealApolloPerson) so a search never spends
// credits by itself, only an explicit reveal does.
export async function searchApolloPeople(input: ApolloSearchInput): Promise<ApolloPersonPreview[]> {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error("APOLLO_API_KEY env var is not set");

  const body: Record<string, unknown> = {
    per_page: input.perPage || 10,
  };
  if (input.personTitles?.length) body.person_titles = input.personTitles;
  if (input.organizationKeywords) body.q_organization_keyword_tags = [input.organizationKeywords];
  if (input.locations?.length) body.person_locations = input.locations;

  const res = await fetch("https://api.apollo.io/api/v1/mixed_people/api_search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
      "x-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Apollo search failed: ${res.status} ${text}`);
  }

  const json = await res.json();
  const people = (json.people || []) as any[];

  return people.map((p) => ({
    id: p.id,
    firstName: p.first_name || "Unknown",
    lastNameMasked: p.last_name_obfuscated || null,
    title: p.title || null,
    company: p.organization?.name || null,
    hasEmail: Boolean(p.has_email),
    hasDirectPhone: p.has_direct_phone === "Yes",
  }));
}

export interface ApolloRevealedPerson {
  name: string;
  title: string | null;
  company: string | null;
  linkedin_url: string | null;
  email: string | null;
  location: string | null;
}

// Reveals full contact details for one previously-searched person — this is
// the call that actually spends an Apollo credit, so it's only ever fired
// per-person on explicit user action, never automatically for a whole
// search result page.
export async function revealApolloPerson(id: string): Promise<ApolloRevealedPerson> {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error("APOLLO_API_KEY env var is not set");

  const res = await fetch("https://api.apollo.io/api/v1/people/match", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({ id, reveal_personal_emails: false }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Apollo reveal failed: ${res.status} ${text}`);
  }

  const json = await res.json();
  const p = json.person || {};

  return {
    name: [p.first_name, p.last_name].filter(Boolean).join(" ") || "Unknown",
    title: p.title || null,
    company: p.organization?.name || null,
    linkedin_url: p.linkedin_url || null,
    email: p.email && p.email !== "email_not_unlocked@domain.com" ? p.email : null,
    location: [p.city, p.state, p.country].filter(Boolean).join(", ") || null,
  };
}
