import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ requireApiContext: vi.fn(), getReport: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireApiContext: mocks.requireApiContext }));
vi.mock("@/lib/data", () => ({
  getReport: mocks.getReport,
  normalize: (value: unknown) => value,
  PRODUCT_COLUMNS: "",
  SALE_COLUMNS: "",
  CASH_COLUMNS: "",
  EXPENSE_COLUMNS: "",
}));
import { GET } from "../src/app/api/export/route";
import { parseCSV } from "../src/lib/csv";
import { AppError } from "../src/lib/errors";

beforeEach(() => {
  mocks.requireApiContext.mockReset().mockResolvedValue({
    supabase: {},
    shop: { id: "verified-shop", currency: "USD", time_zone: "UTC" },
  });
  mocks.getReport.mockReset().mockResolvedValue({
    summary: {
      revenue: "5.00",
      units: "1",
      sales_count: 1,
      cost_of_goods: "0",
      gross_profit: null,
      known_gross_profit: "0",
      unknown_cost_lines: 1,
      expenses: "0",
      estimated_net_profit: null,
      cash_received: "5.00",
      digital_received: "0",
      credit_sales: "0",
      refunds: "0",
      net_cash_movement: "5.00",
    },
    trend: [{ date: "2026-10-28", revenue: "5.00", units: "1" }],
    products: [
      {
        product_id: "product",
        name: "=SUM(1+1)",
        category: "Test category",
        units: "1",
        revenue: "5.00",
        cost: "0",
        gross_profit: null,
        unknown_cost_lines: 1,
      },
    ],
    categories: [{ category: "Test category", units: "1", revenue: "5.00", gross_profit: null }],
    payment_methods: [],
  });
});
describe("authenticated report export", () => {
  it("exports consistent columns and explicit missing-cost flags without inventing zero costs/profit", async () => {
    const response = await GET(
      new Request("https://shop.example/api/export?type=report&from=2026-10-28&to=2026-10-28"),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const rows = parseCSV(await response.text());
    expect(rows.every((row) => row.length === rows[0].length)).toBe(true);
    const record = Object.fromEntries(rows[0].map((key, i) => [key, rows[1][i]]));
    expect(record).toMatchObject({
      section: "summary",
      revenue: "5.00",
      cost_of_goods: "",
      gross_profit: "",
      estimated_net_profit: "",
      unknown_cost_lines: "1",
    });
    expect(rows.find((row) => row[0] === "product")?.[2]).toBe("'=SUM(1+1)");
    expect(mocks.getReport).toHaveBeenCalledWith(
      "verified-shop",
      "2026-10-28T00:00:00.000Z",
      "2026-10-29T00:00:00.000Z",
    );
  });
  it("rejects unauthenticated exports and unsupported types", async () => {
    mocks.requireApiContext.mockRejectedValueOnce(new AppError("Sign in to continue.", 401));
    expect((await GET(new Request("https://shop.example/api/export?type=report"))).status).toBe(
      401,
    );
    expect((await GET(new Request("https://shop.example/api/export?type=auth-users"))).status).toBe(
      400,
    );
  });
  it("rejects invalid explicit date ranges instead of exporting a misleading fallback period", async () => {
    const response = await GET(
      new Request("https://shop.example/api/export?type=report&from=2026-02-31&to=2026-03-01"),
    );
    expect(response.status).toBe(400);
    expect(mocks.getReport).not.toHaveBeenCalled();
  });
});
