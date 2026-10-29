import type { Metadata } from "next";
import { SettingsView } from "@/components/settings-view";
import { requireShop } from "@/lib/auth";

export const metadata: Metadata = { title: "Settings" };
export default async function SettingsPage() {
  const { shop, membership } = await requireShop();
  return <SettingsView shop={shop} role={membership.role} />;
}
