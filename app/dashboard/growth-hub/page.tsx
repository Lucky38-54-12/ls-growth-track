import Topbar from "@/components/Topbar";
import { createSupabaseClient } from "@/lib/supabase";
import { ContentIdea, Prospect } from "@/lib/types";
import GrowthHubClient from "@/components/growthHub/GrowthHubClient";

export const revalidate = 0;

export default async function GrowthHubPage() {
  const sb = createSupabaseClient();

  const [{ data: ideas }, { data: prospects }] = await Promise.all([
    sb.from("content_ideas").select("*").order("post_date", { ascending: true }),
    sb.from("prospects").select("*").order("created_at", { ascending: false }),
  ]);

  return (
    <div>
      <Topbar title="Growth Hub" subtitle="LinkedIn content & Apollo prospecting" />
      <div style={{ padding: "20px 28px 60px" }}>
        <GrowthHubClient
          initialIdeas={(ideas || []) as ContentIdea[]}
          initialProspects={(prospects || []) as Prospect[]}
        />
      </div>
    </div>
  );
}
