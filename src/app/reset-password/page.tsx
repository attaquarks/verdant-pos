import type { Metadata } from "next";
import { AuthView } from "@/components/auth-view";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Reset password" };
export default async function ResetPasswordPage() {
  await requireUser();
  return <AuthView mode="reset" />;
}
