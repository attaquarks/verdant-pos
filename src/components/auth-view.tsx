"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Mail,
  Package,
  Receipt,
  ShieldCheck,
} from "lucide-react";
import { createBrowserSupabase } from "../lib/supabase/client";
import { Brand, Button, Notice } from "./ui";

type AuthScreen = "login" | "signup" | "forgot" | "reset";
export function AuthLayout({
  children,
  eyebrow = "RETAIL, WITHOUT THE FRICTION",
}: {
  children: ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="auth-layout">
      <aside className="auth-aside">
        <Link href="/" className="brand-link">
          <Brand />
        </Link>
        <div className="auth-aside-content">
          <span className="auth-eyebrow">{eyebrow}</span>
          <h1>
            A little more clarity.
            <br />A better day in store.
          </h1>
          <p>
            Your products, sales, and money in one considered workspace. Built for the work you do
            every day.
          </p>
          <ul className="auth-benefits">
            <li>
              <Package size={19} />
              <div>
                <strong>Know what’s on the shelf</strong>
                <span>Stock, deliveries, and alerts that stay in sync.</span>
              </div>
            </li>
            <li>
              <Receipt size={19} />
              <div>
                <strong>Keep a proper record</strong>
                <span>Sales, credit, and returns with a clear history.</span>
              </div>
            </li>
            <li>
              <ShieldCheck size={19} />
              <div>
                <strong>Understand your numbers</strong>
                <span>Revenue, profit, and cash, clearly separated.</span>
              </div>
            </li>
          </ul>
        </div>
        <div className="auth-aside-footer">
          <span className="auth-footer-mark" aria-hidden="true">
            v.
          </span>
          <span>Less busywork. More business.</span>
        </div>
      </aside>
      <main className="auth-main">
        <div className="auth-mobile-brand">
          <Brand />
        </div>
        {children}
        <div className="auth-main-footer">
          Verdant POS <span aria-hidden="true">·</span> Retail essentials, thoughtfully connected.
        </div>
      </main>
    </div>
  );
}

