import "server-only";
import { cache } from "react";
import { getUserContext, requireShop } from "./auth";
import { databaseError, AppError } from "./errors";
import { getDateRange, param, type SearchParams } from "./dates";
import type {
  CashEntry,
  Category,
  DashboardData,
  Expense,
  InventoryData,
  InventoryMovement,
  PageResult,
  Product,
  Report,
  Sale,
  SaleAdjustment,
  SaleDetail,
  SaleItem,
  Payment,
} from "./types";

const PAGE_SIZE = 25;
// PostgREST casts are essential: do not let JSON.parse round high-precision
// numeric columns before decimal.js or the product editor sees their values.
export const PRODUCT_COLUMNS =
  "id,shop_id,category_id,name,sku,barcode,unit,cost_price::text,selling_price::text,current_stock::text,low_stock_threshold::text,is_active,created_at,updated_at,category:categories(id,shop_id,name)";
export const SALE_COLUMNS =
  "id,shop_id,reference,status,payment_method,subtotal::text,discount_total::text,total::text,customer_name,customer_contact,note,occurred_at,created_by,net_total::text,returned_total::text,collected_total::text,balance_due::text,payment_status,units::text,product_names";
export const CASH_COLUMNS =
  "id,shop_id,kind,direction,description,method,amount::text,source_id,occurred_at";
export const EXPENSE_COLUMNS =
  "id,shop_id,description,category,amount::text,method,occurred_at,created_by";
const ITEM_COLUMNS =
  "id,shop_id,sale_id,product_id,product_name,category_name,sku,unit,quantity::text,unit_price::text,discount::text,line_total::text,unit_cost::text,cost_total::text,returned_quantity::text";
const MOVEMENT_COLUMNS =
  "id,shop_id,product_id,kind,quantity_delta::text,stock_after::text,unit_cost::text,reference_id,note,occurred_at,created_by";
