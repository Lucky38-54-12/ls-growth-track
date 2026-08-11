import { redirect } from "next/navigation";

export default function EmailPipelineRedirect({ searchParams }: { searchParams: { campaign?: string } }) {
  const suffix = searchParams?.campaign ? `?campaign=${encodeURIComponent(searchParams.campaign)}` : "?tab=pipeline";
  redirect(`/dashboard/email-outreach${suffix}`);
}
