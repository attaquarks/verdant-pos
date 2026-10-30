"use client";
import { PreferenceControls, useT } from "./preferences";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  CircleDashed,
  Database,
  KeyRound,
  Settings2,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import { Brand } from "./ui";

export function SetupView() {
  const t = useT();
  return (
    <div className="setup-page">
      <header className="setup-header">
        <Link href="/" className="brand-link">
          <Brand />
        </Link>
        <PreferenceControls />
        <span className="setup-environment">
          <CircleDashed size={14} />
          {t("Configuration required")}
        </span>
      </header>
      <main className="setup-main">
        <div className="setup-intro">
          <span className="eyebrow">{t("WELCOME TO VERDANT POS")}</span>
          <h1>
            {t("A considered workspace.")} <br />
            {t("A real connection first.")}
          </h1>
          <p>
            {t(
              "Your retail console is ready to configure. Connect a Supabase project to enable secure accounts, inventory, and the financial ledger.",
            )}
          </p>
          <div className="setup-truth">
            <ShieldCheck size={19} />
            <span>
              {t(
                "No database is connected yet. This screen does not represent a live shop or production activity.",
              )}
            </span>
          </div>
        </div>
        <section className="setup-checklist panel">
          <div className="panel-heading">
            <div>
              <h2>{t("Get your workspace running")}</h2>
              <p>{t("For the person setting up this installation")}</p>
            </div>
            <Settings2 size={21} className="muted" />
          </div>
          <ol className="setup-steps">
            <li>
              <span className="setup-step-number">01</span>
              <div>
                <h3>
                  <Database size={17} />
                  {t("Create and prepare a database")}
                </h3>
                <p>
                  {t("Create a Supabase project. Apply the migrations in")}{" "}
                  <code>supabase/migrations</code>{" "}
                  {t(
                    "to create shop-scoped tables, access policies, and atomic posting functions.",
                  )}
                </p>
              </div>
            </li>
            <li>
              <span className="setup-step-number">02</span>
              <div>
                <h3>
                  <KeyRound size={17} />
                  {t("Add your project configuration")}
                </h3>
                <p>
                  {t("Copy")} <code>.env.example</code> {t("to")} <code>.env.local</code>
                  {t(
                    ". Set the public project URL and publishable key, plus this application’s canonical URL.",
                  )}
                </p>
                <pre className="env-example">
                  <code>
                    {
                      "NEXT_PUBLIC_SUPABASE_URL=…\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=…\nAPP_URL=http://localhost:3000"
                    }
                  </code>
                </pre>
                <p className="setup-key-warning">
                  {t("Never put a service-role key, database password, or secret key in a")}{" "}
                  <code>NEXT_PUBLIC_</code> {t("variable.")}
                </p>
              </div>
            </li>
            <li>
              <span className="setup-step-number">03</span>
              <div>
                <h3>
                  <ShieldCheck size={17} />
                  {t("Configure authentication")}
                </h3>
                <p>
                  {t("Enable email authentication. Add your application URL and")}{" "}
                  <code>/auth/callback</code>{" "}
                  {t(
                    "to Supabase’s allowed redirect URLs. Password recovery returns through that callback to",
                  )}{" "}
                  <code>/reset-password</code>.
                </p>
              </div>
            </li>
            <li>
              <span className="setup-step-number">04</span>
              <div>
                <h3>
                  <Terminal size={17} />
                  {t("Restart and create your shop")}
                </h3>
                <p>
                  {t(
                    "Restart the Next.js server after changing environment variables. Create an account, confirm your email if required, and complete the one-time shop setup.",
                  )}
                </p>
                <Link href="/login" className="button button--primary">
                  {t("Continue to sign in")} <ArrowRight size={16} />
                </Link>
              </div>
            </li>
          </ol>
        </section>
        <section className="setup-bottom">
          <div>
            <Check size={17} />
            <span>{t("Real authentication")}</span>
          </div>
          <div>
            <Check size={17} />
            <span>{t("Atomic stock & money records")}</span>
          </div>
          <div>
            <Check size={17} />
            <span>{t("No demo business data")}</span>
          </div>
        </section>
        <p className="setup-footnote">
          {t(
            "A connected project, applied migrations, and a production deployment still need to be verified in your environment. See the project README and docs for setup, backups, and verification.",
          )}
        </p>
      </main>
      <footer className="setup-footer">
        <Brand small />
        <span>{t("Built for the business of every day.")}</span>
      </footer>
    </div>
  );
}
