import type { InventoryMovement } from "./types";
import type { MessageKey } from "./translations";

/** Every database movement enum must have an authored presentation label. */
export const MOVEMENT_LABELS = {
  opening: "opening",
  sale: "sale",
  receipt: "receipt",
  correction: "correction",
  damage: "damage",
  missing: "missing",
  return: "return",
  reversal: "reversal",
} as const satisfies Record<InventoryMovement["kind"], MessageKey>;
