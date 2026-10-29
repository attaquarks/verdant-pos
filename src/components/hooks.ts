"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { getJSON, mutate } from "../lib/client-api";

type MutationError = Error & { fields?: Record<string, string[]> };
type Intent = { action: string; payload: string; requestId: string };

/** A retry of exactly the same intent always reuses its idempotency key. */
export function useMutation(persistenceKey?: string) {
  const router = useRouter();
  const inFlight = useRef(false);
  const intent = useRef<Intent | null>(null);
  const alive = useRef(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string[]>>({});

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const clearError = useCallback(() => {
    setError(null);
    setFields({});
  }, []);
  const submit = useCallback(
    async (action: string, payload: Record<string, unknown>) => {
      if (inFlight.current) return null;
      inFlight.current = true;
      setPending(true);
      setError(null);
      setFields({});
      try {
        const serialized = JSON.stringify(payload);
        let previous = intent.current;
        if (!previous && persistenceKey) {
          try {
            const saved = sessionStorage.getItem(persistenceKey);
            if (saved) previous = JSON.parse(saved) as Intent;
          } catch {
            /* Storage is optional; posting does not depend on it. */
          }
        }
        if (
          !previous ||
          previous.action !== action ||
          previous.payload !== serialized ||
          !previous.requestId
        ) {
          previous = { action, payload: serialized, requestId: crypto.randomUUID() };
        }
        intent.current = previous;
        if (persistenceKey) {
          try {
            sessionStorage.setItem(persistenceKey, JSON.stringify(previous));
          } catch {
            /* Private browsing, quota. */
          }
        }
        const result = await mutate(action, payload, previous.requestId);
        intent.current = null;
        if (persistenceKey) {
          try {
            sessionStorage.removeItem(persistenceKey);
          } catch {
            /* Optional storage. */
          }
        }
        router.refresh();
        return result;
      } catch (caught) {
        if (alive.current) {
          const failure = caught as MutationError;
          setError(
            failure instanceof Error ? failure.message : "Something went wrong. Please try again.",
          );
          setFields(failure?.fields ?? {});
        }
        return null;
      } finally {
        inFlight.current = false;
        if (alive.current) setPending(false);
      }
    },
    [persistenceKey, router],
  );

  return { submit, pending, error, fields, clearError };
}

/** URL is the source of truth. Filters reset pagination, pagination preserves filters. */
export function useQueryFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [navigating, startTransition] = useTransition();
  const latestQuery = useRef(params.toString());
  useEffect(() => {
    // An intermediate server response must not undo a newer filter intent.
    if (!navigating) latestQuery.current = params.toString();
  }, [params, navigating]);
  return useCallback(
    (patch: Record<string, string | null | undefined>, resetPage = true) => {
      const next = new URLSearchParams(latestQuery.current);
      if (resetPage) next.delete("page");
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined || value === null || value === "") next.delete(key);
        else next.set(key, value);
      }
      const query = next.toString();
      latestQuery.current = query;
      startTransition(() =>
        router.push(`${pathname}${query ? `?${query}` : ""}`, { scroll: false }),
      );
    },
    [pathname, router],
  );
}

/** Ignore a superseded request, including when its dialog has been dismissed. */
export function useRemote<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(url));
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    if (!url) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    setData(null);
    getJSON<T>(url, controller.signal)
      .then((value) => {
        if (!cancelled) setData(value);
      })
      .catch((caught: unknown) => {
        if (!cancelled)
          setError(caught instanceof Error ? caught.message : "We couldn’t load this information.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [url, revision]);
  const reload = useCallback(() => setRevision((value) => value + 1), []);
  return { data, error, loading, reload };
}

export function todayInZone(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function optional(value: FormDataEntryValue | null) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}
