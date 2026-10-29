// Reference list for the onboarding call: what to ask a client for, by
// trade, so "send us some creatives" becomes a concrete, specific list
// instead of something they never get round to. Keyed loosely off
// lib/prospecting.ts TRADES — matched case-insensitively, falls back to
// GENERIC_ASKS for anything not listed (new trade, or typed free text).

export const CREATIVE_ASK_EXAMPLES: Record<string, string[]> = {
  "Builders": [
    "Photos and short video clips of completed projects, from a few different jobs",
    "Before and after photos of the same job (same angle if possible)",
    "A short video of them talking to camera — \"Hey, I'm [name], I'm from [company]\" — showcasing their work",
    "A short customer testimonial, video or even just a text quote",
    "A couple of photos of the team on site (trucks, signage, people working)",
  ],
  "Renovations": [
    "Before and after photos of a completed renovation, same angle",
    "Progress photos/video through a job, start to finish",
    "A customer testimonial, video or written quote",
    "Photos of finishing details (tiling, joinery, paint) close up",
  ],
  "Cleaning": [
    "Before and after photos of a clean (same room, same angle)",
    "Short video of the team actually cleaning",
    "A customer testimonial or a screenshot of a good review",
    "Photos of the team/van with branding visible",
  ],
  "Roofing": [
    "Before and after roof photos",
    "Drone shots of the roof, if available",
    "Job-in-progress photos (on the roof, mid-job)",
    "A customer testimonial, video or written quote",
  ],
  "Plumbing": [
    "Before and after photos of a job (leak fixed, bathroom installed, etc.)",
    "Short clip of a job in progress or the van arriving",
    "A customer testimonial, video or written quote",
    "Photos of the team/van with branding visible",
  ],
  "Electrical": [
    "Before and after photos of a job (switchboard, wiring, install)",
    "Short clip of a job in progress",
    "A customer testimonial, video or written quote",
    "Photos of the team/van with branding visible",
  ],
  "Landscaping": [
    "Before and after yard/garden photos, same angle",
    "Drone shots or a time-lapse of a job, if they've got one",
    "A customer testimonial, video or written quote",
    "Photos of the team working on site",
  ],
  "Painting": [
    "Before and after photos of a paint job, same angle",
    "A quick time-lapse or progress clip of a job",
    "A customer testimonial, video or written quote",
    "Close-up photos of finish quality",
  ],
  "Removals": [
    "Video or photos of the team loading/unloading a truck",
    "Photos of the trucks/team with branding visible",
    "A customer testimonial, video or written quote",
  ],
  "Pest Control": [
    "Photos of a technician at work on site",
    "Before and after photos, if there's anything visual to show",
    "A customer testimonial, video or written quote",
    "Photos of the team/van with branding visible",
  ],
  "Floor Coatings": [
    "Before and after floor photos, same angle",
    "Close-up shots of the finish",
    "A customer testimonial, video or written quote",
    "Progress photos/video of a job",
  ],
  "Fencing": [
    "Before and after fence photos, same angle",
    "Job-in-progress photos",
    "A customer testimonial, video or written quote",
  ],
};

export const GENERIC_CREATIVE_ASKS = [
  "Before and after photos of a job, same angle if possible",
  "Photos or short video clips of the team actually working",
  "A customer testimonial, video or even just a written quote",
  "Logo and any branding (truck signage, uniform, etc.)",
];

export function creativeAsksFor(trade: string | null | undefined): string[] {
  if (!trade) return GENERIC_CREATIVE_ASKS;
  const match = Object.keys(CREATIVE_ASK_EXAMPLES).find(
    (t) => t.toLowerCase() === trade.toLowerCase()
  );
  return match ? CREATIVE_ASK_EXAMPLES[match] : GENERIC_CREATIVE_ASKS;
}
