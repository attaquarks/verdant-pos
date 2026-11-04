import type { Metadata } from "next";
import { EmailLinkView } from "@/components/email-link-view";
export const metadata: Metadata = { title: "Email verification", referrer: "no-referrer" };
export default function EmailCallbackPage() {
  return <EmailLinkView />;
}
