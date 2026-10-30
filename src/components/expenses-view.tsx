"use client";
import { LocalizedForm, useDateFormatter, useMessage, useT } from "./preferences";

import { useId, useState } from "react";
import { Download, Plus, Receipt } from "lucide-react";
import type { DateRange, Expense, PageResult, Shop } from "../lib/types";
import { money } from "../lib/money";

import { todayInZone, useMutation } from "./hooks";
import {
  Button,
  DateRangeControl,
  EmptyState,
  FormActions,
  Modal,
  Notice,
  PageHeading,
  Pagination,
} from "./ui";
import { PaymentBadge } from "./sale-details";

export function ExpensesView({
  expenses,
  shop,
  range,
  total,
}: {
  expenses: PageResult<Expense>;
  shop: Shop;
  range: DateRange;
  total: string;
}) {
  const formatDate = useDateFormatter();
  const t = useT();
  const m = useMessage();
  const [open, setOpen] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  return (
    <>
      <PageHeading
        title={t("Expenses")}
        subtitle={t("Keep daily operating costs out of your head and in your books.")}
        actions={
          <>
            <a
              href={`/api/export?type=expenses&from=${range.from}&to=${range.to}`}
              className="button button--secondary"
            >
              <Download size={16} />
              {t("Export")}
            </a>
            <Button onClick={() => setOpen(true)}>
              <Plus size={17} />
              {t("Add expense")}
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
      <div className="expense-total-strip">
        <div className="expense-total-icon">
          <Receipt size={21} aria-hidden="true" />
        </div>
        <div>
          <span>{t("Total operating expenses")}</span>
          <strong>{money(total, shop.currency)}</strong>
        </div>
        <span className="expense-total-period">
          {m(range.label)} <span aria-hidden="true">·</span> {expenses.count.toLocaleString()}{" "}
          {expenses.count === 1 ? t("expense") : t("expenses")}
        </span>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>{t("Expense ledger")}</h2>
            <p>{t("Saved expenses automatically create cashbook outflows.")}</p>
          </div>
          <span className="muted small-text">{t("Most recent first")}</span>
        </div>
        {!expenses.rows.length ? (
          <EmptyState
            icon={Receipt}
            title={t("No expenses in this period")}
            description={t(
              "Record rent, utilities, transport, or other operating costs to keep your profit estimate useful.",
            )}
            action={
              <Button onClick={() => setOpen(true)}>
                <Plus size={16} />
                {t("Add your first expense")}
              </Button>
            }
          />
        ) : (
          <div className="table-scroll">
            <table className="data-table responsive-table">
              <caption className="sr-only">
                {t("Operating expenses for")} {m(range.label)}
              </caption>
              <thead>
                <tr>
                  <th>{t("Date")}</th>
                  <th>{t("Description")}</th>
                  <th>{t("Category")}</th>
                  <th>{t("Paid with")}</th>
                  <th className="numeric">{t("Amount")}</th>
                </tr>
              </thead>
              <tbody>
                {expenses.rows.map((expense) => (
                  <tr key={expense.id}>
                    <td data-label={t("Date")}>
                      {formatDate(expense.occurred_at, shop.time_zone, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </td>
                    <td data-label={t("Description")}>
                      <strong className="table-strong">{expense.description}</strong>
                    </td>
                    <td data-label={t("Category")}>
                      <span className="category-text">{expense.category}</span>
                    </td>
                    <td data-label={t("Paid with")}>
                      <PaymentBadge method={expense.method} />
                    </td>
                    <td data-label={t("Amount")} className="numeric amount-cell">
                      {money(expense.amount, shop.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination result={expenses} noun={t("expenses")} />
      </section>
      <p className="page-footnote">
        {t(
          "Inventory purchases belong in Receive stock, not operating expenses. Owner withdrawals are recorded in the cashbook and do not reduce profit.",
        )}
      </p>
      {open && (
        <ExpenseDialog
          shop={shop}
          onClose={() => setOpen(false)}
          onSuccess={() => {
            setOpen(false);
            setSuccess("Expense saved and added to the cashbook.");
          }}
        />
      )}
    </>
  );
}

function ExpenseDialog({
  shop,
  onClose,
  onSuccess,
}: {
  shop: Shop;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const t = useT();
  const id = useId();
  const mutation = useMutation();
  return (
    <Modal
      title={t("Add an expense")}
      description={t("Record an operating cost that has been paid.")}
      onClose={onClose}
      busy={mutation.pending}
      footer={
        <FormActions
          form={`${id}-expense`}
          label={t("Save expense")}
          pending={mutation.pending}
          onCancel={onClose}
        />
      }
    >
      <LocalizedForm
        id={`${id}-expense`}
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const result = await mutation.submit("expense", {
            description: String(form.get("description") ?? "").trim(),
            category: String(form.get("category") ?? "").trim(),
            amount: String(form.get("amount")),
            method: String(form.get("method")),
            occurred_on: String(form.get("occurred_on")),
          });
          if (result) onSuccess();
        }}
      >
        {mutation.error && <Notice>{mutation.error}</Notice>}
        <fieldset className="plain-fieldset form-grid" disabled={mutation.pending}>
          <label className="field field--full">
            <span>
              {t("What was it for?")} <span className="required-text">*</span>
            </span>
            <input
              data-autofocus
              name="description"
              placeholder={t("A short, useful description")}
              minLength={3}
              maxLength={240}
              required
            />
          </label>
          <label className="field field--full">
            <span>
              {t("Expense category")} <span className="required-text">*</span>
            </span>
            <input
              name="category"
              maxLength={80}
              placeholder={t("e.g. Rent, utilities, transport")}
              required
            />
          </label>
          <label className="field">
            <span>
              {t("Amount ·")} {shop.currency} <span className="required-text">*</span>
            </span>
            <input
              type="number"
              name="amount"
              min="0.01"
              max="999999999999.99"
              step="0.01"
              inputMode="decimal"
              placeholder="0.00"
              required
            />
          </label>
          <label className="field">
            <span>{t("Paid with")}</span>
            <select name="method" defaultValue="cash">
              <option value="cash">{t("Cash")}</option>
              <option value="digital">{t("Digital")}</option>
            </select>
          </label>
          <label className="field field--full">
            <span>{t("Expense date")}</span>
            <input
              name="occurred_on"
              type="date"
              defaultValue={todayInZone(shop.time_zone)}
              required
            />
            <span className="form-hint">
              {t("Recorded in")} {shop.time_zone.replaceAll("_", " ")}.
            </span>
          </label>
          <p className="form-hint field--full">
            {t(
              "Saved expenses are permanent ledger records. Check the amount and date before posting.",
            )}
          </p>
        </fieldset>
      </LocalizedForm>
    </Modal>
  );
}
