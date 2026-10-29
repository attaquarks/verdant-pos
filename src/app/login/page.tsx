import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthView } from "@/components/auth-view";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Sign in" };
export default function LoginPage() {
  if (!isSupabaseConfigured()) redirect("/setup");
  return <AuthView mode="login" />;
}
