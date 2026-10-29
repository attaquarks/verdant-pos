import { requireApiContext } from "@/lib/auth";
import { toCSV } from "@/lib/csv";
import {
  CASH_COLUMNS,
  EXPENSE_COLUMNS,
  PRODUCT_COLUMNS,
  SALE_COLUMNS,
  getReport,
  normalize,
} from "@/lib/data";
import { calendarBounds, getDateRange } from "@/lib/dates";
import { AppError, databaseError } from "@/lib/errors";
import { errorResponse } from "@/lib/http";
import type { CashEntry, Expense, Product, Sale } from "@/lib/types";

export const dynamic = "force-dynamic";
const MAX_ROWS = 50000;

export async function GET(request: Request) {
  try {
    const { supabase, shop } = await requireApiContext();
    if (!shop) throw new AppError("Create your shop first.", 403);
    const params = new URL(request.url).searchParams;
    const type = params.get("type") || "inventory";
    if (!["inventory", "sales", "report", "cashbook", "expenses"].includes(type))
      throw new AppError("Choose a supported export type.");
    let range = getDateRange(Object.fromEntries(params), shop.time_zone);
    if (params.has("from") || params.has("to")) {
      const from = params.get("from") || "",
        to = params.get("to") || "";
      try {
        range = { ...range, from, to, ...calendarBounds(from, to, shop.time_zone) };
      } catch (error) {
        throw new AppError(error instanceof Error ? error.message : "Choose a valid date range.");
      }
    }
    async function allRows<T>(table: string, selection = "*", dateFilter = true): Promise<T[]> {
      const rows: unknown[] = [];
      for (let offset = 0; offset < MAX_ROWS; offset += 1000) {
        let query = supabase
          .from(table)
          .select(selection, { count: offset === 0 ? "exact" : undefined })
          .eq("shop_id", shop!.id);
        if (dateFilter)
          query = query
            .gte("occurred_at", range.start)
            .lt("occurred_at", range.end)
            .order("occurred_at");
        const result = await query.order("id").range(offset, offset + 999);
        if (result.error) throw databaseError(result.error);
        if (offset === 0 && (result.count ?? 0) > MAX_ROWS)
          throw new AppError(
            "This export exceeds 50,000 rows. Select a smaller date range or use a database backup.",
            413,
          );
        rows.push(...(result.data ?? []));
        if ((result.data?.length ?? 0) < 1000) break;
      }
      return normalize<T[]>(rows);
    }
    let headers: string[], rows: unknown[][];
    if (type === "inventory") {
      const products = await allRows<Product>("products", PRODUCT_COLUMNS, false);
      headers = [
        "name",
        "category",
        "sku",
        "barcode",
        "unit",
        "cost_price",
        "selling_price",
        "opening_stock",
        "low_stock_threshold",
        "is_active",
      ];
      rows = products.map((p) => [
        p.name,
        p.category?.name,
        p.sku,
        p.barcode,
        p.unit,
        p.cost_price,
        p.selling_price,
        p.current_stock,
        p.low_stock_threshold,
        p.is_active,
      ]);
    } else if (type === "sales") {
      const sales = await allRows<Sale>("sales_ledger", SALE_COLUMNS);
      headers = [
        "sale_id",
        "reference",
        "occurred_at_utc",
        "status",
        "products",
        "original_units",
        "original_total",
        "returns",
        "net_total",
        "payment_method",
        "net_collected",
        "balance_due",
        "customer_name",
        "note",
      ];
      rows = sales.map((s) => [
        s.id,
        s.reference,
        s.occurred_at,
        s.status,
        s.product_names,
        s.units,
        s.total,
        s.returned_total,
        s.net_total,
        s.payment_method,
        s.collected_total,
        s.balance_due,
        s.customer_name,
        s.note,
      ]);
    } else if (type === "cashbook") {
      const entries = await allRows<CashEntry>("cashbook_entries", CASH_COLUMNS);
      headers = [
        "entry_id",
        "occurred_at_utc",
        "type",
        "description",
        "payment_method",
        "direction",
        "amount",
        "source_id",
      ];
      rows = entries.map((e) => [
        e.id,
        e.occurred_at,
        e.kind,
        e.description,
        e.method,
        e.direction,
        e.amount,
        e.source_id,
      ]);
    } else if (type === "expenses") {
      const expenses = await allRows<Expense>("expenses", EXPENSE_COLUMNS);
      headers = [
        "expense_id",
        "occurred_at_utc",
        "description",
        "category",
        "payment_method",
        "amount",
      ];
      rows = expenses.map((e) => [
        e.id,
        e.occurred_at,
        e.description,
        e.category,
        e.method,
        e.amount,
      ]);
    } else {
      const report = await getReport(shop.id, range.start, range.end);
      headers = [
        "section",
        "date",
        "product",
        "category",
        "revenue",
        "units",
        "cost_of_goods",
        "gross_profit",
        "expenses",
        "estimated_net_profit",
        "cash_received",
        "digital_received",
        "credit_sales",
        "refunds",
        "unknown_cost_lines",
        "currency",
        "time_zone",
      ];
      const s = report.summary;
      rows = [
        [
          "summary",
          `${range.from} to ${range.to}`,
          "",
          "",
          s.revenue,
          s.units,
          s.unknown_cost_lines ? null : s.cost_of_goods,
          s.gross_profit,
          s.expenses,
          s.estimated_net_profit,
          s.cash_received,
          s.digital_received,
          s.credit_sales,
          s.refunds,
          s.unknown_cost_lines,
          shop.currency,
          shop.time_zone,
        ],
        ...report.trend.map((d) => [
          "daily",
          d.date,
          "",
          "",
          d.revenue,
          d.units,
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          shop.currency,
          shop.time_zone,
        ]),
        ...report.products.map((p) => [
          "product",
          "",
          p.name,
          p.category,
          p.revenue,
          p.units,
          p.unknown_cost_lines ? null : p.cost,
          p.gross_profit,
          "",
          "",
          "",
          "",
          "",
          "",
          p.unknown_cost_lines,
          shop.currency,
          shop.time_zone,
        ]),
        ...report.categories.map((c) => [
          "category",
          "",
          "",
          c.category,
          c.revenue,
          c.units,
          "",
          c.gross_profit,
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          shop.currency,
          shop.time_zone,
        ]),
      ];
    }
    return new Response(toCSV(headers, rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="verdant-${type}-${range.from}-${range.to}.csv"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
