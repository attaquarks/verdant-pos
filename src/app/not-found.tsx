"use client";
import { useT } from "@/components/preferences";
import Link from "next/link";
export default function NotFound() {
  const t = useT();
  return (
    <main style={{ maxWidth: 520, margin: "12vh auto", padding: 32 }}>
      <p style={{ color: "var(--green)", fontSize: 13, fontWeight: 700 }}>{t("VERDANT POS")} </p>
      <h1 style={{ fontSize: 28 }}>{t("This page isn’t here.")} </h1>
      <p style={{ color: "var(--text-muted)", marginBlock: 20 }}>
        {t("Return to your workspace to continue managing your shop.")}{" "}
      </p>
      <Link href="/" style={{ color: "var(--green)", fontWeight: 600 }}>
        {t("Back to dashboard →")}{" "}
      </Link>
    </main>
  );
}
