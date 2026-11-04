"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Brand, Button, Notice } from "./ui";
import { LocalizedForm, PreferenceControls, useMessage, useT } from "./preferences";
import { createEmailSupabase } from "@/lib/supabase/email-client";
import { getSupabaseConfig } from "@/lib/env";
import {
  captureEmailLink,
  emailAuthError,
  INVALID_EMAIL_LINK,
  validateEmailIdentity,
  validateNewPassword,
  verifyEmailLink,
} from "@/lib/email-auth";

type Verified = Awaited<ReturnType<typeof verifyEmailLink>>;
export function EmailLinkView({ recoveryOnly = false }: { recoveryOnly?: boolean }) {
  const t = useT();
  const m = useMessage();
  const task = useRef<{
    client: ReturnType<typeof createEmailSupabase>;
    promise: Promise<Verified>;
    terminal: boolean;
  } | null>(null);
  const [verified, setVerified] = useState<Verified | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [updated, setUpdated] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [accountConfirmed, setAccountConfirmed] = useState(false);
  const locked = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    // A second email opened in this same tab can be a fragment-only navigation.
    // Start a fresh document/client rather than reusing the previous proof/account.
    const reloadForNewLink = () => {
      if (window.location.hash || window.location.search) window.location.reload();
    };
    window.addEventListener("hashchange", reloadForNewLink);
    window.addEventListener("popstate", reloadForNewLink);
    return () => {
      window.removeEventListener("hashchange", reloadForNewLink);
      window.removeEventListener("popstate", reloadForNewLink);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    try {
      // One capture/exchange even under React StrictMode's effect replay.
      if (!task.current) {
        const link = captureEmailLink(window.location.href, () =>
          window.history.replaceState(null, "", window.location.pathname),
        );
        const client = createEmailSupabase();
        const issuer = `${getSupabaseConfig()!.url.replace(/\/$/, "")}/auth/v1`;
        task.current = { client, promise: verifyEmailLink(client, link, issuer), terminal: false };
      }
      const currentTask = task.current;
      void currentTask.promise
        .then(async (result) => {
          if (cancelled || currentTask !== task.current || currentTask.terminal) return;
          if (recoveryOnly && result.purpose !== "recovery") {
            await task.current?.client.auth.signOut({ scope: "local" });
            throw new Error(INVALID_EMAIL_LINK);
          }
          if (result.purpose === "signup")
            await task.current?.client.auth.signOut({ scope: "local" }).catch(() => {});
          if (cancelled || currentTask !== task.current || currentTask.terminal) return;
          setVerified(result);
          setReady(true);
        })
        .catch(() => {
          if (!cancelled && currentTask === task.current && !currentTask.terminal) {
            void task.current?.client.auth.signOut({ scope: "local" }).catch(() => {});
            setError(INVALID_EMAIL_LINK);
            setReady(true);
          }
        });
    } catch {
      setError(INVALID_EMAIL_LINK);
      setReady(true);
    }
    return () => {
      cancelled = true;
    };
  }, [recoveryOnly]);

  const expire = useCallback((currentTask: NonNullable<typeof task.current>) => {
    if (!mounted.current || task.current !== currentTask || currentTask.terminal) return;
    currentTask.terminal = true;
    task.current = null;
    setVerified(null);
    setPassword("");
    setConfirm("");
    setAccountConfirmed(false);
    setPending(false);
    setError(INVALID_EMAIL_LINK);
    void currentTask.client.auth.signOut({ scope: "local" }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!verified || verified.purpose !== "recovery" || updated) return;
    const currentTask = task.current;
    const timer = window.setTimeout(
      () => {
        if (currentTask) expire(currentTask);
      },
      Math.max(0, Math.min(verified.expiresAt * 1000 - Date.now(), 15 * 60 * 1000)),
    );
    return () => window.clearTimeout(timer);
  }, [verified, updated, expire]);

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      locked.current ||
      !accountConfirmed ||
      !verified ||
      verified.purpose !== "recovery" ||
      !task.current
    )
      return;
    const validation = validateNewPassword(password, confirm);
    if (validation) {
      setError(validation);
      return;
    }
    locked.current = true;
    setPending(true);
    setError(null);
    // Object identity is the proof generation: terminal/disposed tasks cannot resume.
    const currentTask = task.current;
    const client = currentTask.client;
    const isCurrent = () =>
      mounted.current && task.current === currentTask && !currentTask.terminal;
    const requireLiveProof = () => {
      if (Date.now() >= verified.expiresAt * 1000) expire(currentTask);
      if (!isCurrent()) throw new Error(INVALID_EMAIL_LINK);
    };
    try {
      // Recheck the original proof lifetime even when a background-tab timer was throttled.
      requireLiveProof();
      const session = await client.auth.getSession();
      requireLiveProof();
      const token = session.data.session?.access_token;
      if (session.error || !token) throw new Error(INVALID_EMAIL_LINK);
      const claims = await client.auth.getClaims(token);
      requireLiveProof();
      const identity = await client.auth.getUser(token);
      requireLiveProof();
      if (
        claims.error ||
        !claims.data ||
        identity.error ||
        !identity.data.user ||
        identity.data.user.id !== verified.userId
      )
        throw new Error(INVALID_EMAIL_LINK);
      validateEmailIdentity(
        "recovery",
        claims.data.claims,
        identity.data.user,
        `${getSupabaseConfig()!.url.replace(/\/$/, "")}/auth/v1`,
        Date.now() / 1000,
        verified.recoveryVerifiedByProvider,
      );
      // No await between this live generation/deadline check and dispatch.
      requireLiveProof();
      const result = await client.auth.updateUser({ password });
      // A dispatched provider operation cannot be undone by expiry/signout.
      // If expiry won while it was in flight, retain the terminal expired UI.
      if (Date.now() >= verified.expiresAt * 1000) expire(currentTask);
      if (!isCurrent()) return;
      if (result.error) throw result.error;
      // Scope local revokes ONLY this isolated recovery session, never other app identities.
      // Even if logout fails offline, drop the client; no session is persisted or refreshed.
      currentTask.terminal = true;
      task.current = null;
      void client.auth.signOut({ scope: "local" }).catch(() => {});
      setPassword("");
      setConfirm("");
      setUpdated(true);
    } catch (caught) {
      if (!isCurrent()) return;
      setError(
        caught instanceof Error && caught.message === INVALID_EMAIL_LINK
          ? INVALID_EMAIL_LINK
          : emailAuthError(caught),
      );
    } finally {
      locked.current = false;
      if (mounted.current && (isCurrent() || task.current === null)) setPending(false);
    }
  }

  const confirmed = verified?.purpose === "signup" && !error;
  return (
    <main className="email-link-layout">
      <PreferenceControls />
      <div className="email-link-panel">
        <Brand />
        <h1>
          {!ready
            ? t("Verifying link…")
            : updated
              ? t("You’re all set")
              : confirmed
                ? t("Email confirmed")
                : verified?.purpose === "recovery"
                  ? t("Choose a new password")
                  : t("Link unavailable")}
        </h1>
        {error && <Notice>{m(error)}</Notice>}
        {confirmed && (
          <p role="status">{t("Email confirmed, return to original window and sign in.")}</p>
        )}
        {updated && (
          <p role="status">
            {t(
              "Your password has been updated. Return to the original window and sign in with your new password.",
            )}
          </p>
        )}
        {!updated && verified?.purpose === "recovery" && (
          <>
            <p>
              {t("Resetting password for")} <bdi dir="ltr">{verified.email}</bdi>
            </p>
            <p>
              {t(
                "If this is not your account, close this page. Your other signed-in account will not be changed.",
              )}
            </p>
            <LocalizedForm className="auth-form" onSubmit={updatePassword}>
              <fieldset className="plain-fieldset" disabled={pending}>
                <label className="email-account-confirmation">
                  <input
                    type="checkbox"
                    required
                    checked={accountConfirmed}
                    onChange={(event) => setAccountConfirmed(event.target.checked)}
                  />
                  <span>{t("I confirm this is the account whose password I want to reset.")}</span>
                </label>
                <label className="field">
                  <span>{t("New password")}</span>
                  <input
                    type="password"
                    dir="ltr"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    maxLength={128}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </label>
                <label className="field">
                  <span>{t("Confirm new password")}</span>
                  <input
                    type="password"
                    dir="ltr"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    maxLength={128}
                    value={confirm}
                    onChange={(event) => setConfirm(event.target.value)}
                  />
                </label>
                <Button type="submit" className="full-width" pending={pending}>
                  {t("Update password")}
                </Button>
              </fieldset>
            </LocalizedForm>
          </>
        )}
        {ready && !verified && (
          <Link href="/login" className="text-link">
            {t("Back to sign in")}
          </Link>
        )}
      </div>
    </main>
  );
}
