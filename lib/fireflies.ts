const FIREFLIES_API_URL = "https://api.fireflies.ai/graphql";

interface FirefliesSentence {
  speaker_name: string | null;
  text: string;
}

interface FirefliesTranscriptResponse {
  data?: {
    transcript?: {
      title: string;
      sentences: FirefliesSentence[];
    } | null;
  };
  errors?: { message: string }[];
}

// Fireflies' webhook only tells us a meeting finished transcribing — the
// actual transcript has to be pulled separately via their GraphQL API so we
// get real speaker-attributed text to feed parseCallSummary(), the same
// shape it already expects from a manually pasted notetaker summary.
export async function getTranscript(meetingId: string): Promise<{ title: string; text: string }> {
  const apiKey = process.env.FIREFLIES_API_KEY;
  if (!apiKey) throw new Error("FIREFLIES_API_KEY is not configured.");

  const res = await fetch(FIREFLIES_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query: `query Transcript($id: String!) {
        transcript(id: $id) {
          title
          sentences { speaker_name text }
        }
      }`,
      variables: { id: meetingId },
    }),
  });

  if (!res.ok) throw new Error(`Fireflies API returned ${res.status}`);
  const json = (await res.json()) as FirefliesTranscriptResponse;
  if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join("; "));
  const transcript = json.data?.transcript;
  if (!transcript) throw new Error("Fireflies returned no transcript for this meeting.");

  const text = transcript.sentences.map((s) => `${s.speaker_name || "Speaker"}: ${s.text}`).join("\n");
  return { title: transcript.title, text };
}
