"use client";
import { LocalizedForm, useDateFormatter, useT } from "./preferences";
import { message as sourceMessage } from "@/lib/translations";
import { MOVEMENT_LABELS } from "@/lib/movement-labels";

import { useId, useState, type FormEvent } from "react";
import type Decimal from "decimal.js";
import { ArrowRight, Download, FileSpreadsheet, History, PackageMinus, Upload } from "lucide-react";
import type { Category, InventoryMovement, Product, ProductInput, Shop } from "../lib/types";
import { Exact, money, quantity } from "../lib/money";

import { optional, useMutation, useRemote } from "./hooks";
import { unitCost } from "./format";
import {
  Badge,
  Button,
  EmptyState,
  FieldError,
  FormActions,
  LoadingView,
  Modal,
  Notice,
} from "./ui";

export function productInput(product: Product, active = product.is_active): ProductInput {
  return {
    expected_updated_at: product.updated_at,
    name: product.name,
    category_id: product.category_id,
    sku: product.sku,
    barcode: product.barcode,
    unit: product.unit,
    cost_price: product.cost_price,
    selling_price: product.selling_price,
    opening_stock: "0",
    low_stock_threshold: product.low_stock_threshold,
    is_active: active,
  };
}

type Done = { onClose: () => void; onSuccess: (message: string) => void };
export function ProductEditor({
  product,
  categories,
  shop,
  onClose,
  onSuccess,
}: { product?: Product; categories: Category[]; shop: Shop } & Done) {
  const t = useT();
  const id = useId();
  const mutation = useMutation();
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input: ProductInput = {
      ...(product ? { expected_updated_at: product.updated_at } : {}),
      name: String(form.get("name") ?? "").trim(),
      category_id: optional(form.get("category_id")),
      sku: optional(form.get("sku")),
      barcode: optional(form.get("barcode")),
      unit: String(form.get("unit") ?? "").trim(),
      cost_price: optional(form.get("cost_price")),
      selling_price: String(form.get("selling_price")),
      opening_stock: product ? "0" : String(form.get("opening_stock") || "0"),
      low_stock_threshold: String(form.get("low_stock_threshold") || "0"),
      is_active: form.get("is_active") === "on",
    };
    const result = await mutation.submit("product", {
      product_id: product?.id ?? null,
      product: input,
    });
    if (result)
      onSuccess(
        product
          ? sourceMessage("{v0} updated.", { v0: input.name })
          : sourceMessage("{v0} added to inventory.", { v0: input.name }),
      );
  }
  const fieldErrors = (name: string) =>
    mutation.fields[name]?.join(" ") || mutation.fields[`product.${name}`]?.join(" ");
  return (
    <Modal
      title={product ? t("Edit product") : t("Add a product")}
      description={
        product
          ? t("Catalog changes apply to future sales. Historical sales stay unchanged.")
          : t("Create a product and set its opening stock.")
      }
      onClose={onClose}
      busy={mutation.pending}
      footer={
        <FormActions
          form={`${id}-form`}
          label={product ? t("Save changes") : t("Add product")}
          pending={mutation.pending}
          onCancel={onClose}
        />
      }
    >
      <LocalizedForm id={`${id}-form`} onSubmit={save}>
        {mutation.error && <Notice>{mutation.error}</Notice>}
        <fieldset disabled={mutation.pending} className="plain-fieldset form-grid">
          <label className="field field--full">
            <span>
              {t("Product name")} <span className="required-text">*</span>
            </span>
            <input
              data-autofocus
              name="name"
              defaultValue={product?.name}
              placeholder={t("e.g. Product name")}
              required
              maxLength={160}
              aria-invalid={!!fieldErrors("name")}
              aria-describedby={fieldErrors("name") ? `${id}-name-error` : undefined}
            />
            <FieldError id={`${id}-name-error`}>{fieldErrors("name")}</FieldError>
          </label>
          <label className="field">
            <span>
              {t("SKU")} <span className="optional">{t("(optional)")}</span>
            </span>
            <input
              name="sku"
              dir="ltr"
              defaultValue={product?.sku ?? ""}
              maxLength={80}
              placeholder={t("Your product code")}
            />
            <FieldError>{fieldErrors("sku")}</FieldError>
          </label>
          <label className="field">
            <span>
              {t("Barcode")} <span className="optional">{t("(optional)")}</span>
            </span>
            <input
              name="barcode"
              dir="ltr"
              defaultValue={product?.barcode ?? ""}
              maxLength={80}
              inputMode="numeric"
              placeholder={t("Scan or type a barcode")}
            />
            <FieldError>{fieldErrors("barcode")}</FieldError>
          </label>
          <label className="field">
            <span>{t("Category")}</span>
            <select name="category_id" defaultValue={product?.category_id ?? ""}>
              <option value="">{t("Uncategorized")}</option>
              {categories.map((category) => (
                <option value={category.id} key={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>
              {t("Unit")} <span className="required-text">*</span>
            </span>
            <input
              name="unit"
              defaultValue={product?.unit ?? "unit"}
              required
              maxLength={24}
              placeholder={t("e.g. piece, kg, litre")}
            />
          </label>
          <div className="form-divider field--full">
            <span>
              {t("Pricing ·")} {shop.currency}
            </span>
          </div>
          <label className="field">
            <span>
              {t("Selling price")} <span className="required-text">*</span>
            </span>
            <input
              name="selling_price"
              type="number"
              min="0"
              max="999999999999.99"
              step="0.01"
              inputMode="decimal"
              defaultValue={product?.selling_price ?? ""}
              required
              placeholder="0.00"
            />
            <FieldError>{fieldErrors("selling_price")}</FieldError>
          </label>
          <label className="field">
            <span>
              {t("Unit cost")} <span className="optional">{t("(optional)")}</span>
            </span>
            <input
              name="cost_price"
              type="number"
              min="0"
              max="999999999999.9999"
              step="0.0001"
              inputMode="decimal"
              defaultValue={product?.cost_price ?? ""}
              placeholder={t("Leave blank if unknown")}
            />
            <span className="form-hint">{t("Unknown cost is never treated as zero profit.")}</span>
            <FieldError>{fieldErrors("cost_price")}</FieldError>
          </label>
          <div className="form-divider field--full">
            <span>{t("Stock")}</span>
          </div>
          {product ? (
            <div className="field">
              <span className="field-label">{t("Current stock")}</span>
              <div className="read-only-value">
                {quantity(product.current_stock)} <span className="muted">{product.unit}</span>
              </div>
              <span className="form-hint">{t("Use Receive or Adjust to change stock.")}</span>
            </div>
          ) : (
            <label className="field">
              <span>{t("Opening stock")}</span>
              <input
                name="opening_stock"
                type="number"
                min="0"
                max="999999999.999"
                step="0.001"
                inputMode="decimal"
                defaultValue="0"
                required
              />
              <FieldError>{fieldErrors("opening_stock")}</FieldError>
            </label>
          )}
          <label className="field">
            <span>{t("Low-stock alert at")}</span>
            <input
              name="low_stock_threshold"
              type="number"
              min="0"
              max="999999999.999"
              step="0.001"
              inputMode="decimal"
              defaultValue={product?.low_stock_threshold ?? "5"}
              required
            />
            <span className="form-hint">
              {t("Alerts when available stock reaches this level.")}
            </span>
          </label>
          <label className="checkbox-row field--full">
            <input type="checkbox" name="is_active" defaultChecked={product?.is_active ?? true} />
            <span>
              <strong>{t("Active product")}</strong>
              <small>{t("Available for new sales. Inactive products keep all history.")}</small>
            </span>
          </label>
        </fieldset>
      </LocalizedForm>
    </Modal>
  );
}

export function CategoryDialog({ onClose, onSuccess }: Done) {
  const t = useT();
  const id = useId();
  const mutation = useMutation();
  return (
    <Modal
      title={t("New category")}
      description={t("Organize your catalog for faster searching and useful reports.")}
      onClose={onClose}
      busy={mutation.pending}
      footer={
        <FormActions
          form={`${id}-category`}
          label={t("Create category")}
          pending={mutation.pending}
          onCancel={onClose}
        />
      }
    >
      <LocalizedForm
        id={`${id}-category`}
        onSubmit={async (event) => {
          event.preventDefault();
          const name = String(new FormData(event.currentTarget).get("name") ?? "").trim();
          const result = await mutation.submit("category", { name });
          if (result) onSuccess(sourceMessage("Category “{v0}” created.", { v0: name }));
        }}
      >
        {mutation.error && <Notice>{mutation.error}</Notice>}
        <label className="field">
          <span>
            {t("Category name")} <span className="required-text">*</span>
          </span>
          <input
            data-autofocus
            name="name"
            placeholder={t("Name your category")}
            maxLength={80}
            required
            disabled={mutation.pending}
          />
        </label>
      </LocalizedForm>
    </Modal>
  );
}

export function DeactivateDialog({ product, onClose, onSuccess }: { product: Product } & Done) {
  const t = useT();
  const mutation = useMutation();
  return (
    <Modal
      title={t("Deactivate product?")}
      description={t("This product will no longer be available for new sales.")}
      onClose={onClose}
      busy={mutation.pending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.pending}>
            {t("Keep active")}
          </Button>
          <Button
            variant="danger"
            pending={mutation.pending}
            onClick={async () => {
              const result = await mutation.submit("product", {
                product_id: product.id,
                product: productInput(product, false),
              });
              if (result)
                onSuccess(
                  sourceMessage("{v0} deactivated. Its history is preserved.", {
                    v0: product.name,
                  }),
                );
            }}
          >
            {t("Deactivate product")}
          </Button>
        </>
      }
    >
      {mutation.error && <Notice>{mutation.error}</Notice>}
      <div className="confirmation-product">
        <PackageMinus size={23} aria-hidden="true" />
        <div>
          <strong>{product.name}</strong>
          <span>
            {product.sku || t("No SKU")} · {quantity(product.current_stock)} {product.unit}{" "}
            {t("in stock")}
          </span>
        </div>
      </div>
      <p className="body-copy">
        {t(
          "Sales, stock movements, and reports stay intact. You can reactivate the product from the inactive inventory filter.",
        )}
      </p>
    </Modal>
  );
}

export function ReceiveDialog({
  product,
  shop,
  onClose,
  onSuccess,
}: { product: Product; shop: Shop } & Done) {
  const t = useT();
  const id = useId();
  const mutation = useMutation();
  const [received, setReceived] = useState("");
  const [cost, setCost] = useState(product.cost_price ?? "");
  let purchaseTotal: string | null = null;
  try {
    if (received && cost)
      purchaseTotal = new Exact(received).times(cost).toDecimalPlaces(2).toFixed(2);
  } catch {
    /* Incomplete input. */
  }
  return (
    <Modal
      title={t("Receive stock")}
      description={t("Add a delivery to {v0}.", { v0: product.name })}
      onClose={onClose}
      busy={mutation.pending}
      footer={
        <FormActions
          form={`${id}-receive`}
          label={t("Receive stock")}
          pending={mutation.pending}
          onCancel={onClose}
        />
      }
    >
      <div className="stock-context">
        <span>{t("Current stock")}</span>
        <strong>
          {quantity(product.current_stock)} {product.unit}
        </strong>
      </div>
      <LocalizedForm
        id={`${id}-receive`}
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const result = await mutation.submit("receive", {
            product_id: product.id,
            quantity: received,
            unit_cost: cost,
            supplier: optional(form.get("supplier")),
            payment_method: String(form.get("payment_method")),
            note: optional(form.get("note")),
          });
          if (result)
            onSuccess(
              sourceMessage("{v0} {v1} received for {v2}.", {
                v0: quantity(received),
                v1: product.unit,
                v2: product.name,
              }),
            );
        }}
      >
        {mutation.error && <Notice>{mutation.error}</Notice>}
        <fieldset className="plain-fieldset form-grid" disabled={mutation.pending}>
          <label className="field">
            <span>
              {t("Quantity received")} <span className="required-text">*</span>
            </span>
            <input
              data-autofocus
              type="number"
              inputMode="decimal"
              min="0.001"
              max="999999999.999"
              step="0.001"
              value={received}
              onChange={(event) => setReceived(event.target.value)}
              required
              placeholder="0"
            />
          </label>
          <label className="field">
            <span>
              {t("Unit cost ·")} {shop.currency} <span className="required-text">*</span>
            </span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              max="999999999999.9999"
              step="0.0001"
              value={cost}
              onChange={(event) => setCost(event.target.value)}
              required
              placeholder="0.0000"
            />
          </label>
          <label className="field field--full">
            <span>
              {t("Supplier")} <span className="optional">{t("(optional)")}</span>
            </span>
            <input name="supplier" maxLength={160} placeholder={t("Supplier name")} />
          </label>
          <label className="field field--full">
            <span>{t("Delivery payment")}</span>
            <select name="payment_method" defaultValue="cash">
              <option value="cash">{t("Paid in cash")}</option>
              <option value="digital">{t("Paid digitally")}</option>
              <option value="unpaid">{t("Unpaid / pay supplier later")}</option>
            </select>
            <span className="form-hint">
              {t(
                "Paid deliveries post a supplier payment to the cashbook. Unpaid deliveries do not create cash movement.",
              )}
            </span>
          </label>
          <label className="field field--full">
            <span>
              {t("Delivery note")} <span className="optional">{t("(optional)")}</span>
            </span>
            <textarea
              name="note"
              rows={2}
              maxLength={500}
              placeholder={t("Invoice reference or delivery details")}
            />
          </label>
          {purchaseTotal !== null && (
            <div className="calculation-summary field--full">
              <span>{t("Delivery cost")}</span>
              <strong>{money(purchaseTotal, shop.currency)}</strong>
            </div>
          )}
          <p className="form-hint field--full">
            {t(
              "Receipt cost updates weighted-average product cost when the previous cost is known. It does not rewrite historical sales.",
            )}
          </p>
        </fieldset>
      </LocalizedForm>
    </Modal>
  );
}

