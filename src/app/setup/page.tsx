import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SetupView } from "@/components/setup-view";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Project setup" };
export default function SetupPage() {
  if (isSupabaseConfigured()) redirect("/login");
  return <SetupView />;
}
