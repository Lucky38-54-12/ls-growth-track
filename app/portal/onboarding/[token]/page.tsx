import { notFound } from "next/navigation";
import { createSupabaseClient } from "@/lib/supabase";
import { verifyOnboardingPortalToken } from "@/lib/onboardingPortalAuth";
import OnboardingIntakeForm from "@/components/portal/OnboardingIntakeForm";

export const revalidate = 0;

export default async function OnboardingPortalPage({ params }: { params: { token: string } }) {
  const clientId = await verifyOnboardingPortalToken(params.token);
  if (!clientId) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Arial,Helvetica,sans-serif", padding: 24, textAlign: "center" }}>
        <p style={{ fontSize: 15, color: "#475569" }}>This link has expired. Get in touch with Lucky for a fresh one.</p>
      </div>
    );
  }

  const sb = createSupabaseClient();
  const { data: client, error } = await sb
    .from("onboarding_clients")
    .select("company, name, services, ad_budget, business_manager_id, portal_photos_folder_url, client_intake_submitted_at")
    .eq("id", clientId)
    .single();
  if (error || !client) notFound();

  return (
    <div style={{ minHeight: "100vh", background: "#f1f5f9", padding: "40px 16px" }}>
      <div style={{ maxWidth: 520, margin: "0 auto" }}>
        <OnboardingIntakeForm token={params.token} client={client} />
      </div>
    </div>
  );
}
