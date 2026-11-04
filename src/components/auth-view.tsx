"use client";
import { LocalizedForm, PreferenceControls, useMessage, useT } from "./preferences";
import { message as sourceMessage } from "@/lib/translations";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  Mail,
  Package,
  Receipt,
  ShieldCheck,
} from "lucide-react";
import { createBrowserSupabase } from "../lib/supabase/client";
import { createEmailSupabase } from "@/lib/supabase/email-client";
import { emailAuthError } from "@/lib/email-auth";
import { Brand, Button, Notice } from "./ui";

type AuthScreen = "login" | "signup" | "forgot";
export function AuthLayout({
  children,
  eyebrow = "RETAIL, WITHOUT THE FRICTION",
}: {
  children: ReactNode;
  eyebrow?: string;
}) {
  const t = useT();
  const m = useMessage();
  return (
    <div className="auth-layout">
      <aside className="auth-aside">
        <Link href="/" className="brand-link">
          <Brand />
        </Link>
        <div className="auth-aside-content">
          <span className="auth-eyebrow">{m(eyebrow)}</span>
          <h1>
            {t("A little more clarity.")} <br />
            {t("A better day in store.")}
          </h1>
          <ul className="auth-benefits">
            <li>
              <Package size={19} />
              <div>
                <strong>{t("Know what’s on the shelf")}</strong>
              </div>
            </li>
            <li>
              <Receipt size={19} />
              <div>
                <strong>{t("Keep a proper record")}</strong>
              </div>
            </li>
            <li>
              <ShieldCheck size={19} />
              <div>
                <strong>{t("Understand your numbers")}</strong>
              </div>
            </li>
          </ul>
        </div>
        <div className="auth-aside-footer">
          <span className="auth-footer-mark" aria-hidden="true">
            v.
          </span>
          <span>{t("Less busywork. More business.")}</span>
        </div>
      </aside>
      <main className="auth-main">
        <PreferenceControls />
        <div className="auth-mobile-brand">
          <Brand />
        </div>
        {children}
        <div className="auth-main-footer">{t("Verdant POS")}</div>
      </main>
    </div>
  );
}

export function AuthView({ mode }: { mode: "login" }) {
  const t = useT();
  const m = useMessage();
  const router = useRouter();
  const [screen, setScreen] = useState<AuthScreen>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const locked = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
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
  function changeScreen(next: AuthScreen) {
    if (pending) return;
    setScreen(next);
    setError(null);
    setMessage(null);
    setPassword("");
    setShowPassword(false);
    requestAnimationFrame(() => heading.current?.focus());
  }
  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current) return;
    setError(null);
    setMessage(null);
    if (screen === "signup" && password.length < 8) {
      setError(sourceMessage("Use a password with at least 8 characters."));
      return;
    }
    locked.current = true;
    setPending(true);
    try {
      const client = screen === "login" ? createBrowserSupabase() : createEmailSupabase();
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
        const { error: authError } = await client.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        });
        if (authError) throw authError;
        setPassword("");
        setMessage(
          sourceMessage("Check your inbox for a confirmation link. Then return here and sign in."),
        );
      } else if (screen === "forgot") {
        const { error: authError } = await client.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (authError) throw authError;
        setMessage(
          sourceMessage(
            "If an account exists for this email, a password-reset link is on its way. Check your inbox and spam folder.",
          ),
        );
      }
    } catch (caught) {
      setError(
        screen === "login" && caught instanceof Error
          ? caught.message
          : sourceMessage(emailAuthError(caught)),
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
        : "Forgot your password?";
  return (
    <AuthLayout>
      <div className="auth-form-wrap">
        <span className="eyebrow">{t("YOUR SHOP, IN FOCUS")}</span>
        <h2 ref={heading} tabIndex={-1}>
          {m(title)}
        </h2>
        <>
          {screen === "login" || screen === "signup" ? (
            <div className="auth-tabs" aria-label={t("Account access")}>
              <button
                type="button"
                className={screen === "login" ? "is-active" : ""}
                aria-pressed={screen === "login"}
                onClick={() => changeScreen("login")}
                disabled={pending}
              >
                {t("Sign in")}
              </button>
              <button
                type="button"
                className={screen === "signup" ? "is-active" : ""}
                aria-pressed={screen === "signup"}
                onClick={() => changeScreen("signup")}
                disabled={pending}
              >
                {t("Create account")}
              </button>
            </div>
          ) : null}
          {error && <Notice>{error}</Notice>}
          {message && (
            <Notice tone="success">
              <strong>
                {screen === "signup" ? t("Confirm your email") : t("Check your inbox")}
              </strong>
              <p>{m(message)}</p>
            </Notice>
          )}
          {!message && (
            <LocalizedForm onSubmit={authenticate} className="auth-form">
              <fieldset disabled={pending} className="plain-fieldset">
                <label className="field">
                  <span>{t("Email address")}</span>
                  <div className="input-icon">
                    <Mail size={17} aria-hidden="true" />
                    <input
                      type="email"
                      dir="ltr"
                      autoComplete="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="you@yourshop.com"
                      required
                      maxLength={254}
                    />
                  </div>
                </label>
                {screen !== "forgot" && (
                  <label className="field">
                    <span>{t("Password")}</span>
                    <div className="password-input">
                      <input
                        type={showPassword ? "text" : "password"}
                        dir="ltr"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        autoComplete={screen === "login" ? "current-password" : "new-password"}
                        required
                        minLength={screen === "login" ? 1 : 8}
                        maxLength={128}
                        placeholder={
                          screen === "login" ? t("Your password") : t("At least 8 characters")
                        }
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((value) => !value)}
                        aria-label={showPassword ? t("Hide password") : t("Show password")}
                        aria-pressed={showPassword}
                      >
                        {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                      </button>
                    </div>
                  </label>
                )}
                {screen === "login" && (
                  <div className="auth-forgot">
                    <button
                      type="button"
                      className="text-link"
                      onClick={() => changeScreen("forgot")}
                    >
                      {t("Forgot password?")}
                    </button>
                  </div>
                )}
                <Button type="submit" className="full-width" pending={pending}>
                  {screen === "login"
                    ? t("Sign in")
                    : screen === "signup"
                      ? t("Create account")
                      : t("Send reset link")}
                  {!pending && <ArrowRight size={17} />}
                </Button>
              </fieldset>
            </LocalizedForm>
          )}
          {screen === "signup" && (
            <p className="auth-privacy">
              <ShieldCheck size={15} aria-hidden="true" />
              {t(
                "Your account is protected by Supabase authentication. Email confirmation may be required.",
              )}
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
              {t("Back to sign in")}
            </button>
          )}
        </>
      </div>
    </AuthLayout>
  );
}
