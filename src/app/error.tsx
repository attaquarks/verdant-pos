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
        "The workspace is temporarily unavailable. Check your connection and database setup, then retry. Your saved records have not been changed.",
      )}
      reset={reset}
    />
  );
}
