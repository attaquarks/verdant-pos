"use client";
import { LocalizedForm, useDateFormatter, useMessage, useT } from "./preferences";
import { message as sourceMessage } from "@/lib/translations";

import { useId, useState } from "react";
import {
  ArrowDownLeft,
  Banknote,
  CreditCard,
  History,
  RotateCcw,
  ShoppingBag,
  Wallet,
} from "lucide-react";
import type { Sale, SaleDetail, SaleItem, Shop } from "../lib/types";
import { Exact, money, quantity } from "../lib/money";

import { optional, useMutation, useRemote } from "./hooks";
import { unitCost } from "./format";
import { Badge, Button, EmptyState, FormActions, LoadingView, Modal, Notice } from "./ui";

export function PaymentBadge({ method }: { method: string }) {
  const t = useT();
  const Icon = method === "cash" ? Banknote : method === "digital" ? CreditCard : Wallet;
  return (
    <span className="payment-label">
      <Icon size={14} aria-hidden="true" />
      {method === "credit" ? t("Credit") : method === "digital" ? t("Digital") : t("Cash")}
    </span>
  );
}
export function SaleStatus({ sale }: { sale: Sale }) {
  const m = useMessage();
  const label =
    sale.status === "reversed"
      ? "Reversed"
      : sale.status === "returned"
        ? "Returned"
        : sale.status === "partially_returned"
          ? "Partial return"
          : sale.payment_status === "unpaid"
            ? "Unpaid"
            : sale.payment_status === "partially_paid"
              ? "Part paid"
              : "Paid";
  return (
    <Badge
      dot
      tone={
        sale.status === "reversed" || sale.status === "returned"
          ? "neutral"
          : sale.status === "partially_returned" || new Exact(sale.balance_due).gt(0)
            ? "amber"
            : "green"
      }
    >
      {m(label)}
    </Badge>
  );
}

