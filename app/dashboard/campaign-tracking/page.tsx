import { redirect } from "next/navigation";

export default function CampaignTrackingRedirect() {
  redirect("/dashboard/email-outreach?tab=activity");
}
