"use client";
import { useT } from "@/components/preferences";

import { PageError } from "@/components/ui";
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useT();
  return (
    <PageError
      message={t(
        "We couldn’t load your shop records. Check your connection and confirm the Supabase migrations have been applied. No figures have been substituted.",
      )}
      reset={reset}
    />
  );
}