export function SaleDetailsDialog({
  saleId,
  shop,
  onClose,
  onMutation,
}: {
  saleId: string;
  shop: Shop;
  onClose: () => void;
  onMutation?: (message: string) => void;
}) {
  const formatDate = useDateFormatter();
  const t = useT();
  const m = useMessage();
  const remote = useRemote<SaleDetail>(`/api/sales/${saleId}`);
  const [action, setAction] = useState<"collect" | "return" | "reverse" | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const detail = remote.data;
  function done(message: string) {
    setAction(null);
    setSuccess(message);
    onMutation?.(message);
    remote.reload();
  }
  const date = (value: string) =>
    formatDate(value, shop.time_zone, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  const returnable =
    detail?.items.some((item) => new Exact(item.quantity).gt(item.returned_quantity)) &&
    detail.sale.status !== "reversed";
  const hasReturns =
    detail?.items.some((item) => new Exact(item.returned_quantity).gt(0)) ||
    Boolean(detail?.adjustments.length);
  return (
    <>
      <Modal
        title={detail ? t("Sale {v0}", { v0: detail.sale.reference }) : t("Sale details")}
        description={
          detail
            ? date(detail.sale.occurred_at)
            : t("Loading the original sale and its audit history.")
        }
        wide
        onClose={onClose}
        footer={
          <>
            <span className="muted small-text">{t("Posted records are never deleted.")}</span>
            <Button variant="secondary" onClick={onClose}>
              {t("Close")}
            </Button>
          </>
        }
      >
        {success && (
          <Notice tone="success" onDismiss={() => setSuccess(null)}>
            {success}
          </Notice>
        )}
        {remote.loading ? (
          <LoadingView compact label={t("Loading sale details…")} />
        ) : remote.error ? (
          <Notice>
            {remote.error}
            <Button variant="ghost" size="sm" onClick={remote.reload}>
              {t("Try again")}
            </Button>
          </Notice>
        ) : detail ? (
          <>
            <div className="sale-detail-summary">
              <div>
                <SaleStatus sale={detail.sale} />
                <span className="sale-detail-method">
                  <PaymentBadge method={detail.sale.payment_method} />
                </span>
              </div>
              <div className="detail-customer">
                <strong>{detail.sale.customer_name || t("Walk-in customer")}</strong>
                {detail.sale.customer_contact && <span>{detail.sale.customer_contact}</span>}
              </div>
            </div>
            <div className="table-scroll">
              <table className="data-table detail-items-table">
                <caption className="sr-only">
                  {t("Original sale item snapshots. Catalog changes do not affect these amounts.")}
                </caption>
                <thead>
                  <tr>
                    <th>{t("Original product")}</th>
                    <th className="numeric">{t("Quantity")}</th>
                    <th className="numeric">{t("Unit price")}</th>
                    <th className="numeric">{t("Discount")}</th>
                    <th className="numeric">{t("Line total")}</th>
                    <th className="numeric">{t("Original cost")}</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong className="table-strong">{item.product_name}</strong>
                        <span className="cell-meta">
                          {[item.sku, item.category_name].filter(Boolean).join(" · ") ||
                            t("Uncategorized")}
                        </span>
                      </td>
                      <td className="numeric">
                        {quantity(item.quantity)} {item.unit}
                        {new Exact(item.returned_quantity).gt(0) && (
                          <span className="cell-meta amber-text">
                            {quantity(item.returned_quantity)} {t("returned")}
                          </span>
                        )}
                      </td>
                      <td className="numeric">{money(item.unit_price, shop.currency)}</td>
                      <td className="numeric">{money(item.discount, shop.currency)}</td>
                      <td className="numeric amount-cell">
                        {money(item.line_total, shop.currency)}
                      </td>
                      <td className="numeric">
                        {item.cost_total === null ? (
                          <span className="unavailable">{t("Unavailable")}</span>
                        ) : (
                          money(item.cost_total, shop.currency)
                        )}
                        {item.unit_cost !== null && (
                          <span className="cell-meta">
                            {t("Unit")} {unitCost(item.unit_cost, shop.currency, t("Unavailable"))}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="sale-detail-bottom">
              <div className="sale-detail-notes">
                {detail.sale.note && (
                  <>
                    <h3>{t("Sale note")}</h3>
                    <p>{detail.sale.note}</p>
                  </>
                )}
                <p className="form-hint">
                  {t(
                    "Prices, discounts, and costs above are the original historical snapshots. Unknown costs remain unavailable.",
                  )}
                </p>
              </div>
              <dl className="totals-list">
                <div>
                  <dt>{t("Original subtotal")}</dt>
                  <dd>{money(detail.sale.subtotal, shop.currency)}</dd>
                </div>
                <div>
                  <dt>{t("Line discounts")}</dt>
                  <dd>−{money(detail.sale.discount_total, shop.currency)}</dd>
                </div>
                <div>
                  <dt>{t("Original sale total")}</dt>
                  <dd>{money(detail.sale.total, shop.currency)}</dd>
                </div>
                <div>
                  <dt>{t("Returns / reversal")}</dt>
                  <dd>−{money(detail.sale.returned_total, shop.currency)}</dd>
                </div>
                <div className="totals-primary">
                  <dt>{t("Net sale value")}</dt>
                  <dd>{money(detail.sale.net_total, shop.currency)}</dd>
                </div>
                <div>
                  <dt>{t("Net payments collected")}</dt>
                  <dd>{money(detail.sale.collected_total, shop.currency)}</dd>
                </div>
                <div className={new Exact(detail.sale.balance_due).gt(0) ? "totals-balance" : ""}>
                  <dt>{t("Balance due")}</dt>
                  <dd>{money(detail.sale.balance_due, shop.currency)}</dd>
                </div>
              </dl>
            </div>
            {(returnable || new Exact(detail.sale.balance_due).gt(0)) && (
              <div className="detail-actions">
                <div className="button-row">
                  {new Exact(detail.sale.balance_due).gt(0) && (
                    <Button onClick={() => setAction("collect")}>
                      <Banknote size={16} />
                      {t("Collect payment")}
                    </Button>
                  )}
                  {returnable && (
                    <Button variant="secondary" onClick={() => setAction("return")}>
                      <ArrowDownLeft size={16} />
                      {t("Return items")}
                    </Button>
                  )}
                </div>
                {detail.sale.status === "posted" && !hasReturns && (
                  <Button
                    variant="ghost"
                    className="danger-text"
                    onClick={() => setAction("reverse")}
                  >
                    <RotateCcw size={15} />
                    {t("Reverse entire sale")}
                  </Button>
                )}
              </div>
            )}
            <div className="detail-history-grid">
              <section className="history-section">
                <h3>
                  <Banknote size={16} />
                  {t("Payment history")}
                </h3>
                {!detail.payments.length ? (
                  <p className="muted small-text">{t("No money has been collected.")}</p>
                ) : (
                  <ul className="event-list">
                    {[...detail.payments]
                      .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))
                      .map((payment) => (
                        <li key={payment.id}>
                          <span
                            className={`event-dot${payment.kind === "refund" ? " event-dot--amber" : ""}`}
                          />
                          <div>
                            <strong>
                              {payment.kind === "collection"
                                ? t("Credit collection")
                                : payment.kind === "refund"
                                  ? t("Refund")
                                  : t("Sale payment")}{" "}
                              <span className="muted">· {m(payment.method)}</span>
                            </strong>
                            <span>{date(payment.occurred_at)}</span>
                            {payment.note && <p>{payment.note}</p>}
                          </div>
                          <strong className={payment.kind === "refund" ? "danger-text" : ""}>
                            {payment.kind === "refund" ? "−" : ""}
                            {money(new Exact(payment.amount).abs().toString(), shop.currency)}
                          </strong>
                        </li>
                      ))}
                  </ul>
                )}
              </section>
              <section className="history-section">
                <h3>
                  <History size={16} />
                  {t("Adjustment history")}
                </h3>
                {!detail.adjustments.length ? (
                  <p className="muted small-text">{t("No returns or reversals recorded.")}</p>
                ) : (
                  <ul className="event-list">
                    {[...detail.adjustments]
                      .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))
                      .map((adjustment) => (
                        <li key={adjustment.id}>
                          <span className="event-dot event-dot--amber" />
                          <div>
                            <strong>
                              {adjustment.kind === "reversal"
                                ? t("Sale reversed")
                                : t("Items returned")}
                            </strong>
                            <span>{date(adjustment.occurred_at)}</span>
                            <p>{adjustment.reason}</p>
                          </div>
                          <strong>
                            −{money(new Exact(adjustment.total).abs().toString(), shop.currency)}
                          </strong>
                        </li>
                      ))}
                  </ul>
                )}
              </section>
            </div>
          </>
        ) : (
          <EmptyState
            compact
            icon={ShoppingBag}
            title={t("Sale unavailable")}
            description={t("This sale may not belong to your shop.")}
          />
        )}
      </Modal>
      {action === "collect" && detail && (
        <CollectDialog
          sale={detail.sale}
          shop={shop}
          onClose={() => setAction(null)}
          onSuccess={done}
        />
      )}
      {action === "return" && detail && (
        <ReturnDialog
          detail={detail}
          shop={shop}
          onClose={() => setAction(null)}
          onSuccess={done}
        />
      )}
      {action === "reverse" && detail && (
        <ReverseDialog
          sale={detail.sale}
          shop={shop}
          onClose={() => setAction(null)}
          onSuccess={done}
        />
      )}
    </>
  );
}

