import { readFileSync } from "node:fs";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { DashboardData, DateRange, Product, Report, Shop } from "../src/lib/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));
// The real Modal intentionally portals only after mounting. Render its content here;
// browser tests exercise the actual portal, focus, and warnings after interaction.
vi.mock("../src/components/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/components/ui")>();
  return {
    ...actual,
    Modal: ({
      title,
      description,
      children,
      footer,
    }: {
      title: string;
      description?: string;
      children: ReactNode;
      footer?: ReactNode;
    }) =>
      createElement(
        "section",
        { role: "dialog", "aria-label": title },
        createElement("h2", null, title),
        description && createElement("p", null, description),
        children,
        footer,
      ),
  };
});

import { PreferencesProvider } from "../src/components/preferences";
import { DashboardView } from "../src/components/dashboard-view";
import { CashbookView } from "../src/components/cashbook-view";
import { ExpensesView } from "../src/components/expenses-view";
import { ReportsView } from "../src/components/reports-view";
import { SalesView } from "../src/components/sales-view";
import { SettingsView } from "../src/components/settings-view";
import {
  AdjustDialog,
  DeactivateDialog,
  ImportDialog,
  ProductEditor,
  ReceiveDialog,
} from "../src/components/inventory-dialogs";
import { SaleDialog } from "../src/components/sale-dialog";
import { SetupView } from "../src/components/setup-view";

const shop: Shop = {
  id: "shop",
  name: "Fixture Shop",
  currency: "USD",
  time_zone: "Asia/Karachi",
  created_at: "2025-01-01T00:00:00Z",
};
const range: DateRange = {
  from: "2025-01-01",
  to: "2025-01-31",
  start: "2025-01-01T00:00:00Z",
  end: "2025-02-01T00:00:00Z",
  label: "January",
  preset: "custom",
};
const report: Report = {
  summary: {
    revenue: "123.45",
    units: "7",
    sales_count: 3,
    cost_of_goods: "40",
    gross_profit: null,
    known_gross_profit: "83.45",
    unknown_cost_lines: 2,
    expenses: "5.00",
    estimated_net_profit: null,
    cash_received: "33.00",
    digital_received: "20.00",
    credit_sales: "70.45",
    refunds: "2.00",
    net_cash_movement: "51.00",
  },
  trend: [],
  products: [],
  categories: [],
  payment_methods: [],
};
const dashboard: DashboardData = {
  today: report,
  week: report,
  period: report,
  range,
  lowStock: [],
  lowStockCount: 4,
  recentSales: [],
};
const product: Product = {
  id: "p1",
  shop_id: shop.id,
  category_id: null,
  name: "Rice",
  sku: null,
  barcode: null,
  unit: "bag",
  cost_price: null,
  selling_price: "15.00",
  current_stock: "3",
  low_stock_threshold: "2",
  is_active: true,
  created_at: shop.created_at,
  updated_at: shop.created_at,
};
const noOp = () => {};
const render = (node: ReactNode, locale: "en" | "ur" = "en") =>
  renderToStaticMarkup(
    createElement(PreferencesProvider, {
      initialLocale: locale,
      initialTheme: "night",
      children: node,
    }),
  );

const source = (name: string) => readFileSync(`src/components/${name}.tsx`, "utf8");

