"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Store } from "lucide-react";
import { AuthLayout } from "./auth-view";
import { TimeZoneField } from "./settings-view";
import { useMutation } from "./hooks";
import { Badge, Button, Notice } from "./ui";

export function OnboardingView() {
  const id = useId();
  const router = useRouter();
  const mutation = useMutation();
  const [zone, setZone] = useState("UTC");
  useEffect(() => {
    // Server and browser can use different zones. Detect only after hydration.
    try {
      setZone(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
    } catch {
      /* Keep UTC as a safe editable default. */
    }
  }, []);
  const [currency, setCurrency] = useState("");
  const [validation, setValidation] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <AuthLayout eyebrow="LET’S SET THE FOUNDATIONS">
      <div className="auth-form-wrap onboarding-form-wrap">
        <Badge tone="green">One-time shop setup</Badge>
        <h2>Make it your shop.</h2>
        <p className="auth-subtitle">
          A few essentials, and you’re ready to add products and record your first sale.
        </p>
        <div className="onboarding-progress">
          <span className="is-current">
            <span>1</span>Shop details
          </span>
          <i />
          <span>
            <span>2</span>Ready to trade
          </span>
        </div>
        {(validation || mutation.error) && <Notice>{validation || mutation.error}</Notice>}
        {complete && <Notice tone="success">Your shop was created. Opening your workspace…</Notice>}
        <form
          ref={formRef}
          onSubmit={async (event) => {
            event.preventDefault();
            setValidation(null);
            try {
              new Intl.DateTimeFormat("en", { timeZone: zone }).format();
            } catch {
              setValidation("Choose a valid IANA timezone, such as Europe/London.");
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
                Shop name <span className="required-text">*</span>
              </span>
              <div className="input-icon">
                <Store size={17} aria-hidden="true" />
                <input
                  name="name"
                  autoComplete="organization"
                  placeholder="The name above your door"
                  minLength={2}
                  maxLength={120}
                  required
                />
              </div>
            </label>
            <label className="field">
              <span>
                Trading currency <span className="required-text">*</span>
              </span>
              <input
                name="currency"
                type="text"
                value={currency}
                onChange={(event) => setCurrency(event.target.value.toUpperCase())}
                minLength={3}
                maxLength={3}
                pattern="[A-Z]{3}"
                title="Three-letter ISO currency code, such as USD, GBP, or INR"
                placeholder="Three-letter code, e.g. USD"
                required
              />
              <span className="form-hint">
                Single currency, two decimal places. It cannot change after your first product or
                financial activity.
              </span>
            </label>
            <TimeZoneField id={id} value={zone} onChange={setZone} />
            <Button
              type="submit"
              className="full-width"
              pending={mutation.pending}
              disabled={complete}
            >
              Create my shop
              <ArrowRight size={17} />
            </Button>
          </fieldset>
        </form>
        <p className="onboarding-note">
          <Check size={15} />
          Your catalog starts empty. No demo records or invented business figures.
        </p>
      </div>
    </AuthLayout>
  );
}
