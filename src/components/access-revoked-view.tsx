"use client";
import { message as sourceMessage } from "@/lib/translations";
import { useT } from "./preferences";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, ShieldAlert } from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { AuthLayout } from "./auth-view";
import { Button, Notice } from "./ui";

export function AccessRevokedView({ email }: { email: string }) {
  const t = useT();
  const router = useRouter();
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function signOut() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await createBrowserSupabase().auth.signOut();
      if (result.error) throw result.error;
      router.replace("/login");
      router.refresh();
    } catch {
      setError(sourceMessage("Couldn’t sign out. Please try again."));
      inFlight.current = false;
      setPending(false);
    }
  }
  return (
    <AuthLayout eyebrow={t("PROTECTED SHOP ACCESS")}>
      <div className="auth-form-wrap">
        <ShieldAlert size={30} className="amber-text" aria-hidden="true" />
        <h2 style={{ marginTop: 20 }}>{t("Access revoked")}</h2>
        <p className="auth-subtitle">
          {t(
            "Your account is signed in, but its access to this shop has been removed. Contact the shop owner if you believe this is a mistake.",
          )}
        </p>
        <Notice tone="info">
          {t("Signed in as")} {email}
          {t(
            ". Shop records are no longer accessible. Historical transactions have been preserved.",
          )}
        </Notice>
        {error && <Notice>{error}</Notice>}
        <Button className="full-width" onClick={signOut} pending={pending}>
          <LogOut size={16} />
          {t("Sign out")}
        </Button>
      </div>
    </AuthLayout>
  );
}
