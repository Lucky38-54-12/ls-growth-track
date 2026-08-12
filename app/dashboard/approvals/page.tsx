import { createSupabaseClient } from "@/lib/supabase";
import { getPendingChatDrafts } from "@/lib/chatDrafts";
import Topbar from "@/components/Topbar";
import ApprovalQueue from "@/components/ApprovalQueue";

export const revalidate = 0;

export default async function ApprovalsPage() {
  const sb = createSupabaseClient();
  const drafts = await getPendingChatDrafts(sb);

  return (
    <div style={{ background: "#f1f5f9", minHeight: "100vh" }}>
      <Topbar title="Approvals" subtitle="Everything the Brain has proposed — emails, lead updates, bookings, sheet edits — waiting on your decision" />
      <div style={{ padding: "20px 28px 60px", maxWidth: 900, margin: "0 auto" }}>
        <ApprovalQueue initialDrafts={drafts} emptyMessage="Nothing waiting on you right now." />
      </div>
    </div>
  );
}
