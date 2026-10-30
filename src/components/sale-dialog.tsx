"use client";
import { LocalizedForm, useT } from "./preferences";
import { message as sourceMessage } from "@/lib/translations";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import type Decimal from "decimal.js";
import {
  Banknote,
  Check,
  CreditCard,
  Loader2,
  Plus,
  Search,
  ShoppingBag,
  Trash2,
  UserRound,
  Wallet,
} from "lucide-react";
import type { Product, SaleLineInput, SalePaymentMethod, Shop } from "../lib/types";
import { getJSON } from "../lib/client-api";
import { Exact, lineTotal, money, quantity, stockStatus } from "../lib/money";
import { useMutation } from "./hooks";
import { Badge, Button, IconButton, Modal, Notice } from "./ui";

type DraftLine = { product: Product; quantity: string; unit_price: string; discount: string };
type SavedDraft = {
  lines: DraftLine[];
  method: SalePaymentMethod;
  customer: string;
  contact: string;
  note: string;
};
function isSavedDraft(value: unknown): value is SavedDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<SavedDraft>;
  if (
    !Array.isArray(draft.lines) ||
    !draft.lines.length ||
    draft.lines.length > 100 ||
    !["cash", "digital", "credit"].includes(draft.method ?? "") ||
    typeof draft.customer !== "string" ||
    typeof draft.contact !== "string" ||
    typeof draft.note !== "string"
  )
    return false;
  try {
    return draft.lines.every(
      (line) =>
        line &&
        typeof line.quantity === "string" &&
        typeof line.unit_price === "string" &&
        typeof line.discount === "string" &&
        line.product &&
        typeof line.product.id === "string" &&
        typeof line.product.name === "string" &&
        typeof line.product.unit === "string" &&
        typeof line.product.current_stock === "string" &&
        new Exact(line.quantity).isFinite() &&
        new Exact(line.unit_price).isFinite() &&
        new Exact(line.discount).isFinite() &&
        new Exact(line.product.current_stock).isFinite(),
    );
  } catch {
    return false;
  }
}
function amount(line: DraftLine) {
  try {
    const qty = new Exact(line.quantity || 0),
      price = new Exact(line.unit_price || 0),
      discount = new Exact(line.discount || 0);
    if (
      !qty.isFinite() ||
      !price.isFinite() ||
      !discount.isFinite() ||
      !qty.gt(0) ||
      price.lt(0) ||
      discount.lt(0) ||
      discount.gt(qty.times(price).toDecimalPlaces(2))
    )
      return null;
    const result = String(lineTotal(line.quantity, line.unit_price, line.discount));
    return new Exact(result).isNegative() ? null : result;
  } catch {
    return null;
  }
}

