import type { Metadata } from "next";
import { EmailLinkView } from "@/components/email-link-view";
export const metadata: Metadata = { title: "Reset password", referrer: "no-referrer" };
// Public shell only. The form requires a verified, isolated recovery link, not an app cookie.
export default function ResetPasswordPage() {
  return <EmailLinkView recoveryOnly />;
}
