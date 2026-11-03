import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: <T>(fn: T) => fn }));
const mocks = vi.hoisted(() => ({ requireShop: vi.fn(), calls: [] as [string, ...unknown[]][] }));
vi.mock("@/lib/auth", () => ({ requireShop: mocks.requireShop, getUserContext: vi.fn() }));
import { getSales } from "../src/lib/data";

beforeEach(() => {
  mocks.calls.length = 0;
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "gt", "gte", "lt", "or", "order"]) {
    builder[method] = (...args: unknown[]) => {
      mocks.calls.push([method, ...args]);
      return builder;
    };
  }
  builder.range = (...args: unknown[]) => {
    mocks.calls.push(["range", ...args]);
    return Promise.resolve({ data: [], count: 0, error: null });
  };
  mocks.requireShop.mockReset().mockResolvedValue({
    shop: { id: "isolated-shop", time_zone: "Asia/Karachi" },
    supabase: {
      from: (table: string) => {
        mocks.calls.push(["from", table]);
        return builder;
      },
    },
  });
});

describe("outstanding udhaar listing", () => {
  it("includes old unpaid credit with no date bound, filters before pagination and stays tenant-scoped", async () => {
    const result = await getSales({ due: "1", preset: "day", page: "2" });
    expect(result.filters).toMatchObject({ dueOnly: true, method: "credit" });
    expect(mocks.calls).toContainEqual(["eq", "shop_id", "isolated-shop"]);
    expect(mocks.calls).toContainEqual(["eq", "payment_method", "credit"]);
    expect(mocks.calls).toContainEqual(["gt", "balance_due", 0]);
    expect(mocks.calls.some(([method]) => method === "gte" || method === "lt")).toBe(false);
    expect(mocks.calls.findIndex(([method]) => method === "gt")).toBeLessThan(
      mocks.calls.findIndex(([method]) => method === "range"),
    );
    expect(mocks.calls).toContainEqual(["range", 25, 49]);
  });
  it("retains normal date filtering on sales and does not activate for arbitrary values", async () => {
    const result = await getSales({ due: "0", method: "credit" });
    expect(result.filters.dueOnly).toBe(false);
    expect(
      mocks.calls.some(([method, column]) => method === "gte" && column === "occurred_at"),
    ).toBe(true);
    expect(
      mocks.calls.some(([method, column]) => method === "lt" && column === "occurred_at"),
    ).toBe(true);
    expect(mocks.calls.some(([method]) => method === "gt")).toBe(false);
  });
});