type Done = { onClose: () => void; onSuccess: (message: string) => void };
function MethodSelect({
  name = "method",
  label = "Payment method",
  disabled = false,
}: {
  name?: string;
  label?: string;
  disabled?: boolean;
}) {
  const t = useT();
  const m = useMessage();
  return (
    <label className="field">
      <span>{m(label)}</span>
      <select name={name} disabled={disabled} defaultValue="cash">
        <option value="cash">{t("Cash")}</option>
        <option value="digital">{t("Digital")}</option>
      </select>
    </label>
  );
}

function CollectDialog({ sale, shop, onClose, onSuccess }: { sale: Sale; shop: Shop } & Done) {
  const t = useT();
  const id = useId();
  const mutation = useMutation();
  return (
    <Modal
      title={t("Collect credit payment")}
      description={t("Record money received for sale {v0}.", { v0: sale.reference })}
      onClose={onClose}
      busy={mutation.pending}
      footer={
        <FormActions
          form={`${id}-collect`}
          label={t("Record collection")}
          pending={mutation.pending}
          onCancel={onClose}
        />
      }
    >
      <div className="balance-callout">
        <span>{t("Outstanding balance")}</span>
        <strong>{money(sale.balance_due, shop.currency)}</strong>
      </div>
      <LocalizedForm
        id={`${id}-collect`}
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const result = await mutation.submit("collect", {
            sale_id: sale.id,
            amount: String(form.get("amount")),
            method: String(form.get("method")),
            note: optional(form.get("note")),
          });
          if (result) onSuccess(sourceMessage("Payment collected and added to the cashbook."));
        }}
      >
        {mutation.error && <Notice>{mutation.error}</Notice>}
        <fieldset className="plain-fieldset form-grid" disabled={mutation.pending}>
          <label className="field">
            <span>
              {t("Amount received ·")} {shop.currency} <span className="required-text">*</span>
            </span>
            <input
              data-autofocus
              type="number"
              name="amount"
              min="0.01"
              max={sale.balance_due}
              step="0.01"
              inputMode="decimal"
              defaultValue={sale.balance_due}
              required
            />
          </label>
          <MethodSelect />
          <label className="field field--full">
            <span>
              {t("Collection note")} <span className="optional">{t("(optional)")}</span>
            </span>
            <textarea name="note" maxLength={500} rows={2} />
          </label>
          <p className="form-hint field--full">
            {t(
              "Collections reduce the outstanding balance and create a receipt. They do not create additional sales revenue.",
            )}
          </p>
        </fieldset>
      </LocalizedForm>
    </Modal>
  );
}

