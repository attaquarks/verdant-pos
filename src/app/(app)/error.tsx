"use client";
import { PageError } from "@/components/ui";
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <PageError
      message="We couldn’t load your shop records. Check your connection and confirm the Supabase migrations have been applied. No figures have been substituted."
      reset={reset}
    />
  );
}
