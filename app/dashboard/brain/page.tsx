import { createSupabaseClient } from "@/lib/supabase";
import { getPendingChatDrafts } from "@/lib/chatDrafts";
import Topbar from "@/components/Topbar";
import BrainChat from "./BrainChat";

export const revalidate = 0;

export default async function BrainPage() {
  const sb = createSupabaseClient();
  const initialDrafts = await getPendingChatDrafts(sb);

  return (
    <div style={{ background: "#f1f5f9", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <Topbar title="Brain" subtitle="Ask about the business, get things drafted for your approval" />
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", padding: "20px 28px" }}>
        <BrainChat initialDrafts={initialDrafts} />
      </div>
    </div>
  );
}