type ReturnLine = { item: SaleItem; selected: boolean; quantity: string; restock: boolean };
function ReturnDialog({
  detail,
  shop,
  onClose,
  onSuccess,
}: { detail: SaleDetail; shop: Shop } & Done) {
  const t = useT();
  const id = useId();
  const mutation = useMutation();
  const [validation, setValidation] = useState<string | null>(null);
  const [lines, setLines] = useState<ReturnLine[]>(
    detail.items
      .filter((item) => new Exact(item.quantity).gt(item.returned_quantity))
      .map((item) => ({
        item,
        selected: false,
        quantity: new Exact(item.quantity).minus(item.returned_quantity).toString(),
        restock: true,
      })),
  );
  const update = (itemId: string, change: Partial<ReturnLine>) => {
    setLines((current) =>
      current.map((line) => (line.item.id === itemId ? { ...line, ...change } : line)),
    );
    setValidation(null);
  };
  const selected = lines.filter((line) => line.selected);
  return (
    <Modal
      wide
      title={t("Return items")}
      description={t("Choose the items and quantities from sale {v0}.", {
        v0: detail.sale.reference,
      })}
      onClose={onClose}
      busy={mutation.pending}
      footer={
        <FormActions
          form={`${id}-return`}
          label={t("Record return")}
          pending={mutation.pending}
          onCancel={onClose}
        />
      }
    >
      <LocalizedForm
        id={`${id}-return`}
        onSubmit={async (event) => {
          event.preventDefault();
          setValidation(null);
          if (!selected.length) {
            setValidation(sourceMessage("Select at least one item to return."));
            return;
          }
          const invalid = selected.some((line) => {
            try {
              const qty = new Exact(line.quantity);
              return (
                !qty.gt(0) ||
                qty.gt(new Exact(line.item.quantity).minus(line.item.returned_quantity))
              );
            } catch {
              return true;
            }
          });
          if (invalid) {
            setValidation(
              sourceMessage(
                "Return quantities must be greater than zero and cannot exceed the remaining quantity.",
              ),
            );
            return;
          }
          const form = new FormData(event.currentTarget);
          const result = await mutation.submit("return", {
            sale_id: detail.sale.id,
            items: selected.map((line) => ({
              sale_item_id: line.item.id,
              quantity: line.quantity,
              restock: line.restock,
            })),
            reason: String(form.get("reason") ?? "").trim(),
            refund_method: String(form.get("refund_method")),
          });
          if (result)
            onSuccess(
              sourceMessage(
                "Return recorded. Sale balance, stock, and any refund have been updated.",
              ),
            );
        }}
      >
        {(validation || mutation.error) && <Notice>{validation || mutation.error}</Notice>}
        <fieldset disabled={mutation.pending} className="plain-fieldset">
          <div className="return-lines">
            {lines.map((line) => {
              const remaining = new Exact(line.item.quantity)
                .minus(line.item.returned_quantity)
                .toString();
              return (
                <div
                  className={`return-line${line.selected ? " is-selected" : ""}`}
                  key={line.item.id}
                >
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={line.selected}
                      onChange={(event) => update(line.item.id, { selected: event.target.checked })}
                    />
                    <span>
                      <strong>{line.item.product_name}</strong>
                      <small>
                        {quantity(remaining)} {line.item.unit} {t("returnable · Original line")}{" "}
                        {money(line.item.line_total, shop.currency)}
                      </small>
                    </span>
                  </label>
                  <label className="field return-quantity">
                    <span>{t("Return quantity")}</span>
                    <input
                      type="number"
                      min="0.001"
                      step="0.001"
                      max={remaining}
                      inputMode="decimal"
                      value={line.quantity}
                      disabled={!line.selected}
                      onChange={(event) => update(line.item.id, { quantity: event.target.value })}
                      required={line.selected}
                      aria-label={t("Return quantity for {v0}", { v0: line.item.product_name })}
                    />
                  </label>
                  <label className="checkbox-row restock-option">
                    <input
                      type="checkbox"
                      checked={line.restock}
                      disabled={!line.selected}
                      onChange={(event) => update(line.item.id, { restock: event.target.checked })}
                    />
                    <span>{t("Restock")}</span>
                  </label>
                </div>
              );
            })}
          </div>
          <p className="form-hint">
            {t(
              "Uncheck Restock for damaged or unsellable items. All selected quantities still reduce the net sale.",
            )}
          </p>
          <div className="form-grid">
            <label className="field field--full">
              <span>
                {t("Return reason")} <span className="required-text">*</span>
              </span>
              <textarea
                name="reason"
                rows={2}
                minLength={3}
                maxLength={500}
                required
                placeholder={t("Why are these items being returned?")}
              />
            </label>
            <MethodSelect name="refund_method" label={t("Refund method, if money is owed")} />
            <div className="field">
              <span className="field-label">{t("Selected items")}</span>
              <div className="read-only-value">
                {t("{v0} of {v1}", { v0: selected.length, v1: lines.length })}
              </div>
            </div>
          </div>
          <Notice tone="info">
            {t(
              "The server prorates the original discounts and costs exactly. Unpaid credit is reduced first; a refund is issued only for money paid beyond the remaining sale value. The adjustment is dated today.",
            )}
          </Notice>
        </fieldset>
      </LocalizedForm>
    </Modal>
  );
}

