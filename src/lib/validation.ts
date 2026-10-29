import { z } from "zod";
import { Exact } from "./money";
import { isCalendarDate, isTimeZone } from "./dates";

export function decimalString(
  scale: number,
  { positive = false, signed = false, max = "999999999999.99" } = {},
) {
  const pattern = new RegExp(`^${signed ? "-?" : ""}\\d+(?:\\.\\d{1,${scale}})?$`);
  return z
    .string()
    .trim()
    .max(30)
    .regex(
      pattern,
      `Enter a ${signed ? "valid" : "non-negative"} number with at most ${scale} decimal places.`,
    )
    .refine(
      (value) => {
        try {
          const n = new Exact(value);
          return n.isFinite() && n.abs().lte(max) && (!positive || n.gt(0));
        } catch {
          return false;
        }
      },
      positive
        ? "Enter an amount greater than zero within the supported range."
        : "This number is outside the supported range.",
    );
}
export const amountSchema = decimalString(2);
export const positiveAmountSchema = decimalString(2, { positive: true });
export const quantitySchema = decimalString(3, { positive: true, max: "999999999.999" });
export const nonNegativeQuantitySchema = decimalString(3, { max: "999999999.999" });
function safely(predicate: () => boolean): boolean {
  try {
    return predicate();
  } catch {
    return false;
  }
}
export const signedQuantitySchema = decimalString(3, { signed: true, max: "999999999.999" }).refine(
  (v) => safely(() => !new Exact(v).isZero()),
  "The stock change cannot be zero.",
);
export const costSchema = decimalString(4, { max: "999999999999.9999" });
const id = z.uuid();
const optionalText = (max: number) => z.string().trim().max(max).nullable();
const method = z.enum(["cash", "digital"]);
const reason = z.string().trim().min(3, "Add a short reason for the audit history.").max(500);
const base = { request_id: id };
const date = z.string().refine(isCalendarDate, "Choose a valid calendar date.");

export const productInputSchema = z
  .object({
    expected_updated_at: z.iso.datetime({ offset: true }).optional(),
    name: z.string().trim().min(1, "Product name is required.").max(160),
    category_id: id.nullable(),
    sku: optionalText(80),
    barcode: optionalText(80),
    unit: z.string().trim().min(1).max(24),
    cost_price: costSchema.nullable(),
    selling_price: amountSchema,
    opening_stock: nonNegativeQuantitySchema,
    low_stock_threshold: nonNegativeQuantitySchema,
    is_active: z.boolean(),
  })
  .strict();
export const importProductSchema = productInputSchema
  .omit({ category_id: true, expected_updated_at: true })
  .extend({ category_name: optionalText(80) })
  .strict();
const saleItem = z
  .object({
    product_id: id,
    quantity: quantitySchema,
    unit_price: amountSchema,
    discount: amountSchema,
  })
  .strict();