describe("less reading without losing meaning", () => {
  it("keeps the four task descriptions, metrics, date controls and accounting note without metric details", () => {
    const html = render(createElement(DashboardView, { data: dashboard, shop }));
    expect(html.match(/class="task-card(?: |")/g) ?? []).toHaveLength(4);
    for (const copy of [
      "Choose maal, then cash, digital or udhaar.",
      "See what is left. Receive new deliveries here.",
      "Open a credit sale and record the money received.",
      "Rent, electricity or transport — keep a clear record.",
      "Today’s revenue",
      "Units sold today",
      "Weekly revenue",
      "Low-stock products",
      "$123.45",
      "Net revenue",
      "Today’s sales &amp; payments",
      "From date",
      "To date, inclusive",
    ])
      expect(html).toContain(copy);
    expect(html).not.toContain("metric-detail");
    expect(html).not.toContain("Choose a task. Your saved records stay safe.");
    expect(html).not.toContain("A clear view of your shop. Every number");
    expect(html).not.toContain("Aaj ka hisaab");
    expect(html).not.toContain("page-footnote");
  });
  it("keeps page headings brief without explanatory subtitles", () => {
    for (const name of [
      "dashboard-view",
      "inventory-view",
      "sales-view",
      "cashbook-view",
      "expenses-view",
      "reports-view",
      "settings-view",
    ]) {
      expect(source(name), name).not.toMatch(/subtitle=\{/);
      expect(source(name), name).not.toContain('className="page-footnote"');
    }
  });
  it("still displays critical cost, partial-profit, cash, expense and backup warnings", () => {
    const reports = render(createElement(ReportsView, { report, range, shop }));
    for (const copy of [
      "unknown historical cost",
      "Gross and net profit are unavailable",
      "Unavailable",
      "Known-cost gross profit:",
      "$83.45",
      "partial information, not the shop’s total profit",
    ])
      expect(reports).toContain(copy);
    const sales = render(
      createElement(SalesView, {
        shop,
        range,
        sales: { rows: [], count: 0, page: 1, pageSize: 20 },
        filters: { search: "", method: "all", dueOnly: false },
      }),
    );
    expect(sales).not.toContain("Sales stay in their original period;");
    const cashbook = render(
      createElement(CashbookView, {
        shop,
        range,
        entries: { rows: [], count: 0, page: 1, pageSize: 20 },
        totals: { inflow: "33.00", outflow: "2.00", net: "31.00" },
      }),
    );
    for (const copy of ["not profit", "$31.00"]) expect(cashbook).toContain(copy);
    const expenses = render(
      createElement(ExpensesView, {
        shop,
        range,
        expenses: { rows: [], count: 0, page: 1, pageSize: 20 },
        total: "5.00",
      }),
    );
    for (const copy of ["Expense ledger", "$5.00"]) expect(expenses).toContain(copy);
    const settings = render(createElement(SettingsView, { shop, role: "owner" }));
    for (const copy of [
      "not a full database backup",
      "Keep backups private and encrypted.",
      "Test a restore before you need it.",
      "Do not treat an export as a restorable backup",
      "Locked after the first product or financial activity",
      "does not charge a card",
    ])
      expect(settings).toContain(copy);
    expect(settings).not.toContain("Portable records and a clear plan for backups");
  });
  it("retains action consequences, unknown-cost guidance and input validation in rendered dialogs", () => {
    const common = { onClose: noOp, onSuccess: noOp };
    const editor = render(createElement(ProductEditor, { ...common, categories: [], shop }));
    expect(editor).toContain("Unknown cost is never treated as zero profit.");
    expect(editor).not.toContain("Create a product and set its opening stock.");
    const receive = render(createElement(ReceiveDialog, { ...common, product, shop }));
    expect(receive).toContain("Paid deliveries post a supplier payment to the cashbook.");
    expect(receive).toContain("Unpaid deliveries do not create cash movement.");
    const adjustment = render(createElement(AdjustDialog, { ...common, product }));
    expect(adjustment).toContain("permanent, timestamped movement");
    expect(adjustment).toContain("does not record revenue or a payment");
    const deactivate = render(createElement(DeactivateDialog, { ...common, product }));
    expect(deactivate).toContain("no longer be available for new sales");
    expect(deactivate).toContain("Sales, stock movements, and reports stay intact");
    const csv = render(createElement(ImportDialog, common));
    expect(csv).toContain("If any row fails validation, nothing is imported.");
    expect(csv).toContain("SKUs and barcodes must be unique.");
    const sale = render(createElement(SaleDialog, { ...common, shop }));
    expect(sale).toContain("No money is transferred by this app.");
    expect(sale).toContain("saved only after the server confirms it");
    expect(sale).not.toContain("Build the sale, choose payment, and record it once.");
  });
  it("preserves Urdu translations, Roman-Urdu context and setup key warnings", () => {
    const urdu = render(createElement(DashboardView, { data: dashboard, shop }), "ur");
    expect(urdu).toContain("آج کا خلاصہ");
    expect(urdu).toContain("$123.45");
    expect(urdu).not.toContain("Aaj ka hisaab");
    const setup = render(createElement(SetupView));
    expect(setup).toContain("Never put a service-role key, database password, or secret key");
    expect(setup).toContain("No database is connected yet.");
    expect(setup).toContain("Verify the connected project, migrations, and deployment before use.");
  });
  it("retains destructive, duplicate retry and backup safeguards and removes the requested sale paragraph", () => {
    const details = source("sale-details");
    expect(details).toContain(
      "This posts a permanent reversal, restocks every original item, and refunds any money due. The original sale stays visible. This cannot be undone.",
    );
    expect(details).toContain(
      "Unpaid credit is reduced first; a refund is issued only for money paid beyond the remaining sale value.",
    );
    expect(details).toContain(
      "Original sale item snapshots. Catalog changes do not affect these amounts.",
    );
    expect(details).not.toContain(
      "Prices, discounts, and costs above are the original historical snapshots. Unknown costs remain unavailable.",
    );
    expect(source("sale-dialog")).toContain(
      "It may already have been saved. Retry this unchanged form to recover the original result safely.",
    );
    expect(source("cashbook-view")).toContain(
      "Use this only for a payment not already recorded with a stock receipt.",
    );
  });
});
