"use client";
import { LocalizedForm, useT } from "./preferences";
import { message as sourceMessage } from "@/lib/translations";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Store } from "lucide-react";
import { NEW_SHOP_DEFAULTS } from "@/lib/preferences";
import { AuthLayout } from "./auth-view";
import { TimeZoneField } from "./settings-view";
import { useMutation } from "./hooks";
import { Badge, Button, Notice } from "./ui";

export function OnboardingView() {
  const t = useT();
  const id = useId();
  const router = useRouter();
  const mutation = useMutation();
  const [zone, setZone] = useState<string>(NEW_SHOP_DEFAULTS.timeZone);
  const [currency, setCurrency] = useState<string>(NEW_SHOP_DEFAULTS.currency);
  const [validation, setValidation] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <AuthLayout eyebrow={t("LET’S SET THE FOUNDATIONS")}>
      <div className="auth-form-wrap onboarding-form-wrap">
        <Badge tone="green">{t("One-time shop setup")}</Badge>
        <h2>{t("Make it your shop.")}</h2>
        <p className="auth-subtitle">
          {t("A few essentials, and you’re ready to add products and record your first sale.")}
        </p>
        <p className="form-hint onboarding-defaults">
          {t(
            "New shops start with PKR and Pakistan time. You can edit these before creating the shop.",
          )}
        </p>
        <div className="onboarding-progress">
          <span className="is-current">
            <span>1</span>
            {t("Shop details")}
          </span>
          <i />
          <span>
            <span>2</span>
            {t("Ready to trade")}
          </span>
        </div>
        {(validation || mutation.error) && <Notice>{validation || mutation.error}</Notice>}
        {complete && (
          <Notice tone="success">{t("Your shop was created. Opening your workspace…")}</Notice>
        )}
        <LocalizedForm
          ref={formRef}
          onSubmit={async (event) => {
            event.preventDefault();
            setValidation(null);
            try {
              new Intl.DateTimeFormat("en", { timeZone: zone }).format();
            } catch {
              setValidation(sourceMessage("Choose a valid IANA timezone, such as Europe/London."));
              return;
            }
            const form = new FormData(event.currentTarget);
            const result = await mutation.submit("shop", {
              mode: "create",
              name: String(form.get("name") ?? "").trim(),
              currency: currency.toUpperCase(),
              time_zone: zone,
            });
            if (result) {
              setComplete(true);
              router.replace("/");
              router.refresh();
            }
          }}
          className="auth-form"
        >
          <fieldset className="plain-fieldset" disabled={mutation.pending || complete}>
            <label className="field">
              <span>
                {t("Shop name")} <span className="required-text">*</span>
              </span>
              <div className="input-icon">
                <Store size={17} aria-hidden="true" />
                <input
                  name="name"
                  autoComplete="organization"
                  placeholder={t("The name above your door")}
                  minLength={2}
                  maxLength={120}
                  required
                />
              </div>
            </label>
            <label className="field">
              <span>
                {t("Trading currency")} <span className="required-text">*</span>
              </span>
              <input
                name="currency"
                dir="ltr"
                type="text"
                value={currency}
                onChange={(event) => setCurrency(event.target.value.toUpperCase())}
                minLength={3}
                maxLength={3}
                pattern="[A-Z]{3}"
                title={t("Three-letter ISO currency code, such as PKR, USD, or GBP")}
                placeholder={t("Three-letter code, e.g. PKR")}
                required
              />
              <span className="form-hint">
                {t(
                  "Single currency, two decimal places. It cannot change after your first product or financial activity.",
                )}
              </span>
            </label>
            <TimeZoneField id={id} value={zone} onChange={setZone} />
            <Button
              type="submit"
              className="full-width"
              pending={mutation.pending}
              disabled={complete}
            >
              {t("Create my shop")} <ArrowRight size={17} />
            </Button>
          </fieldset>
        </LocalizedForm>
        <p className="onboarding-note">
          <Check size={15} />
          {t("Your catalog starts empty. No demo records or invented business figures.")}
        </p>
      </div>
    </AuthLayout>
  );
}
