"use client";
import { LocalizedForm, useDateFormatter, useMessage, useT } from "./preferences";
import { message as sourceMessage } from "@/lib/translations";

import { useId, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Download, Plus, Wallet } from "lucide-react";
import type { CashEntry, DateRange, PageResult, Shop } from "../lib/types";
import { money } from "../lib/money";

import { todayInZone, useMutation } from "./hooks";
import {
  Button,
  DateRangeControl,
  EmptyState,
  FormActions,
  Metric,
  Modal,
  Notice,
  PageHeading,
  Pagination,
} from "./ui";
import { PaymentBadge } from "./sale-details";

const kindLabels = {
  sale: "Sale receipt",
  credit_collection: "Credit collection",
  refund: "Customer refund",
  supplier_payment: "Supplier payment",
  expense: "Expense",
  owner_withdrawal: "Owner withdrawal",
  owner_deposit: "Owner deposit",
} as const;
export function CashbookView({
  entries,
  shop,
  range,
  totals,
}: {
  entries: PageResult<CashEntry>;
  shop: Shop;
  range: DateRange;
  totals: { inflow: string; outflow: string; net: string };
}) {
  const formatDate = useDateFormatter();
  const t = useT();
  const m = useMessage();
  const [open, setOpen] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  return (
    <>
      <PageHeading
        title={t("Cashbook")}
        subtitle={t("A chronological record of money in and out. Not the same thing as profit.")}
        actions={
          <>
            <a
              href={`/api/export?type=cashbook&from=${range.from}&to=${range.to}`}
              className="button button--secondary"
            >
              <Download size={16} />
              {t("Export")}
            </a>
            <Button onClick={() => setOpen(true)}>
              <Plus size={17} />
              {t("Record movement")}
            </Button>
          </>
        }
      />
      {success && (
        <Notice tone="success" onDismiss={() => setSuccess(null)}>
          {success}
        </Notice>
      )}
      <div className="range-toolbar">
        <DateRangeControl range={range} />
        <span className="timezone-note">
          {shop.currency} · {shop.time_zone.replaceAll("_", " ")}
        </span>
      </div>
      <div className="metric-grid metric-grid--three">
        <Metric
          label={t("Money in")}
          value={money(totals.inflow, shop.currency)}
          detail={t("Sales, collections, and owner deposits")}
          icon={ArrowDownLeft}
          tone="green"
        />
        <Metric
          label={t("Money out")}
          value={money(totals.outflow, shop.currency)}
          detail={t("Refunds, expenses, and payments")}
          icon={ArrowUpRight}
        />
        <Metric
          label={t("Net movement")}
          value={money(totals.net, shop.currency)}
          detail={t("Cash and digital combined, not profit")}
          icon={Wallet}
        />
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>{t("Money ledger")}</h2>
            <p>
              {m(range.label)} {t("· Most recent first")}
            </p>
          </div>
          <span className="muted small-text">
            {entries.count.toLocaleString()} {t("entries")}
          </span>
        </div>
        {!entries.rows.length ? (
          <EmptyState
            icon={Wallet}
            title={t("No money movements in this period")}
            description={t(
              "Sales receipts, credit collections, refunds, and expenses appear automatically. Record an owner movement or supplier payment here.",
            )}
            action={
              <Button onClick={() => setOpen(true)}>
                <Plus size={16} />
                {t("Record a movement")}
              </Button>
            }
          />
        ) : (
          <div className="table-scroll">
            <table className="data-table responsive-table cashbook-table">
              <caption className="sr-only">
                {t("Cashbook ledger for")} {m(range.label)}
                {t(", newest first")}
              </caption>
              <thead>
                <tr>
                  <th>{t("Date & time")}</th>
                  <th>{t("Movement")}</th>
                  <th>{t("Description")}</th>
                  <th>{t("Method")}</th>
                  <th className="numeric">{t("Money in")}</th>
                  <th className="numeric">{t("Money out")}</th>
                </tr>
              </thead>
              <tbody>
                {entries.rows.map((entry) => (
                  <tr key={entry.id}>
                    <td data-label={t("Date & time")}>
                      <span>
                        {formatDate(entry.occurred_at, shop.time_zone, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                      <span className="cell-meta">
                        {formatDate(entry.occurred_at, shop.time_zone, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </td>
                    <td data-label={t("Movement")}>
                      <span className="movement-kind">
                        <span className={`direction-icon direction-icon--${entry.direction}`}>
                          {entry.direction === "in" ? (
                            <ArrowDownLeft size={15} aria-label={t("Money in")} />
                          ) : (
                            <ArrowUpRight size={15} aria-label={t("Money out")} />
                          )}
                        </span>
                        {t(kindLabels[entry.kind])}
                      </span>
                    </td>
                    <td data-label={t("Description")} className="ledger-description">
                      {entry.description}
                      {entry.source_id && (
                        <span className="cell-meta mono" title={entry.source_id}>
                          {t("Ref")} {entry.source_id.slice(0, 8)}
                        </span>
                      )}
                    </td>
                    <td data-label={t("Method")}>
                      <PaymentBadge method={entry.method} />
                    </td>
                    <td
                      data-label={t("Money in")}
                      className={`numeric${entry.direction === "in" ? " green-text amount-cell" : " muted"}`}
                    >
                      {entry.direction === "in" ? money(entry.amount, shop.currency) : "—"}
                    </td>
                    <td
                      data-label={t("Money out")}
                      className={`numeric${entry.direction === "out" ? " amount-cell" : " muted"}`}
                    >
                      {entry.direction === "out" ? money(entry.amount, shop.currency) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination result={entries} noun={t("entries")} />
      </section>
      <p className="page-footnote">
        {t(
          "Credit sales do not appear until collected. Purchases and owner movements affect money, not sales revenue. This ledger does not assert a physical cash-drawer balance.",
        )}
      </p>
      {open && (
        <CashMovementDialog
          shop={shop}
          onClose={() => setOpen(false)}
          onSuccess={(message) => {
            setOpen(false);
            setSuccess(message);
          }}
        />
      )}
    </>
  );
}

function CashMovementDialog({
  shop,
  onClose,
  onSuccess,
}: {
  shop: Shop;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const t = useT();
  const id = useId();
  const mutation = useMutation();
  const [kind, setKind] = useState("supplier_payment");
  return (
    <Modal
      title={t("Record money movement")}
      description={t("For manual supplier payments and money the owner puts in or takes out.")}
      onClose={onClose}
      busy={mutation.pending}
      footer={
        <FormActions
          form={`${id}-cash`}
          label={t("Record movement")}
          pending={mutation.pending}
          onCancel={onClose}
        />
      }
    >
      <LocalizedForm
        id={`${id}-cash`}
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const result = await mutation.submit("cash", {
            kind,
            description: String(form.get("description") ?? "").trim(),
            amount: String(form.get("amount")),
            method: String(form.get("method")),
            occurred_on: String(form.get("occurred_on")),
          });
          if (result) onSuccess(sourceMessage("Money movement recorded in your cashbook."));
        }}
      >
        {mutation.error && <Notice>{mutation.error}</Notice>}
        <fieldset disabled={mutation.pending} className="plain-fieldset form-grid">
          <label className="field field--full">
            <span>{t("Movement type")}</span>
            <select data-autofocus value={kind} onChange={(event) => setKind(event.target.value)}>
              <option value="supplier_payment">{t("Supplier payment — money out")}</option>
              <option value="owner_withdrawal">{t("Owner withdrawal — money out")}</option>
              <option value="owner_deposit">{t("Owner deposit — money in")}</option>
            </select>
          </label>
          <label className="field field--full">
            <span>
              {t("Description")} <span className="required-text">*</span>
            </span>
            <input
              name="description"
              required
              maxLength={240}
              minLength={3}
              placeholder={
                kind === "supplier_payment"
                  ? t("Supplier name and invoice reference")
                  : kind === "owner_deposit"
                    ? t("Reason for adding money")
                    : t("Reason for taking money out")
              }
            />
          </label>
          <label className="field">
            <span>
              {t("Amount ·")} {shop.currency} <span className="required-text">*</span>
            </span>
            <input
              name="amount"
              type="number"
              step="0.01"
              min="0.01"
              max="999999999999.99"
              inputMode="decimal"
              placeholder="0.00"
              required
            />
          </label>
          <label className="field">
            <span>{t("Payment method")}</span>
            <select name="method" defaultValue="cash">
              <option value="cash">{t("Cash")}</option>
              <option value="digital">{t("Digital")}</option>
            </select>
          </label>
          <label className="field field--full">
            <span>{t("Movement date")}</span>
            <input
              name="occurred_on"
              type="date"
              defaultValue={todayInZone(shop.time_zone)}
              required
            />
            <span className="form-hint">
              {t("Calendar date in")} {shop.time_zone.replaceAll("_", " ")}.
            </span>
          </label>
          <Notice tone="info">
            {kind === "supplier_payment"
              ? t(
                  "Use this only for a payment not already recorded with a stock receipt. It does not receive inventory or create an operating expense.",
                )
              : t(
                  "Owner movements change available money. They are not sales revenue or operating expenses.",
                )}
          </Notice>
        </fieldset>
      </LocalizedForm>
    </Modal>
  );
}