export function AdjustDialog({ product, onClose, onSuccess }: { product: Product } & Done) {
  const t = useT();
  const id = useId();
  const mutation = useMutation();
  const [kind, setKind] = useState("correction");
  const [direction, setDirection] = useState("remove");
  const [amount, setAmount] = useState("");
  const [validation, setValidation] = useState<string | null>(null);
  let next: Decimal | null = null;
  const negative = kind !== "correction" || direction === "remove";
  try {
    if (amount)
      next = new Exact(product.current_stock).plus(new Exact(amount).times(negative ? -1 : 1));
  } catch {
    /* Incomplete input. */
  }
  return (
    <Modal
      title={t("Adjust stock")}
      description={t("Record a counted correction, damage, or missing stock for {v0}.", {
        v0: product.name,
      })}
      onClose={onClose}
      busy={mutation.pending}
      footer={
        <FormActions
          form={`${id}-adjust`}
          label={t("Record adjustment")}
          pending={mutation.pending}
          onCancel={onClose}
        />
      }
    >
      <Notice tone="info">
        {t("For deliveries use Receive stock. For customer transactions use a sale or return.")}
      </Notice>
      <LocalizedForm
        id={`${id}-adjust`}
        onSubmit={async (event) => {
          event.preventDefault();
          setValidation(null);
          if (!next || next.isNegative()) {
            setValidation(
              sourceMessage("This adjustment would make stock negative. Check the quantity."),
            );
            return;
          }
          const form = new FormData(event.currentTarget);
          const delta = new Exact(amount).times(negative ? -1 : 1).toString();
          const result = await mutation.submit("adjust", {
            product_id: product.id,
            quantity_delta: delta,
            kind,
            note: String(form.get("note") ?? "").trim(),
          });
          if (result)
            onSuccess(sourceMessage("Stock adjustment recorded for {v0}.", { v0: product.name }));
        }}
      >
        {(validation || mutation.error) && <Notice>{validation || mutation.error}</Notice>}
        <fieldset disabled={mutation.pending} className="plain-fieldset form-grid">
          <label className="field field--full">
            <span>{t("Adjustment type")}</span>
            <select data-autofocus value={kind} onChange={(event) => setKind(event.target.value)}>
              <option value="correction">{t("Stock correction — counted difference")}</option>
              <option value="damage">{t("Damaged stock — remove")}</option>
              <option value="missing">{t("Missing stock — remove")}</option>
            </select>
          </label>
          {kind === "correction" && (
            <label className="field">
              <span>{t("Correction direction")}</span>
              <select value={direction} onChange={(event) => setDirection(event.target.value)}>
                <option value="remove">{t("Remove from stock")}</option>
                <option value="add">{t("Add to stock")}</option>
              </select>
            </label>
          )}
          <label className={`field${kind !== "correction" ? " field--full" : ""}`}>
            <span>
              {negative ? t("Quantity to remove") : t("Quantity to add")}{" "}
              <span className="required-text">*</span>
            </span>
            <input
              type="number"
              inputMode="decimal"
              min="0.001"
              step="0.001"
              max={negative ? product.current_stock : undefined}
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value);
                setValidation(null);
              }}
              required
            />
          </label>
          <label className="field field--full">
            <span>
              {t("Reason")} <span className="required-text">*</span>
            </span>
            <textarea
              name="note"
              rows={3}
              required
              minLength={3}
              maxLength={500}
              placeholder={
                kind === "damage"
                  ? t("What was damaged and why?")
                  : kind === "missing"
                    ? t("Describe the missing stock")
                    : t("Explain the counted difference")
              }
            />
          </label>
          <div className={`stock-preview field--full${next?.isNegative() ? " is-invalid" : ""}`}>
            <div>
              <span>{t("Current")}</span>
              <strong>
                {quantity(product.current_stock)} {product.unit}
              </strong>
            </div>
            <ArrowRight size={18} aria-hidden="true" />
            <div>
              <span>{t("After adjustment")}</span>
              <strong>
                {next === null
                  ? "—"
                  : t("{v0} {v1}", { v0: quantity(next.toString()), v1: product.unit })}
              </strong>
            </div>
          </div>
          <p className="form-hint field--full">
            {t(
              "This creates a permanent, timestamped movement. It does not record revenue or a payment.",
            )}
          </p>
        </fieldset>
      </LocalizedForm>
    </Modal>
  );
}

