import { Exact, money } from "../lib/money";

/** Unit costs can have four decimal places; never visually turn a small known cost into zero. */
export function unitCost(
  value: string | null,
  currency: string,
  unavailable = "Unavailable",
): string {
  if (value === null) return unavailable;
  const cost = new Exact(value);
  return cost.decimalPlaces() <= 2 ? money(value, currency) : `${cost.toFixed(4)} ${currency}`;
}