export const actionSchemas = {
  product: z
    .object({ ...base, product_id: id.nullable(), product: productInputSchema })
    .strict()
    .refine(
      (data) => !data.product_id || safely(() => new Exact(data.product.opening_stock).isZero()),
      {
        path: ["product", "opening_stock"],
        message: "Use Receive Stock or Adjust Stock to change an existing product's quantity.",
      },
    )
    .refine((data) => !data.product_id || Boolean(data.product.expected_updated_at), {
      path: ["product", "expected_updated_at"],
      message:
        "Refresh inventory before editing this product so newer changes are not overwritten.",
    }),
  category: z
    .object({ ...base, name: z.string().trim().min(1, "Category name is required.").max(80) })
    .strict(),
  sale: z
    .object({
      ...base,
      items: z.array(saleItem).min(1, "Add at least one product.").max(100),
      payment_method: z.enum(["cash", "digital", "credit"]),
      customer_name: optionalText(160),
      customer_contact: optionalText(160),
      note: optionalText(500),
    })
    .strict()
    .superRefine((data, ctx) => {
      if (data.payment_method === "credit" && !data.customer_name?.trim())
        ctx.addIssue({
          code: "custom",
          path: ["customer_name"],
          message: "Customer name is required for credit sales.",
        });
      if (new Set(data.items.map((item) => item.product_id)).size !== data.items.length)
        ctx.addIssue({
          code: "custom",
          path: ["items"],
          message: "Each product can appear only once. Increase its quantity instead.",
        });
      data.items.forEach((item, index) => {
        if (
          safely(() =>
            new Exact(item.discount).gt(
              new Exact(item.quantity).mul(item.unit_price).toDecimalPlaces(2),
            ),
          )
        )
          ctx.addIssue({
            code: "custom",
            path: ["items", index, "discount"],
            message: "The discount cannot exceed the line subtotal.",
          });
      });
    }),
  receive: z
    .object({
      ...base,
      product_id: id,
      quantity: quantitySchema,
      unit_cost: costSchema,
      supplier: optionalText(160),
      payment_method: z.enum(["cash", "digital", "unpaid"]),
      note: optionalText(500),
    })
    .strict(),
  adjust: z
    .object({
      ...base,
      product_id: id,
      quantity_delta: signedQuantitySchema,
      kind: z.enum(["correction", "damage", "missing"]),
      note: reason,
    })
    .strict()
    .refine(
      (data) => data.kind === "correction" || safely(() => new Exact(data.quantity_delta).lt(0)),
      { path: ["quantity_delta"], message: "Damaged or missing stock must be a negative change." },
    ),
  collect: z
    .object({ ...base, sale_id: id, amount: positiveAmountSchema, method, note: optionalText(500) })
    .strict(),
  return: z
    .object({
      ...base,
      sale_id: id,
      items: z
        .array(
          z.object({ sale_item_id: id, quantity: quantitySchema, restock: z.boolean() }).strict(),
        )
        .min(1)
        .max(100),
      reason,
      refund_method: method,
    })
    .strict()
    .refine(
      (data) => new Set(data.items.map((item) => item.sale_item_id)).size === data.items.length,
      { path: ["items"], message: "Each sale item can be returned only once per request." },
    ),
  reverse: z.object({ ...base, sale_id: id, reason, refund_method: method }).strict(),
  expense: z
    .object({
      ...base,
      description: z.string().trim().min(3).max(240),
      category: z.string().trim().min(1).max(80),
      amount: positiveAmountSchema,
      method,
      occurred_on: date,
    })
    .strict(),
  cash: z
    .object({
      ...base,
      kind: z.enum(["supplier_payment", "owner_withdrawal", "owner_deposit"]),
      description: z.string().trim().min(3).max(240),
      amount: positiveAmountSchema,
      method,
      occurred_on: date,
    })
    .strict(),
  shop: z
    .object({
      ...base,
      mode: z.enum(["create", "update"]),
      name: z.string().trim().min(2).max(120),
      currency: z
        .string()
        .regex(/^[A-Z]{3}$/, "Choose a three-letter ISO currency code.")
        .refine((value) => {
          try {
            return Intl.supportedValuesOf("currency").includes(value);
          } catch {
            return false;
          }
        }, "Choose a supported ISO currency code."),
      time_zone: z
        .string()
        .max(80)
        .refine(isTimeZone, "Choose a valid IANA timezone, such as Asia/Karachi."),
    })
    .strict(),
  import: z
    .object({
      ...base,
      csv: z.string().min(1).max(500000, "Import files must be 500 KB or smaller."),
    })
    .strict(),
};
export type ActionName = keyof typeof actionSchemas;

export class ValidationError extends Error {
  constructor(
    message: string,
    public fields: Record<string, string[]> = {},
  ) {
    super(message);
    this.name = "ValidationError";
  }
}
export function validateAction(
  action: string,
  input: unknown,
): { action: ActionName; data: Record<string, unknown> } {
  if (!Object.hasOwn(actionSchemas, action)) throw new ValidationError("Unknown action.");
  const name = action as ActionName;
  const result = actionSchemas[name].safeParse(input);
  if (!result.success) {
    const fields: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join(".") || "form";
      (fields[key] ??= []).push(issue.message);
    }
    throw new ValidationError(result.error.issues[0]?.message ?? "Check the form values.", fields);
  }
  return { action: name, data: result.data as Record<string, unknown> };
}