export function AuthView({ mode }: { mode: "login" | "reset" }) {
  const router = useRouter();
  const [screen, setScreen] = useState<AuthScreen>(mode === "reset" ? "reset" : "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const locked = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [updated, setUpdated] = useState(false);
  const [hasRecoverySession, setHasRecoverySession] = useState(mode !== "reset");
  const [checkingSession, setCheckingSession] = useState(mode === "reset");
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (
      mode === "login" &&
      new URLSearchParams(window.location.search).get("error") === "confirmation"
    )
      setError(
        "That confirmation or recovery link is invalid or has expired. Sign in, or request a new password-reset link.",
      );
  }, [mode]);
  useEffect(() => {
    if (mode !== "reset") return;
    let cancelled = false;
    try {
      const client = createBrowserSupabase();
      client.auth
        .getSession()
        .then(({ data, error: sessionError }) => {
          if (cancelled) return;
          setHasRecoverySession(Boolean(data.session));
          if (sessionError || !data.session)
            setError("This reset link is missing or has expired. Request a fresh link below.");
          setCheckingSession(false);
        })
        .catch(() => {
          if (!cancelled) {
            setError("Couldn’t verify this reset link. Request a fresh link below.");
            setCheckingSession(false);
          }
        });
      const {
        data: { subscription },
      } = client.auth.onAuthStateChange((_event, session) => {
        if (!cancelled && session) {
          setHasRecoverySession(true);
          setCheckingSession(false);
          setError(null);
        }
      });
      return () => {
        cancelled = true;
        subscription.unsubscribe();
      };
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Authentication is not configured.");
      setCheckingSession(false);
    }
    return () => {
      cancelled = true;
    };
  }, [mode]);
  function changeScreen(next: AuthScreen) {
    if (pending) return;
    setScreen(next);
    setError(null);
    setMessage(null);
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    requestAnimationFrame(() => heading.current?.focus());
  }
  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current) return;
    setError(null);
    setMessage(null);
    if ((screen === "signup" || screen === "reset") && password.length < 8) {
      setError("Use a password with at least 8 characters.");
      return;
    }
    if (screen === "reset" && password !== confirmPassword) {
      setError("The passwords don’t match. Please enter them again.");
      return;
    }
    locked.current = true;
    setPending(true);
    try {
      const client = createBrowserSupabase();
      if (screen === "login") {
        const { error: authError } = await client.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (authError) throw authError;
        setPassword("");
        router.replace("/");
        router.refresh();
      } else if (screen === "signup") {
        const { data, error: authError } = await client.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        });
        if (authError) throw authError;
        setPassword("");
        if (data.session) {
          router.replace("/");
          router.refresh();
        } else
          setMessage(
            "Check your inbox for a confirmation link. Confirm your email to continue to your shop setup.",
          );
      } else if (screen === "forgot") {
        const { error: authError } = await client.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
        });
        if (authError) throw authError;
        setMessage(
          "If an account exists for this email, a password-reset link is on its way. Check your inbox and spam folder.",
        );
      } else {
        const { error: authError } = await client.auth.updateUser({ password });
        if (authError) throw authError;
        setPassword("");
        setConfirmPassword("");
        setUpdated(true);
      }
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Authentication failed. Please try again.",
      );
    } finally {
      locked.current = false;
      setPending(false);
    }
  }
  const title =
    screen === "login"
      ? "Welcome back"
      : screen === "signup"
        ? "Start with a fresh outlook"
        : screen === "forgot"
          ? "Forgot your password?"
          : "Choose a new password";
  const subtitle =
    screen === "login"
      ? "Sign in to your shop’s workspace."
      : screen === "signup"
        ? "Create your account. Set up your shop next."
        : screen === "forgot"
          ? "We’ll email you a secure link to reset it."
          : "Use a strong password you haven’t used elsewhere.";
  return (
    <AuthLayout>
      <div className="auth-form-wrap">
        <span className="eyebrow">YOUR SHOP, IN FOCUS</span>
        <h2 ref={heading} tabIndex={-1}>
          {updated ? "You’re all set" : title}
        </h2>
        <p className="auth-subtitle">
          {updated ? "Your password has been updated securely." : subtitle}
        </p>
        {updated ? (
          <div className="auth-confirmation">
            <CheckCircle2 size={32} aria-hidden="true" />
            <Link href="/" className="button button--primary full-width">
              Go to your workspace
              <ArrowRight size={17} />
            </Link>
          </div>
        ) : (
          <>
            {screen === "login" || screen === "signup" ? (
              <div className="auth-tabs" aria-label="Account access">
                <button
                  type="button"
                  className={screen === "login" ? "is-active" : ""}
                  aria-pressed={screen === "login"}
                  onClick={() => changeScreen("login")}
                  disabled={pending}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  className={screen === "signup" ? "is-active" : ""}
                  aria-pressed={screen === "signup"}
                  onClick={() => changeScreen("signup")}
                  disabled={pending}
                >
                  Create account
                </button>
              </div>
            ) : null}
            {error && <Notice>{error}</Notice>}
            {message && (
              <Notice tone="success">
                <strong>{screen === "signup" ? "Confirm your email" : "Check your inbox"}</strong>
                <p>{message}</p>
              </Notice>
            )}
            {!message && (
              <form onSubmit={authenticate} className="auth-form">
                <fieldset
                  disabled={
                    pending || checkingSession || (screen === "reset" && !hasRecoverySession)
                  }
                  className="plain-fieldset"
                >
                  {screen !== "reset" && (
                    <label className="field">
                      <span>Email address</span>
                      <div className="input-icon">
                        <Mail size={17} aria-hidden="true" />
                        <input
                          type="email"
                          autoComplete="email"
                          value={email}
                          onChange={(event) => setEmail(event.target.value)}
                          placeholder="you@yourshop.com"
                          required
                          maxLength={254}
                        />
                      </div>
                    </label>
                  )}
                  {screen !== "forgot" && (
                    <label className="field">
                      <span>{screen === "reset" ? "New password" : "Password"}</span>
                      <div className="password-input">
                        <input
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(event) => setPassword(event.target.value)}
                          autoComplete={screen === "login" ? "current-password" : "new-password"}
                          required
                          minLength={screen === "login" ? 1 : 8}
                          maxLength={128}
                          placeholder={
                            screen === "login" ? "Your password" : "At least 8 characters"
                          }
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((value) => !value)}
                          aria-label={showPassword ? "Hide password" : "Show password"}
                          aria-pressed={showPassword}
                        >
                          {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                        </button>
                      </div>
                    </label>
                  )}
                  {screen === "reset" && (
                    <label className="field">
                      <span>Confirm new password</span>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        autoComplete="new-password"
                        minLength={8}
                        maxLength={128}
                        required
                      />
                    </label>
                  )}
                  {screen === "login" && (
                    <div className="auth-forgot">
                      <button
                        type="button"
                        className="text-link"
                        onClick={() => changeScreen("forgot")}
                      >
                        Forgot password?
                      </button>
                    </div>
                  )}
                  <Button
                    type="submit"
                    className="full-width"
                    pending={pending}
                    disabled={checkingSession}
                  >
                    {screen === "login"
                      ? "Sign in"
                      : screen === "signup"
                        ? "Create account"
                        : screen === "forgot"
                          ? "Send reset link"
                          : checkingSession
                            ? "Verifying link…"
                            : "Update password"}
                    {!pending && <ArrowRight size={17} />}
                  </Button>
                </fieldset>
              </form>
            )}
            {screen === "signup" && (
              <p className="auth-privacy">
                <ShieldCheck size={15} aria-hidden="true" />
                Your account is protected by Supabase authentication. Email confirmation may be
                required.
              </p>
            )}
            {(screen === "forgot" || message) && (
              <button
                type="button"
                className="text-link auth-back"
                onClick={() => changeScreen("login")}
                disabled={pending}
              >
                <ArrowLeft size={15} />
                Back to sign in
              </button>
            )}
            {screen === "reset" && !checkingSession && !hasRecoverySession && (
              <button
                type="button"
                className="text-link auth-back"
                onClick={() => changeScreen("forgot")}
              >
                <KeyRound size={16} />
                Request a new reset link
              </button>
            )}
          </>
        )}
      </div>
    </AuthLayout>
  );
}
