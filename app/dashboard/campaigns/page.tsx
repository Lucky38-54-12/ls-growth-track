import { redirect } from "next/navigation";

export default function CampaignsRedirect() {
  redirect("/dashboard/email-outreach?tab=campaigns");
}
