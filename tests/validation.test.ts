import { describe, expect, it } from "vitest";
import {
  actionSchemas,
  decimalString,
  validateAction,
  ValidationError,
} from "../src/lib/validation";

const request_id = "00000000-0000-4000-8000-000000000001";
const product_id = "00000000-0000-4000-8000-000000000002";
const product = {
  name: "Tea",
  category_id: null,
  sku: null,
  barcode: null,
  unit: "unit",
  cost_price: "2.0000",
  selling_price: "3.50",
  opening_stock: "10",
  low_stock_threshold: "2",
  is_active: true,
};
const sale = {
  request_id,
  items: [{ product_id, quantity: "1", unit_price: "3.50", discount: "0" }],
  payment_method: "cash",
  customer_name: null,
  customer_contact: null,
  note: null,
};

describe("server-side input validation", () => {
  it("accepts a well-formed product and sale", () => {
    expect(
      validateAction("product", { request_id, product_id: null, product }).data.product,
    ).toEqual(product);
    expect(validateAction("sale", sale).action).toBe("sale");
  });
  it("rejects floats, exponents, NaN, negative prices, and overprecision", () => {
    const schema = decimalString(2);
    for (const value of [0.1, "1e2", "NaN", "Infinity", "-0.01", "1.001", "9999999999999999"])
      expect(schema.safeParse(value).success).toBe(false);
  });
  it("rejects zero and negative sale quantities", () => {
    for (const qty of ["0", "-1", "1.0001", "abc"])
      expect(() =>
        validateAction("sale", { ...sale, items: [{ ...sale.items[0], quantity: qty }] }),
      ).toThrow(ValidationError);
  });
  it("requires a UUID key and rejects unexpected authorization fields", () => {
    expect(() => validateAction("sale", { ...sale, request_id: "not-a-uuid" })).toThrow(
      ValidationError,
    );
    expect(() => validateAction("sale", { ...sale, shop_id: product_id })).toThrow(ValidationError);
  });
  it("rejects duplicate products and excessive discounts", () => {
    expect(() =>
      validateAction("sale", { ...sale, items: [sale.items[0], sale.items[0]] }),
    ).toThrow(/only once/);
    expect(() =>
      validateAction("sale", { ...sale, items: [{ ...sale.items[0], discount: "3.51" }] }),
    ).toThrow(/discount/);
  });
  it("requires a named credit customer but never treats credit as cash", () => {
    expect(() => validateAction("sale", { ...sale, payment_method: "credit" })).toThrow(
      /Customer name/,
    );
    expect(
      validateAction("sale", { ...sale, payment_method: "credit", customer_name: "Customer A" })
        .data.payment_method,
    ).toBe("credit");
  });
  it("separates opening stock from later corrections", () => {
    expect(() => validateAction("product", { request_id, product_id, product })).toThrow(
      /Receive Stock/,
    );
    expect(
      validateAction("product", {
        request_id,
        product_id,
        product: { ...product, opening_stock: "0", expected_updated_at: "2026-10-28T00:00:00Z" },
      }).action,
    ).toBe("product");
  });
  it("requires a nonzero correction and negative damaged or missing stock", () => {
    for (const delta of ["0", "abc"])
      expect(() =>
        validateAction("adjust", {
          request_id,
          product_id,
          quantity_delta: delta,
          kind: "correction",
          note: "Stock count",
        }),
      ).toThrow(ValidationError);
    expect(() =>
      validateAction("adjust", {
        request_id,
        product_id,
        quantity_delta: "2",
        kind: "damage",
        note: "Damaged",
      }),
    ).toThrow(/negative/);
    expect(
      validateAction("adjust", {
        request_id,
        product_id,
        quantity_delta: "-2",
        kind: "missing",
        note: "Stock missing",
      }).action,
    ).toBe("adjust");
  });
  it("validates calendar dates, currency, and timezones", () => {
    expect(
      actionSchemas.expense.safeParse({
        request_id,
        description: "Rent",
        category: "Rent",
        amount: "10",
        method: "cash",
        occurred_on: "2026-02-31",
      }).success,
    ).toBe(false);
    expect(
      actionSchemas.shop.safeParse({
        request_id,
        mode: "create",
        name: "Retail Shop",
        currency: "PKR",
        time_zone: "Asia/Karachi",
      }).success,
    ).toBe(true);
    expect(
      actionSchemas.shop.safeParse({
        request_id,
        mode: "create",
        name: "Retail Shop",
        currency: "XYZ",
        time_zone: "Nowhere",
      }).success,
    ).toBe(false);
  });
  it("requires an audit reason and rejects unsupported actions", () => {
    expect(() =>
      validateAction("reverse", {
        request_id,
        sale_id: product_id,
        reason: "",
        refund_method: "cash",
      }),
    ).toThrow(/reason/);
    expect(() => validateAction("delete-everything", {})).toThrow(/Unknown action/);
  });
});