export function MovementsDialog({
  product,
  shop,
  onClose,
}: {
  product: Product;
  shop: Shop;
  onClose: () => void;
}) {
  const formatDate = useDateFormatter();
  const t = useT();
  const remote = useRemote<{ movements: InventoryMovement[] }>(
    `/api/products/${product.id}/movements`,
  );
  return (
    <Modal
      wide
      title={t("Stock movements")}
      description={t("{v0} · All movements are retained for audit.", { v0: product.name })}
      onClose={onClose}
      footer={
        <>
          <span className="muted small-text">{t("Showing the latest 200 movements at most.")}</span>
          <Button variant="secondary" onClick={onClose}>
            {t("Close")}
          </Button>
        </>
      }
    >
      {remote.loading ? (
        <LoadingView compact label={t("Loading stock history…")} />
      ) : remote.error ? (
        <Notice>
          {remote.error}
          <Button size="sm" variant="ghost" onClick={remote.reload}>
            {t("Try again")}
          </Button>
        </Notice>
      ) : !remote.data?.movements.length ? (
        <EmptyState
          compact
          icon={History}
          title={t("No movements yet")}
          description={t("Receiving, sales, and adjustments will be recorded here.")}
        />
      ) : (
        <div className="table-scroll">
          <table className="data-table movement-table">
            <caption className="sr-only">
              {t("Stock movements for")} {product.name}
              {t(", newest first")}
            </caption>
            <thead>
              <tr>
                <th>{t("Date & time")}</th>
                <th>{t("Movement")}</th>
                <th className="numeric">{t("Change")}</th>
                <th className="numeric">{t("Stock after")}</th>
                <th>{t("Note / reference")}</th>
              </tr>
            </thead>
            <tbody>
              {remote.data.movements.map((movement) => (
                <tr key={movement.id}>
                  <td className="nowrap">
                    {formatDate(movement.occurred_at, shop.time_zone, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td>
                    <Badge
                      tone={new Exact(movement.quantity_delta).isNegative() ? "neutral" : "green"}
                    >
                      {t(MOVEMENT_LABELS[movement.kind])}
                    </Badge>
                    {movement.unit_cost !== null && (
                      <span className="cell-meta">
                        {t("Cost")} {unitCost(movement.unit_cost, shop.currency, t("Unavailable"))}
                      </span>
                    )}
                  </td>
                  <td
                    className={`numeric ${new Exact(movement.quantity_delta).isNegative() ? "danger-text" : "green-text"}`}
                  >
                    {new Exact(movement.quantity_delta).gt(0) ? "+" : ""}
                    {quantity(movement.quantity_delta)}
                  </td>
                  <td className="numeric">{quantity(movement.stock_after)}</td>
                  <td>
                    <span>{movement.note || "—"}</span>
                    {movement.reference_id && (
                      <span className="cell-meta mono" title={movement.reference_id}>
                        {t("Ref")} {movement.reference_id.slice(0, 8)}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

export function ImportDialog({ onClose, onSuccess }: Done) {
  const t = useT();
  const id = useId();
  const mutation = useMutation();
  const [csv, setCsv] = useState("");
  const [filename, setFilename] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  return (
    <Modal
      title={t("Import products")}
      description={t("Add up to 500 products in one validated, atomic import.")}
      onClose={onClose}
      busy={mutation.pending || reading}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.pending || reading}>
            {t("Cancel")}
          </Button>
          <Button
            type="submit"
            form={`${id}-import`}
            pending={mutation.pending}
            disabled={!csv.trim() || reading}
          >
            {!mutation.pending && <Upload size={16} />}
            {t("Import products")}
          </Button>
        </>
      }
    >
      <div className="import-steps">
        <span className="step-number">1</span>
        <div>
          <strong>{t("Start with the template")}</strong>
          <p>{t("Use its exact column names. Category names are created as needed.")}</p>
          <a href="/api/template" download className="text-link">
            <Download size={15} />
            {t("Download CSV template")}
          </a>
        </div>
      </div>
      <div className="import-steps">
        <span className="step-number">2</span>
        <div>
          <strong>{t("Choose your CSV file")}</strong>
          <p>
            {t(
              "UTF-8 CSV, 500 KB maximum, no more than 500 product rows. SKUs and barcodes must be unique.",
            )}
          </p>
        </div>
      </div>
      <LocalizedForm
        id={`${id}-import`}
        onSubmit={async (event) => {
          event.preventDefault();
          if (!csv.trim()) return;
          const result = await mutation.submit("import", { csv });
          if (result)
            onSuccess(
              sourceMessage("Products imported successfully. Your inventory is up to date."),
            );
        }}
      >
        {(fileError || mutation.error) && <Notice>{fileError || mutation.error}</Notice>}
        <label className="file-picker" htmlFor={`${id}-file`}>
          <FileSpreadsheet size={25} aria-hidden="true" />
          <span>
            <strong>{filename || t("Select a CSV file")}</strong>
            <small>{reading ? t("Reading your file…") : t("Choose file to browse")}</small>
          </span>
          <input
            id={`${id}-file`}
            type="file"
            accept=".csv,text/csv"
            disabled={mutation.pending || reading}
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              setFileError(null);
              setCsv("");
              setFilename(file.name);
              if (file.size > 500000) {
                setFileError(
                  sourceMessage(
                    "Choose a CSV no larger than 500 KB and no more than 500 product rows.",
                  ),
                );
                return;
              }
              setReading(true);
              try {
                setCsv(await file.text());
              } catch {
                setFileError(
                  sourceMessage("Couldn’t read that file. Save it as a UTF-8 CSV and try again."),
                );
              } finally {
                setReading(false);
              }
            }}
          />
        </label>
        {csv && (
          <div className="csv-preview">
            <span className="eyebrow">{t("FILE PREVIEW · FIRST LINES")}</span>
            <pre>{csv.split(/\r?\n/).slice(0, 5).join("\n").slice(0, 1600)}</pre>
          </div>
        )}
        <Notice tone="info">
          {t(
            "Import adds new products; it does not overwrite existing ones. If any row fails validation, nothing is imported.",
          )}
        </Notice>
      </LocalizedForm>
    </Modal>
  );
}
