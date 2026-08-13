import { createSupabaseClient } from "@/lib/supabase";
import { getPendingChatDrafts } from "@/lib/chatDrafts";
import { getRecentLearnings } from "@/lib/brainLearnings";
import Topbar from "@/components/Topbar";
import ApprovalQueue from "@/components/ApprovalQueue";
import LearnedInsights from "@/components/LearnedInsights";

export const revalidate = 0;

export default async function ApprovalsPage() {
  const sb = createSupabaseClient();
  const [drafts, learnings] = await Promise.all([
    getPendingChatDrafts(sb),
    getRecentLearnings(sb, 100),
  ]);

  return (
    <div style={{ background: "#f1f5f9", minHeight: "100vh" }}>
      <Topbar title="Approvals" subtitle="Everything the Brain has proposed or learned — waiting on your decision or review" />
      <div style={{ padding: "20px 28px 60px", maxWidth: 900, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        <ApprovalQueue initialDrafts={drafts} emptyMessage="Nothing waiting on you right now." />
        <LearnedInsights initialLearnings={learnings} />
      </div>
    </div>
  );
}
