import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccessRevokedView } from "@/components/access-revoked-view";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Access revoked" };
export default async function AccessRevokedPage() {
  const { user, membership } = await requireUser();
  if (!membership) redirect("/onboarding");
  if (membership.is_active) redirect("/");
  return <AccessRevokedView email={user.email || "your account"} />;
}
