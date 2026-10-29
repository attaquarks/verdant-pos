"use client";

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
import { formatDate } from "../lib/dates";
import { optional, useMutation, useRemote } from "./hooks";
import { unitCost } from "./format";
import { Badge, Button, EmptyState, FormActions, LoadingView, Modal, Notice } from "./ui";

export function PaymentBadge({ method }: { method: string }) {
  const Icon = method === "cash" ? Banknote : method === "digital" ? CreditCard : Wallet;
  return (
    <span className="payment-label">
      <Icon size={14} aria-hidden="true" />
      {method === "credit" ? "Credit" : method === "digital" ? "Digital" : "Cash"}
    </span>
  );
}
export function SaleStatus({ sale }: { sale: Sale }) {
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
      {label}
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
        title={detail ? `Sale ${detail.sale.reference}` : "Sale details"}
        description={
          detail
            ? date(detail.sale.occurred_at)
            : "Loading the original sale and its audit history."
        }
        wide
        onClose={onClose}
        footer={
          <>
            <span className="muted small-text">Posted records are never deleted.</span>
            <Button variant="secondary" onClick={onClose}>
              Close
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
          <LoadingView compact label="Loading sale details…" />
        ) : remote.error ? (
          <Notice>
            {remote.error}
            <Button variant="ghost" size="sm" onClick={remote.reload}>
              Try again
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
                <strong>{detail.sale.customer_name || "Walk-in customer"}</strong>
                {detail.sale.customer_contact && <span>{detail.sale.customer_contact}</span>}
              </div>
            </div>
            <div className="table-scroll">
              <table className="data-table detail-items-table">
                <caption className="sr-only">
                  Original sale item snapshots. Catalog changes do not affect these amounts.
                </caption>
                <thead>
                  <tr>
                    <th>Original product</th>
                    <th className="numeric">Quantity</th>
                    <th className="numeric">Unit price</th>
                    <th className="numeric">Discount</th>
                    <th className="numeric">Line total</th>
                    <th className="numeric">Original cost</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong className="table-strong">{item.product_name}</strong>
                        <span className="cell-meta">
                          {[item.sku, item.category_name].filter(Boolean).join(" · ") ||
                            "Uncategorized"}
                        </span>
                      </td>
                      <td className="numeric">
                        {quantity(item.quantity)} {item.unit}
                        {new Exact(item.returned_quantity).gt(0) && (
                          <span className="cell-meta amber-text">
                            {quantity(item.returned_quantity)} returned
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
                          <span className="unavailable">Unavailable</span>
                        ) : (
                          money(item.cost_total, shop.currency)
                        )}
                        {item.unit_cost !== null && (
                          <span className="cell-meta">
                            Unit {unitCost(item.unit_cost, shop.currency)}
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
                    <h3>Sale note</h3>
                    <p>{detail.sale.note}</p>
                  </>
                )}
                <p className="form-hint">
                  Prices, discounts, and costs above are the original historical snapshots. Unknown
                  costs remain unavailable.
                </p>
              </div>
              <dl className="totals-list">
                <div>
                  <dt>Original subtotal</dt>
                  <dd>{money(detail.sale.subtotal, shop.currency)}</dd>
                </div>
                <div>
                  <dt>Line discounts</dt>
                  <dd>−{money(detail.sale.discount_total, shop.currency)}</dd>
                </div>
                <div>
                  <dt>Original sale total</dt>
                  <dd>{money(detail.sale.total, shop.currency)}</dd>
                </div>
                <div>
                  <dt>Returns / reversal</dt>
                  <dd>−{money(detail.sale.returned_total, shop.currency)}</dd>
                </div>
                <div className="totals-primary">
                  <dt>Net sale value</dt>
                  <dd>{money(detail.sale.net_total, shop.currency)}</dd>
                </div>
                <div>
                  <dt>Net payments collected</dt>
                  <dd>{money(detail.sale.collected_total, shop.currency)}</dd>
                </div>
                <div className={new Exact(detail.sale.balance_due).gt(0) ? "totals-balance" : ""}>
                  <dt>Balance due</dt>
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
                      Collect payment
                    </Button>
                  )}
                  {returnable && (
                    <Button variant="secondary" onClick={() => setAction("return")}>
                      <ArrowDownLeft size={16} />
                      Return items
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
                    Reverse entire sale
                  </Button>
                )}
              </div>
            )}
            <div className="detail-history-grid">
              <section className="history-section">
                <h3>
                  <Banknote size={16} />
                  Payment history
                </h3>
                {!detail.payments.length ? (
                  <p className="muted small-text">No money has been collected.</p>
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
                                ? "Credit collection"
                                : payment.kind === "refund"
                                  ? "Refund"
                                  : "Sale payment"}{" "}
                              <span className="muted">· {payment.method}</span>
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
                  Adjustment history
                </h3>
                {!detail.adjustments.length ? (
                  <p className="muted small-text">No returns or reversals recorded.</p>
                ) : (
                  <ul className="event-list">
                    {[...detail.adjustments]
                      .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))
                      .map((adjustment) => (
                        <li key={adjustment.id}>
                          <span className="event-dot event-dot--amber" />
                          <div>
                            <strong>
                              {adjustment.kind === "reversal" ? "Sale reversed" : "Items returned"}
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
            title="Sale unavailable"
            description="This sale may not belong to your shop."
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
  return (
    <label className="field">
      <span>{label}</span>
      <select name={name} disabled={disabled} defaultValue="cash">
        <option value="cash">Cash</option>
        <option value="digital">Digital</option>
      </select>
    </label>
  );
}

function CollectDialog({ sale, shop, onClose, onSuccess }: { sale: Sale; shop: Shop } & Done) {
  const id = useId();
  const mutation = useMutation();
  return (
    <Modal
      title="Collect credit payment"
      description={`Record money received for sale ${sale.reference}.`}
      onClose={onClose}
      busy={mutation.pending}
      footer={
        <FormActions
          form={`${id}-collect`}
          label="Record collection"
          pending={mutation.pending}
          onCancel={onClose}
        />
      }
    >
      <div className="balance-callout">
        <span>Outstanding balance</span>
        <strong>{money(sale.balance_due, shop.currency)}</strong>
      </div>
      <form
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
          if (result) onSuccess("Payment collected and added to the cashbook.");
        }}
      >
        {mutation.error && <Notice>{mutation.error}</Notice>}
        <fieldset className="plain-fieldset form-grid" disabled={mutation.pending}>
          <label className="field">
            <span>
              Amount received · {shop.currency} <span className="required-text">*</span>
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
              Collection note <span className="optional">(optional)</span>
            </span>
            <textarea name="note" maxLength={500} rows={2} />
          </label>
          <p className="form-hint field--full">
            Collections reduce the outstanding balance and create a receipt. They do not create
            additional sales revenue.
          </p>
        </fieldset>
      </form>
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
      title="Return items"
      description={`Choose the items and quantities from sale ${detail.sale.reference}.`}
      onClose={onClose}
      busy={mutation.pending}
      footer={
        <FormActions
          form={`${id}-return`}
          label="Record return"
          pending={mutation.pending}
          onCancel={onClose}
        />
      }
    >
      <form
        id={`${id}-return`}
        onSubmit={async (event) => {
          event.preventDefault();
          setValidation(null);
          if (!selected.length) {
            setValidation("Select at least one item to return.");
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
              "Return quantities must be greater than zero and cannot exceed the remaining quantity.",
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
            onSuccess("Return recorded. Sale balance, stock, and any refund have been updated.");
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
                        {quantity(remaining)} {line.item.unit} returnable · Original line{" "}
                        {money(line.item.line_total, shop.currency)}
                      </small>
                    </span>
                  </label>
                  <label className="field return-quantity">
                    <span>Return quantity</span>
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
                      aria-label={`Return quantity for ${line.item.product_name}`}
                    />
                  </label>
                  <label className="checkbox-row restock-option">
                    <input
                      type="checkbox"
                      checked={line.restock}
                      disabled={!line.selected}
                      onChange={(event) => update(line.item.id, { restock: event.target.checked })}
                    />
                    <span>Restock</span>
                  </label>
                </div>
              );
            })}
          </div>
          <p className="form-hint">
            Uncheck Restock for damaged or unsellable items. All selected quantities still reduce
            the net sale.
          </p>
          <div className="form-grid">
            <label className="field field--full">
              <span>
                Return reason <span className="required-text">*</span>
              </span>
              <textarea
                name="reason"
                rows={2}
                minLength={3}
                maxLength={500}
                required
                placeholder="Why are these items being returned?"
              />
            </label>
            <MethodSelect name="refund_method" label="Refund method, if money is owed" />
            <div className="field">
              <span className="field-label">Selected items</span>
              <div className="read-only-value">
                {selected.length} of {lines.length}
              </div>
            </div>
          </div>
          <Notice tone="info">
            The server prorates the original discounts and costs exactly. Unpaid credit is reduced
            first; a refund is issued only for money paid beyond the remaining sale value. The
            adjustment is dated today.
          </Notice>
        </fieldset>
      </form>
    </Modal>
  );
}

