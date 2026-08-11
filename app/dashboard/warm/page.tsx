import { redirect } from "next/navigation";

export default function EmailTrackingRedirect() {
  redirect("/dashboard/email-outreach?tab=personal");
}
