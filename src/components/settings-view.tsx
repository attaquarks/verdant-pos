"use client";

import { useEffect, useId, useState } from "react";
import { Database, Download, Globe2, LockKeyhole, Save, ShieldCheck, Store } from "lucide-react";
import type { Shop } from "../lib/types";
import { formatDate } from "../lib/dates";
import { useMutation } from "./hooks";
import { Badge, Button, Notice, PageHeading } from "./ui";

export function TimeZoneField({
  id,
  value,
  onChange,
  disabled = false,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const common = Array.from(
    new Set([
      value,
      "UTC",
      "Africa/Accra",
      "Africa/Johannesburg",
      "Africa/Lagos",
      "Africa/Nairobi",
      "America/Chicago",
      "America/Los_Angeles",
      "America/New_York",
      "America/Toronto",
      "Asia/Dhaka",
      "Asia/Dubai",
      "Asia/Karachi",
      "Asia/Kolkata",
      "Asia/Manila",
      "Asia/Singapore",
      "Australia/Sydney",
      "Europe/London",
      "Europe/Paris",
    ]),
  );
  return (
    <label className="field">
      <span>
        Shop timezone <span className="required-text">*</span>
      </span>
      <input
        name="time_zone"
        list={`${id}-timezones`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Area/City"
        required
        maxLength={80}
        disabled={disabled}
        autoComplete="off"
      />
      <datalist id={`${id}-timezones`}>
        {common.map((zone) => (
          <option value={zone} key={zone} />
        ))}
      </datalist>
      <span className="form-hint">
        Use an IANA timezone, such as Europe/London. Determines reporting-day boundaries.
      </span>
    </label>
  );
}

export function SettingsView({ shop, role }: { shop: Shop; role: "owner" | "staff" | string }) {
  const id = useId();
  const mutation = useMutation();
  const [name, setName] = useState(shop.name);
  const [currency, setCurrency] = useState(shop.currency);
  const [zone, setZone] = useState(shop.time_zone);
  const [validation, setValidation] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  useEffect(() => {
    setName(shop.name);
    setCurrency(shop.currency);
    setZone(shop.time_zone);
  }, [shop.name, shop.currency, shop.time_zone]);
  const owner = role === "owner";
  const dirty = name.trim() !== shop.name || currency !== shop.currency || zone !== shop.time_zone;
  return (
    <>
      <PageHeading
        title="Settings"
        subtitle="Shop details, reporting preferences, and taking care of your data."
      />
      <div className="settings-layout">
        <div className="settings-section-description">
          <span className="settings-icon">
            <Store size={21} />
          </span>
          <h2>Shop profile</h2>
          <p>The details used throughout your shop’s workspace and exports.</p>
          <Badge tone={owner ? "green" : "neutral"}>
            {owner ? "Owner access" : "Staff access"}
          </Badge>
        </div>
        <section className="panel settings-panel">
          <div className="panel-heading">
            <div>
              <h2>Business details</h2>
              <p>
                Created{" "}
                {formatDate(shop.created_at, shop.time_zone, {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            </div>
            <Store size={20} className="muted" />
          </div>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              setValidation(null);
              setSuccess(false);
              try {
                new Intl.DateTimeFormat("en", { timeZone: zone }).format();
              } catch {
                setValidation("Enter a valid IANA timezone, such as Europe/London.");
                return;
              }
              const result = await mutation.submit("shop", {
                mode: "update",
                name: name.trim(),
                currency: currency.toUpperCase(),
                time_zone: zone,
              });
              if (result) setSuccess(true);
            }}
          >
            <div className="settings-form">
              {!owner && (
                <Notice tone="info">
                  Only the shop owner can change these settings. You can still export operational
                  data below.
                </Notice>
              )}
              {(validation || mutation.error) && <Notice>{validation || mutation.error}</Notice>}
              {success && <Notice tone="success">Shop settings saved.</Notice>}
              <fieldset disabled={!owner || mutation.pending} className="plain-fieldset">
                <label className="field">
                  <span>
                    Shop name <span className="required-text">*</span>
                  </span>
                  <input
                    name="name"
                    value={name}
                    onChange={(event) => {
                      setName(event.target.value);
                      setSuccess(false);
                    }}
                    minLength={2}
                    maxLength={120}
                    required
                  />
                </label>
                <div className="form-grid">
                  <label className="field">
                    <span>
                      Currency <span className="required-text">*</span>
                    </span>
                    <input
                      name="currency"
                      value={currency}
                      onChange={(event) => {
                        setCurrency(event.target.value.toUpperCase());
                        setSuccess(false);
                      }}
                      minLength={3}
                      maxLength={3}
                      pattern="[A-Z]{3}"
                      title="Three-letter ISO currency code, such as USD, GBP, or INR"
                      required
                    />
                    <span className="form-hint">
                      <LockKeyhole size={12} />
                      Locked after the first product or financial activity. Amounts have two decimal
                      places.
                    </span>
                  </label>
                  <TimeZoneField
                    id={id}
                    value={zone}
                    onChange={(value) => {
                      setZone(value);
                      setSuccess(false);
                    }}
                  />
                </div>
              </fieldset>
              <p className="form-hint">
                Changing timezone changes calendar grouping, not the original timestamps. Historical
                sale snapshots remain unchanged.
              </p>
            </div>
            <div className="panel-form-footer">
              <span className="muted small-text">
                {owner ? "Changes apply to your whole shop." : "Read-only for staff."}
              </span>
              <Button type="submit" pending={mutation.pending} disabled={!owner || !dirty}>
                {!mutation.pending && <Save size={16} />}Save changes
              </Button>
            </div>
          </form>
        </section>
      </div>
      <div id="data" className="settings-layout">
        <div className="settings-section-description">
          <span className="settings-icon">
            <Database size={21} />
          </span>
          <h2>Your data</h2>
          <p>Portable records and a clear plan for backups. Your shop data stays yours.</p>
        </div>
        <section className="panel settings-panel">
          <div className="panel-heading">
            <div>
              <h2>Exports & backups</h2>
              <p>CSV exports are useful. They are not a full database backup.</p>
            </div>
          </div>
          <div className="settings-data-body">
            <h3>Download operational data</h3>
            <p>
              Use the date controls on Sales, Reports, Cashbook, and Expenses before exporting. The
              full product catalog can be downloaded here.
            </p>
            <div className="button-row">
              <a className="button button--secondary button--sm" href="/api/export?type=inventory">
                <Download size={15} />
                Export inventory
              </a>
              <a className="button button--secondary button--sm" href="/api/template" download>
                <Download size={15} />
                Product CSV template
              </a>
            </div>
            <hr />
            <h3>
              <ShieldCheck size={17} />
              Back up the complete ledger
            </h3>
            <ol className="instruction-list">
              <li>
                <strong>Use your Supabase project’s database backup tools.</strong>
                <span>
                  Availability and retention depend on your Supabase plan. For self-managed backups,
                  take a PostgreSQL dump using your project’s documented connection settings.
                </span>
              </li>
              <li>
                <strong>Keep backups private and encrypted.</strong>
                <span>
                  Back up schema, data, functions, and access policies. Keep authentication
                  recovery, project configuration, and environment secrets in a separate secure
                  recovery plan.
                </span>
              </li>
              <li>
                <strong>Test a restore before you need it.</strong>
                <span>
                  Restore into an isolated project, confirm its migration version, and verify
                  memberships, stock, sale balances, ledger totals, and row-level security before
                  reconnecting an application.
                </span>
              </li>
            </ol>
            <Notice tone="info">
              Product CSV import adds catalog records only. It does not restore sales, stock
              history, payments, authentication, or shop membership. Do not treat an export as a
              restorable backup.
            </Notice>
          </div>
        </section>
      </div>
      <div className="settings-layout">
        <div className="settings-section-description">
          <span className="settings-icon">
            <Globe2 size={21} />
          </span>
          <h2>MVP boundaries</h2>
          <p>A focused, single-shop retail system.</p>
        </div>
        <section className="panel settings-panel">
          <div className="settings-data-body">
            <ul className="settings-facts">
              <li>
                <span>Currency</span>
                <strong>Single currency per shop</strong>
              </li>
              <li>
                <span>Access</span>
                <strong>Authenticated shop membership</strong>
              </li>
              <li>
                <span>History</span>
                <strong>Append-only financial and stock events</strong>
              </li>
              <li>
                <span>Not included</span>
                <strong>Tax engine, branches, invitations, or payment processing</strong>
              </li>
            </ul>
            <p className="form-hint">
              Selecting Digital records how money was received. Verdant does not charge a card or
              connect to a payment terminal.
            </p>
          </div>
        </section>
      </div>
    </>
  );
}