function ReverseDialog({ sale, shop, onClose, onSuccess }: { sale: Sale; shop: Shop } & Done) {
  const id = useId();
  const mutation = useMutation();
  const [confirmed, setConfirmed] = useState(false);
  return (
    <Modal
      title="Reverse the entire sale?"
      description={`Sale ${sale.reference} · ${money(sale.total, shop.currency)}`}
      onClose={onClose}
      busy={mutation.pending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.pending}>
            Keep sale
          </Button>
          <Button
            type="submit"
            form={`${id}-reverse`}
            variant="danger"
            pending={mutation.pending}
            disabled={!confirmed}
          >
            Reverse sale
          </Button>
        </>
      }
    >
      <Notice tone="warning">
        This posts a permanent reversal, restocks every original item, and refunds any money due.
        The original sale stays visible. This cannot be undone.
      </Notice>
      <form
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
            onSuccess(`Sale ${sale.reference} reversed. The original record has been preserved.`);
        }}
      >
        {mutation.error && <Notice>{mutation.error}</Notice>}
        <fieldset className="plain-fieldset form-grid" disabled={mutation.pending}>
          <label className="field field--full">
            <span>
              Reason for full reversal <span className="required-text">*</span>
            </span>
            <textarea
              data-autofocus
              name="reason"
              rows={3}
              minLength={3}
              maxLength={500}
              required
              placeholder="Explain why this whole sale must be reversed"
            />
          </label>
          <MethodSelect name="refund_method" label="Refund method, if money is owed" />
          <p className="form-hint field--full">
            Unpaid credit is cancelled without creating a cash refund. For a sale with earlier
            returns, return the remaining items instead.
          </p>
          <label className="checkbox-row field--full confirmation-checkbox">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
              required
            />
            <span>I understand this reverses the whole sale and returns all items to stock.</span>
          </label>
        </fieldset>
      </form>
    </Modal>
  );
}