export function SaleDialog({
  shop,
  initialProduct,
  onClose,
  onSuccess,
}: {
  shop: Shop;
  initialProduct?: Product;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const t = useT();
  const id = useId();
  const [lines, setLines] = useState<DraftLine[]>(
    initialProduct
      ? [
          {
            product: initialProduct,
            quantity: new Exact(initialProduct.current_stock).lt(1)
              ? initialProduct.current_stock
              : "1",
            unit_price: initialProduct.selling_price,
            discount: "0",
          },
        ]
      : [],
  );
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [method, setMethod] = useState<SalePaymentMethod>("cash");
  const [customer, setCustomer] = useState("");
  const [contact, setContact] = useState("");
  const [note, setNote] = useState("");
  const [validation, setValidation] = useState<string | null>(null);
  const [searchRevision, setSearchRevision] = useState(0);
  const [restored, setRestored] = useState(false);
  const draftKey = `verdant.sale.pending-draft.v1.${shop.id}`;
  const intentKey = `verdant.sale.pending-intent.v1.${shop.id}`;
  const quantityRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const searchRef = useRef<HTMLInputElement>(null);
  const mutation = useMutation(intentKey);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(draftKey);
      if (!raw || !sessionStorage.getItem(intentKey)) return;
      const saved: unknown = JSON.parse(raw);
      if (!isSavedDraft(saved)) return;
      setLines(saved.lines);
      setMethod(saved.method);
      setCustomer(saved.customer);
      setContact(saved.contact);
      setNote(saved.note);
      setRestored(true);
    } catch {
      /* Recovery is optional when session storage is unavailable. */
    }
  }, [draftKey, intentKey]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setSearchError(null);
    const timer = window.setTimeout(() => {
      getJSON<{ products: Product[] }>(
        `/api/products?q=${encodeURIComponent(search.trim())}`,
        controller.signal,
      )
        .then((data) => {
          if (!cancelled) setResults(data.products);
        })
        .catch((caught: unknown) => {
          if (!cancelled) {
            setResults([]);
            setSearchError(caught instanceof Error ? caught.message : "Couldn’t search products.");
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [search, searchRevision]);
  useEffect(() => {
    if (initialProduct)
      requestAnimationFrame(() => {
        quantityRefs.current[initialProduct.id]?.focus();
        quantityRefs.current[initialProduct.id]?.select();
      });
  }, [initialProduct]);

  function addProduct(product: Product) {
    if (mutation.pending || new Exact(product.current_stock).lte(0)) return;
    const exists = lines.some((line) => line.product.id === product.id);
    if (!exists && lines.length >= 100) {
      setValidation(sourceMessage("A sale can contain at most 100 different products."));
      return;
    }
    if (!exists)
      setLines((current) => [
        ...current,
        {
          product,
          quantity: new Exact(product.current_stock).lt(1) ? product.current_stock : "1",
          unit_price: product.selling_price,
          discount: "0",
        },
      ]);
    setValidation(null);
    requestAnimationFrame(() => {
      quantityRefs.current[product.id]?.focus();
      quantityRefs.current[product.id]?.select();
    });
  }
  function updateLine(
    productId: string,
    key: "quantity" | "unit_price" | "discount",
    value: string,
  ) {
    setLines((current) =>
      current.map((line) => (line.product.id === productId ? { ...line, [key]: value } : line)),
    );
    setValidation(null);
  }
  const totals = lines.map(amount);
  const total = totals.some((value) => value === null)
    ? null
    : totals.reduce<Decimal>((sum, value) => sum.plus(value ?? "0"), new Exact(0)).toFixed(2);
  const discountTotal = lines
    .reduce<Decimal>((sum, line) => {
      try {
        return sum.plus(line.discount || "0");
      } catch {
        return sum;
      }
    }, new Exact(0))
    .toFixed(2);

  async function postSale(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidation(null);
    if (!lines.length) {
      setValidation(sourceMessage("Add at least one product to this sale."));
      searchRef.current?.focus();
      return;
    }
    if (total === null) {
      setValidation(
        sourceMessage(
          "Check quantities, prices, and discounts. A line discount cannot exceed its value.",
        ),
      );
      return;
    }
    if (lines.some((line) => new Exact(line.quantity).gt(line.product.current_stock))) {
      setValidation(
        sourceMessage(
          "A quantity is higher than the available stock. Reduce the quantity and try again.",
        ),
      );
      return;
    }
    if (method === "credit" && !customer.trim()) {
      setValidation(sourceMessage("Add the customer’s name to record a credit sale."));
      return;
    }
    const items: SaleLineInput[] = lines.map((line) => ({
      product_id: line.product.id,
      quantity: line.quantity,
      unit_price: line.unit_price,
      discount: line.discount || "0",
    }));
    try {
      sessionStorage.setItem(
        draftKey,
        JSON.stringify({ lines, method, customer, contact, note } satisfies SavedDraft),
      );
    } catch {
      /* Posting works without storage. */
    }
    const result = await mutation.submit("sale", {
      items,
      payment_method: method,
      customer_name: customer.trim() || null,
      customer_contact: contact.trim() || null,
      note: note.trim() || null,
    });
    if (result) {
      try {
        sessionStorage.removeItem(draftKey);
      } catch {
        /* Optional storage. */
      }
      onSuccess(
        typeof result.reference === "string"
          ? sourceMessage("Sale {v0} recorded successfully.", { v0: result.reference })
          : sourceMessage("Sale recorded successfully."),
      );
    }
  }
  return (
    <Modal
      title={t("New sale")}
      description={t("Build the sale, choose payment, and record it once.")}
      wide
      onClose={onClose}
      busy={mutation.pending}
      className="sale-modal"
      footer={
        <>
          <div className="sale-footer-total">
            <span>
              {t("Total")} <span className="muted">· {shop.currency}</span>
            </span>
            <strong>{total === null ? t("Check amounts") : money(total, shop.currency)}</strong>
          </div>
          <div className="button-row">
            <Button variant="secondary" type="button" onClick={onClose} disabled={mutation.pending}>
              {t("Cancel")}
            </Button>
            <Button
              type="submit"
              form={`${id}-sale`}
              pending={mutation.pending}
              disabled={!lines.length || total === null}
            >
              {!mutation.pending && <Check size={17} />}
              {mutation.pending
                ? t("Recording…")
                : method === "credit"
                  ? t("Record credit sale")
                  : t("Record sale")}
            </Button>
          </div>
        </>
      }
    >
      <LocalizedForm id={`${id}-sale`} onSubmit={postSale} className="sale-form">
        {restored && (
          <Notice tone="warning">
            <strong>{t("A previously submitted sale was restored.")}</strong>
            <p>
              {t(
                "It may already have been saved. Retry this unchanged form to recover the original result safely. Before changing it or starting a different sale,",
              )}{" "}
              <Link href="/sales" className="text-link" onClick={onClose}>
                {t("review Sales")}
              </Link>
              .
            </p>
          </Notice>
        )}
        {(validation || mutation.error) && <Notice>{validation || mutation.error}</Notice>}
        <fieldset disabled={mutation.pending} className="plain-fieldset">
          <div className="sale-product-search">
            <label htmlFor={`${id}-search`} className="field-label">
              {t("Step 1 · Choose products")}
            </label>
            <div className="search-input">
              <Search size={18} aria-hidden="true" />
              <input
                id={`${id}-search`}
                ref={searchRef}
                data-autofocus={!initialProduct ? true : undefined}
                type="search"
                placeholder={t("Search by product name, SKU, or barcode")}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                autoComplete="off"
                aria-controls={`${id}-results`}
              />
            </div>
            <div id={`${id}-results`} className="product-search-results" aria-busy={loading}>
              {loading ? (
                <div className="search-loading" role="status">
                  <Loader2 size={16} className="spin" />
                  {t("Finding products…")}
                </div>
              ) : searchError ? (
                <div className="search-error">
                  <span role="alert">{searchError}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    type="button"
                    onClick={() => setSearchRevision((value) => value + 1)}
                  >
                    {t("Retry")}
                  </Button>
                </div>
              ) : !results.length ? (
                <p className="search-empty">
                  {search
                    ? t("No matching active products. Try a name, SKU, or barcode.")
                    : t("No active products yet. Add products from Inventory first.")}
                </p>
              ) : (
                <ul aria-label={t("Matching products")}>
                  {results.map((product) => {
                    const added = lines.some((line) => line.product.id === product.id);
                    const unavailable = stockStatus(product) === "out";
                    return (
                      <li key={product.id}>
                        <button
                          type="button"
                          onClick={() => addProduct(product)}
                          disabled={unavailable}
                          aria-label={t(added ? "Focus quantity for {v0}" : "Add {v0}", {
                            v0: product.name,
                          })}
                        >
                          <span className="search-product-icon">
                            <ShoppingBag size={16} />
                          </span>
                          <span className="search-result-name">
                            <strong>{product.name}</strong>
                            <small>
                              {product.sku ||
                                product.barcode ||
                                product.category?.name ||
                                product.unit}{" "}
                              <span aria-hidden="true">·</span> {quantity(product.current_stock)}{" "}
                              {product.unit} {t("available")}
                            </small>
                          </span>
                          <strong className="search-result-price">
                            {money(product.selling_price, shop.currency)}
                          </strong>
                          {unavailable ? (
                            <Badge tone="red">{t("Out")}</Badge>
                          ) : added ? (
                            <Check size={17} className="green-text" />
                          ) : (
                            <Plus size={17} />
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
          <div className="sale-lines-heading">
            <h3>
              {t("Sale items")} <span className="count-chip">{lines.length}</span>
            </h3>
            <span className="muted small-text">{t("Discounts are flat amounts per line")}</span>
          </div>
          {!lines.length ? (
            <div className="sale-items-empty">
              <ShoppingBag size={22} aria-hidden="true" />
              <p>{t("Your sale is empty")}</p>
              <span>{t("Choose a product above to get started.")}</span>
            </div>
          ) : (
            <div className="sale-lines">
              <div className="sale-line-labels" aria-hidden="true">
                <span>{t("Product")}</span>
                <span>{t("Quantity")}</span>
                <span>{t("Unit price")}</span>
                <span>{t("Discount")}</span>
                <span>{t("Line total")}</span>
                <span />
              </div>
              {lines.map((line, index) => {
                const overStock = (() => {
                  try {
                    return new Exact(line.quantity || "0").gt(line.product.current_stock);
                  } catch {
                    return false;
                  }
                })();
                return (
                  <div
                    key={line.product.id}
                    className={`sale-line${overStock || totals[index] === null ? " sale-line--invalid" : ""}`}
                  >
                    <div className="sale-line-product">
                      <strong>{line.product.name}</strong>
                      <span>
                        {quantity(line.product.current_stock)} {line.product.unit} {t("in stock")}
                      </span>
                    </div>
                    <label>
                      <span className="mobile-field-label">{t("Quantity")}</span>
                      <input
                        aria-label={t("Quantity for {v0}", { v0: line.product.name })}
                        ref={(element) => {
                          quantityRefs.current[line.product.id] = element;
                        }}
                        type="number"
                        inputMode="decimal"
                        min="0.001"
                        max={line.product.current_stock}
                        step="0.001"
                        value={line.quantity}
                        onChange={(event) =>
                          updateLine(line.product.id, "quantity", event.target.value)
                        }
                        required
                        aria-invalid={overStock || undefined}
                      />
                    </label>
                    <label>
                      <span className="mobile-field-label">{t("Unit price")}</span>
                      <input
                        aria-label={t("Unit price for {v0}, {v1}", {
                          v0: line.product.name,
                          v1: shop.currency,
                        })}
                        type="number"
                        inputMode="decimal"
                        min="0"
                        max="999999999999.99"
                        step="0.01"
                        value={line.unit_price}
                        onChange={(event) =>
                          updateLine(line.product.id, "unit_price", event.target.value)
                        }
                        required
                      />
                    </label>
                    <label>
                      <span className="mobile-field-label">{t("Discount")}</span>
                      <input
                        aria-label={t("Line discount for {v0}, {v1}", {
                          v0: line.product.name,
                          v1: shop.currency,
                        })}
                        type="number"
                        inputMode="decimal"
                        min="0"
                        max="999999999999.99"
                        step="0.01"
                        value={line.discount}
                        onChange={(event) =>
                          updateLine(line.product.id, "discount", event.target.value)
                        }
                        required
                      />
                    </label>
                    <strong className="sale-line-total" data-label={t("Line total")}>
                      {totals[index] === null ? (
                        <span className="danger-text">{t("Invalid amount")}</span>
                      ) : (
                        money(totals[index]!, shop.currency)
                      )}
                    </strong>
                    <IconButton
                      label={t("Remove {v0}", { v0: line.product.name })}
                      onClick={() => {
                        setLines((current) =>
                          current.filter((item) => item.product.id !== line.product.id),
                        );
                        searchRef.current?.focus();
                      }}
                    >
                      <Trash2 size={16} />
                    </IconButton>
                    {overStock && (
                      <span className="sale-line-error field-error">
                        {t("Only {v0} {v1} available.", {
                          v0: quantity(line.product.current_stock),
                          v1: line.product.unit,
                        })}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {lines.length > 0 && (
            <div className="sale-discount-summary">
              <span>{t("Line discounts included")}</span>
              <span>{money(discountTotal, shop.currency)}</span>
            </div>
          )}
          <div className="form-section">
            <h3>{t("Step 2 · Payment and customer")}</h3>
            <div className="payment-options">
              {(
                [
                  { value: "cash", label: "Cash", icon: Banknote },
                  { value: "digital", label: "Digital", icon: CreditCard },
                  { value: "credit", label: "Credit / pay later", icon: Wallet },
                ] as const
              ).map(({ value, label, icon: Icon }) => (
                <label
                  className={`payment-option${method === value ? " is-selected" : ""}`}
                  key={value}
                >
                  <input
                    type="radio"
                    name={`${id}-method`}
                    value={value}
                    checked={method === value}
                    onChange={() => setMethod(value)}
                  />
                  <Icon size={18} aria-hidden="true" />
                  <span>{t(label)}</span>
                  {method === value && <Check size={15} className="payment-check" />}
                </label>
              ))}
            </div>
            {method === "credit" && (
              <p className="form-hint">
                <strong>{t("Credit means udhaar: payment will be collected later.")}</strong>{" "}
                {t(
                  "Creates an outstanding balance, not a cash receipt. Collect payment from Sales when it is received.",
                )}
              </p>
            )}
          </div>
          <p className="form-hint">
            {t(
              "Digital means a payment already received, e.g. bank or mobile wallet. No money is transferred by this app.",
            )}
          </p>
          <div className="form-grid">
            <label className="field">
              <span>
                {t("Customer name")}{" "}
                {method === "credit" ? (
                  <span className="required-text">*</span>
                ) : (
                  <span className="optional">{t("(optional)")}</span>
                )}
              </span>
              <div className="input-icon">
                <UserRound size={16} aria-hidden="true" />
                <input
                  type="text"
                  value={customer}
                  onChange={(event) => setCustomer(event.target.value)}
                  placeholder={
                    method === "credit" ? t("Required for credit sales") : t("Walk-in customer")
                  }
                  required={method === "credit"}
                  maxLength={160}
                  autoComplete="name"
                />
              </div>
            </label>
            <label className="field">
              <span>
                {t("Contact")} <span className="optional">{t("(optional)")}</span>
              </span>
              <input
                type="text"
                value={contact}
                onChange={(event) => setContact(event.target.value)}
                placeholder={t("Phone number or email")}
                maxLength={160}
                autoComplete="off"
              />
            </label>
            <label className="field field--full">
              <span>
                {t("Sale note")} <span className="optional">{t("(optional)")}</span>
              </span>
              <textarea
                rows={2}
                maxLength={500}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder={t("Anything worth keeping with this sale")}
              />
            </label>
          </div>
          <p className="form-hint sale-commit-note">
            {t(
              "Stock and totals are checked again when you record the sale. The sale is saved only after the server confirms it.",
            )}
          </p>
        </fieldset>
      </LocalizedForm>
    </Modal>
  );
}
