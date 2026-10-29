import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OnboardingView } from "@/components/onboarding-view";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Create your shop" };
export default async function OnboardingPage() {
  const { shop, membership } = await requireUser();
  if (membership && !membership.is_active) redirect("/access-revoked");
  if (shop) redirect("/");
  return <OnboardingView />;
}
