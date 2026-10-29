/** Synthetic, PUBLIC local test values. Never use these against a hosted project. */
export const APP_ORIGIN = "http://127.0.0.1:3000";
export const FIXTURE_ORIGIN = "http://127.0.0.1:54321";
export const FIXTURE_PUBLISHABLE_KEY = "sb_publishable_verdant_e2e_local_only";
export const FIXTURE_CONTROL_HEADER = "x-verdant-fixture";
export const FIXTURE_CONTROL_VALUE = "local-tests-only";
export const FIXTURE_CREDENTIALS = {
  owner: { email: "owner@verdant-fixture.test", password: "Verdant-fixture-owner-2026!" },
  staff: { email: "staff@verdant-fixture.test", password: "Verdant-fixture-staff-2026!" },
  other: { email: "other@verdant-fixture.test", password: "Verdant-fixture-other-2026!" },
  outsider: { email: "outsider@verdant-fixture.test", password: "Verdant-fixture-outsider-2026!" },
} as const;
export const FIXTURE_NAMES = {
  shop: "Verdant Fixture Shop",
  category: "Fixture Pantry",
  rice: "Fixture Rice",
  soap: "Fixture Soap",
  empty: "Fixture Empty Jar",
  tea: "Fixture Tea",
  other: "Other Shop Secret Product",
} as const;

export interface FixtureState {
  fixture: {
    shopId: string;
    otherShopId: string;
    categoryId: string;
    products: Record<"rice" | "soap" | "empty" | "tea" | "other", string>;
    sales: Record<"cash" | "credit", string>;
  };
  products: {
    id: string;
    name: string;
    current_stock: string;
    stock_status: string;
    category_id: string | null;
  }[];
  sales: {
    id: string;
    reference: string;
    payment_method: string;
    total: string;
    collected_total: string;
    balance_due: string;
    customer_name: string | null;
  }[];
  counts: {
    sales: number;
    payments: number;
    movements: number;
    cashbook: number;
    requests: number;
  };
  calls: {
    signIn: number;
    getUser: number;
    refresh: number;
    reads: number;
    rpcs: number;
    rejected: number;
  };
}
