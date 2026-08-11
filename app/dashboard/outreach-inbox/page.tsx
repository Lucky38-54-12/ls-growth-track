import { redirect } from "next/navigation";

export default function OutreachInboxRedirect() {
  redirect("/dashboard/email-outreach?tab=inbox");
}