function ReverseDialog({ sale, shop, onClose, onSuccess }: { sale: Sale; shop: Shop } & Done) {
  const t = useT();
  const id = useId();
  const mutation = useMutation();
  const [confirmed, setConfirmed] = useState(false);
  return (
    <Modal
      title={t("Reverse the entire sale?")}
      description={t("Sale {v0} · {v1}", {
        v0: sale.reference,
        v1: money(sale.total, shop.currency),
      })}
      onClose={onClose}
      busy={mutation.pending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.pending}>
            {t("Keep sale")}
          </Button>
          <Button
            type="submit"
            form={`${id}-reverse`}
            variant="danger"
            pending={mutation.pending}
            disabled={!confirmed}
          >
            {t("Reverse sale")}
          </Button>
        </>
      }
    >
      <Notice tone="warning">
        {t(
          "This posts a permanent reversal, restocks every original item, and refunds any money due. The original sale stays visible. This cannot be undone.",
        )}
      </Notice>
      <LocalizedForm
        id={`${id}-reverse`}
        onSubmit={async (event) => {
          event.preventDefault();
          if (!confirmed) return;
          const form = new FormData(event.currentTarget);
          const result = await mutation.submit("reverse", {
            sale_id: sale.id,
            reason: String(form.get("reason") ?? "").trim(),
            refund_method: String(form.get("refund_method")),
          });
          if (result)
            onSuccess(
              sourceMessage("Sale {v0} reversed. The original record has been preserved.", {
                v0: sale.reference,
              }),
            );
        }}
      >
        {mutation.error && <Notice>{mutation.error}</Notice>}
        <fieldset className="plain-fieldset form-grid" disabled={mutation.pending}>
          <label className="field field--full">
            <span>
              {t("Reason for full reversal")} <span className="required-text">*</span>
            </span>
            <textarea
              data-autofocus
              name="reason"
              rows={3}
              minLength={3}
              maxLength={500}
              required
              placeholder={t("Explain why this whole sale must be reversed")}
            />
          </label>
          <MethodSelect name="refund_method" label={t("Refund method, if money is owed")} />
          <p className="form-hint field--full">
            {t(
              "Unpaid credit is cancelled without creating a cash refund. For a sale with earlier returns, return the remaining items instead.",
            )}
          </p>
          <label className="checkbox-row field--full confirmation-checkbox">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
              required
            />
            <span>
              {t("I understand this reverses the whole sale and returns all items to stock.")}
            </span>
          </label>
        </fieldset>
      </LocalizedForm>
    </Modal>
  );
}
