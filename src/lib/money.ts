import Decimal from "decimal.js";
import type { Product, StockStatus } from "./types";

export const Exact = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export type DecimalInput = string | number | Decimal;

export function money(value: DecimalInput | null | undefined, currency = "USD"): string {
  if (value == null) return "—";
  try {
    // Format the whole part as BigInt, then splice in exact cents. Converting a
    // large aggregate to Number can visibly lose a cent even without arithmetic.
    const rounded = new Exact(value).toDecimalPlaces(2);
    const [whole, cents] = rounded.abs().toFixed(2).split(".");
    const integer = BigInt(whole);
    const negative = rounded.isNegative() && !rounded.isZero();
    const signed = negative ? (integer === 0n ? -0 : -integer) : integer;
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
      .formatToParts(signed)
      .map((part) => (part.type === "fraction" ? cents : part.value))
      .join("");
  } catch {
    return "—";
  }
}
export function quantity(value: DecimalInput | null | undefined): string {
  if (value == null) return "—";
  try {
    const rounded = new Exact(value).toDecimalPlaces(3);
    const [whole, decimals] = rounded.abs().toFixed(3).split(".");
    const fraction = decimals.replace(/0+$/, "");
    const integer = BigInt(whole);
    const signed =
      rounded.isNegative() && !rounded.isZero() ? (integer === 0n ? -0 : -integer) : integer;
    return new Intl.NumberFormat("en", {
      minimumFractionDigits: fraction.length,
      maximumFractionDigits: fraction.length,
    })
      .formatToParts(signed)
      .map((part) => (part.type === "fraction" ? fraction : part.value))
      .join("");
  } catch {
    return "—";
  }
}
export function lineTotal(
  qty: DecimalInput,
  price: DecimalInput,
  discount: DecimalInput = "0",
): string {
  try {
    return new Exact(qty || "0")
      .mul(price || "0")
      .toDecimalPlaces(2)
      .minus(discount || "0")
      .toFixed(2);
  } catch {
    return "0.00";
  }
}
export function sum(values: DecimalInput[]): string {
  return values.reduce<Decimal>((total, value) => total.plus(value), new Exact(0)).toFixed(2);
}
export function stockStatus(
  product: Pick<Product, "current_stock" | "low_stock_threshold">,
): StockStatus {
  const current = new Exact(product.current_stock);
  if (current.lte(0)) return "out";
  return current.lte(product.low_stock_threshold) ? "low" : "in";
}