const NUMERIC_FIELDS = new Set([
  "cost_price",
  "selling_price",
  "current_stock",
  "low_stock_threshold",
  "opening_stock",
  "quantity",
  "quantity_delta",
  "stock_after",
  "unit_cost",
  "unit_price",
  "discount",
  "line_total",
  "cost_total",
  "subtotal",
  "discount_total",
  "total",
  "net_total",
  "returned_total",
  "collected_total",
  "balance_due",
  "units",
  "returned_quantity",
  "amount",
  "revenue",
  "cost_of_goods",
  "gross_profit",
  "known_gross_profit",
  "expenses",
  "estimated_net_profit",
  "cash_received",
  "digital_received",
  "credit_sales",
  "refunds",
  "net_cash_movement",
  "inflow",
  "outflow",
  "net",
  "cost",
]);
/** Normalize trusted database numerics for a stable decimal-string UI contract. */
export function normalize<T>(value: unknown): T {
  const walk = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(walk);
    if (input && typeof input === "object")
      return Object.fromEntries(
        Object.entries(input).map(([key, item]) => [
          key,
          item != null && NUMERIC_FIELDS.has(key) ? String(item) : walk(item),
        ]),
      );
    return input;
  };
  return walk(value) as T;
}
function searchText(value: string): string {
  return value
    .slice(0, 120)
    .replace(/[^\p{L}\p{N}\s@#./-]/gu, " ")
    .trim();
}
function pageNumber(params: SearchParams): number {
  const n = Number(param(params, "page", "1"));
  return Number.isInteger(n) && n >= 1 && n <= 100000 ? n : 1;
}
function check<T>(result: { data: T | null; error: { code?: string; message: string } | null }): T {
  if (result.error) throw databaseError(result.error);
  if (result.data == null) throw new AppError("The requested record was not found.", 404);
  return result.data;
}
export const getLowStockCount = cache(async (shopId: string): Promise<number> => {
  const { supabase } = await getUserContext();
  const result = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("shop_id", shopId)
    .eq("is_active", true)
    .in("stock_status", ["low", "out"]);
  if (result.error) throw databaseError(result.error);
  return result.count ?? 0;
});
export const getReport = cache(
  async (shopId: string, start: string, end: string): Promise<Report> => {
    const { supabase } = await getUserContext();
    const result = await supabase.rpc("report_shop", {
      p_shop_id: shopId,
      p_from: start,
      p_to: end,
    });
    return normalize<Report>(check(result));
  },
);
export async function getDashboard(params: SearchParams): Promise<DashboardData> {
  const { shop, supabase } = await requireShop();
  const range = getDateRange(params, shop.time_zone);
  const today = getDateRange({ period: "day" }, shop.time_zone);
  const week = getDateRange({ period: "week" }, shop.time_zone);
  const [todayReport, weekReport, period, lowStockCount, lowResult, salesResult] =
    await Promise.all([
      getReport(shop.id, today.start, today.end),
      getReport(shop.id, week.start, week.end),
      getReport(shop.id, range.start, range.end),
      getLowStockCount(shop.id),
      supabase
        .from("products")
        .select(PRODUCT_COLUMNS)
        .eq("shop_id", shop.id)
        .eq("is_active", true)
        .in("stock_status", ["out", "low"])
        .order("current_stock")
        .order("id")
        .limit(6),
      supabase
        .from("sales_ledger")
        .select(SALE_COLUMNS)
        .eq("shop_id", shop.id)
        .order("occurred_at", { ascending: false })
        .order("id")
        .limit(6),
    ]);
  return {
    today: todayReport,
    week: weekReport,
    period,
    range,
    lowStockCount,
    lowStock: normalize<Product[]>(check(lowResult)),
    recentSales: normalize<Sale[]>(check(salesResult)),
  };
}
export async function getInventory(params: SearchParams): Promise<InventoryData> {
  const { shop, supabase } = await requireShop();
  const page = pageNumber(params);
  const search = searchText(param(params, "q", param(params, "search")));
  const category = param(params, "category");
  const stock = ["in", "low", "out", "alerts"].includes(param(params, "stock"))
    ? param(params, "stock")
    : "";
  const sort = ["name", "stock", "price", "newest"].includes(param(params, "sort"))
    ? param(params, "sort")
    : "name";
  const active = param(params, "active") === "archived" ? "archived" : "active";
  let query = supabase
    .from("products")
    .select(PRODUCT_COLUMNS, { count: "exact" })
    .eq("shop_id", shop.id)
    .eq("is_active", active === "active");
  if (search)
    query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%,barcode.ilike.%${search}%`);
  if (/^[0-9a-f-]{36}$/i.test(category)) query = query.eq("category_id", category);
  if (category === "uncategorized") query = query.is("category_id", null);
  if (stock === "alerts") query = query.in("stock_status", ["low", "out"]);
  else if (stock) query = query.eq("stock_status", stock);
  const sortColumn =
    { name: "name", stock: "current_stock", price: "selling_price", newest: "created_at" }[sort] ||
    "name";
  query = query.order(sortColumn, { ascending: sort !== "newest" }).order("id");
  const countQuery = (status?: string) => {
    let q = supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", shop.id)
      .eq("is_active", true);
    if (status) q = q.eq("stock_status", status);
    return q;
  };
  const [result, categories, activeCount, lowCount, outCount] = await Promise.all([
    query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
    supabase
      .from("categories")
      .select("id,shop_id,name")
      .eq("shop_id", shop.id)
      .order("name")
      .limit(1000),
    countQuery(),
    countQuery("low"),
    countQuery("out"),
  ]);
  for (const response of [result, categories, activeCount, lowCount, outCount])
    if (response.error) throw databaseError(response.error);
  return {
    products: {
      rows: normalize<Product[]>(result.data ?? []),
      count: result.count ?? 0,
      page,
      pageSize: PAGE_SIZE,
    },
    categories: categories.data as Category[],
    counts: { active: activeCount.count ?? 0, low: lowCount.count ?? 0, out: outCount.count ?? 0 },
    filters: { search, category, stock, sort, active },
  };
}
export async function findProducts(q: string): Promise<Product[]> {
  const { shop, supabase } = await requireShop();
  const search = searchText(q);
  let query = supabase
    .from("products")
    .select(PRODUCT_COLUMNS)
    .eq("shop_id", shop.id)
    .eq("is_active", true);
  if (search)
    query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%,barcode.ilike.%${search}%`);
  return normalize<Product[]>(check(await query.order("name").order("id").limit(25)));
}
export async function getSales(params: SearchParams) {
  const { shop, supabase } = await requireShop();
  const range = getDateRange(params, shop.time_zone);
  const page = pageNumber(params);
  const search = searchText(param(params, "q", param(params, "search")));
  const method = ["cash", "digital", "credit"].includes(param(params, "method"))
    ? param(params, "method")
    : "";
  let query = supabase
    .from("sales_ledger")
    .select(SALE_COLUMNS, { count: "exact" })
    .eq("shop_id", shop.id)
    .gte("occurred_at", range.start)
    .lt("occurred_at", range.end);
  if (search)
    query = query.or(
      `reference.ilike.%${search}%,product_names.ilike.%${search}%,customer_name.ilike.%${search}%`,
    );
  if (method) query = query.eq("payment_method", method);
  const result = await query
    .order("occurred_at", { ascending: false })
    .order("id")
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  return {
    sales: {
      rows: normalize<Sale[]>(check(result)),
      count: result.count ?? 0,
      page,
      pageSize: PAGE_SIZE,
    } as PageResult<Sale>,
    range,
    filters: { search, method },
  };
}
export async function getSaleDetail(id: string): Promise<SaleDetail> {
  const { shop, supabase } = await requireShop();
  const [sale, items, payments, adjustments] = await Promise.all([
    supabase
      .from("sales_ledger")
      .select(SALE_COLUMNS)
      .eq("shop_id", shop.id)
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("sale_items_ledger")
      .select(ITEM_COLUMNS)
      .eq("shop_id", shop.id)
      .eq("sale_id", id)
      .order("id"),
    supabase
      .from("payments")
      .select("id,sale_id,method,kind,amount::text,note,occurred_at")
      .eq("shop_id", shop.id)
      .eq("sale_id", id)
      .order("occurred_at"),
    supabase
      .from("sale_adjustments")
      .select("id,sale_id,kind,reason,total::text,occurred_at")
      .eq("shop_id", shop.id)
      .eq("sale_id", id)
      .order("occurred_at"),
  ]);
  return {
    sale: normalize<Sale>(check(sale)),
    items: normalize<SaleItem[]>(check(items)),
    payments: normalize<Payment[]>(check(payments)),
    adjustments: normalize<SaleAdjustment[]>(check(adjustments)),
  };
}
export async function getMovements(productId: string): Promise<InventoryMovement[]> {
  const { shop, supabase } = await requireShop();
  const product = await supabase
    .from("products")
    .select("id")
    .eq("shop_id", shop.id)
    .eq("id", productId)
    .maybeSingle();
  check(product);
  return normalize<InventoryMovement[]>(
    check(
      await supabase
        .from("inventory_movements")
        .select(MOVEMENT_COLUMNS)
        .eq("shop_id", shop.id)
        .eq("product_id", productId)
        .order("occurred_at", { ascending: false })
        .order("id")
        .limit(200),
    ),
  );
}
export async function getCashbook(params: SearchParams) {
  const { shop, supabase } = await requireShop();
  const range = getDateRange(params, shop.time_zone),
    page = pageNumber(params);
  const [entries, totals] = await Promise.all([
    supabase
      .from("cashbook_entries")
      .select(CASH_COLUMNS, { count: "exact" })
      .eq("shop_id", shop.id)
      .gte("occurred_at", range.start)
      .lt("occurred_at", range.end)
      .order("occurred_at", { ascending: false })
      .order("id")
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
    supabase.rpc("cashbook_totals", { p_shop_id: shop.id, p_from: range.start, p_to: range.end }),
  ]);
  return {
    entries: {
      rows: normalize<CashEntry[]>(check(entries)),
      count: entries.count ?? 0,
      page,
      pageSize: PAGE_SIZE,
    },
    range,
    totals: normalize<{ inflow: string; outflow: string; net: string }>(check(totals)),
  };
}
export async function getExpenses(params: SearchParams) {
  const { shop, supabase } = await requireShop();
  const range = getDateRange(params, shop.time_zone),
    page = pageNumber(params);
  const [expenses, report] = await Promise.all([
    supabase
      .from("expenses")
      .select(EXPENSE_COLUMNS, { count: "exact" })
      .eq("shop_id", shop.id)
      .gte("occurred_at", range.start)
      .lt("occurred_at", range.end)
      .order("occurred_at", { ascending: false })
      .order("id")
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
    getReport(shop.id, range.start, range.end),
  ]);
  return {
    expenses: {
      rows: normalize<Expense[]>(check(expenses)),
      count: expenses.count ?? 0,
      page,
      pageSize: PAGE_SIZE,
    },
    range,
    total: report.summary.expenses,
  };
}
