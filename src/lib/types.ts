export type Numeric = string;
export type PaymentMethod = "cash" | "digital";
export type SalePaymentMethod = PaymentMethod | "credit";
export type StockStatus = "in" | "low" | "out";

export interface Shop {
  id: string;
  name: string;
  currency: string;
  time_zone: string;
  created_at: string;
}
export interface Membership {
  shop_id: string;
  user_id: string;
  role: "owner" | "staff";
  is_active: boolean;
  revoked_at: string | null;
}
export interface Category {
  id: string;
  shop_id: string;
  name: string;
}
export interface Product {
  id: string;
  shop_id: string;
  category_id: string | null;
  name: string;
  sku: string | null;
  barcode: string | null;
  unit: string;
  cost_price: Numeric | null;
  selling_price: Numeric;
  current_stock: Numeric;
  low_stock_threshold: Numeric;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  category?: Category | null;
}
export interface ProductInput {
  expected_updated_at?: string;
  name: string;
  category_id: string | null;
  sku: string | null;
  barcode: string | null;
  unit: string;
  cost_price: Numeric | null;
  selling_price: Numeric;
  opening_stock: Numeric;
  low_stock_threshold: Numeric;
  is_active: boolean;
}
export interface SaleLineInput {
  product_id: string;
  quantity: Numeric;
  unit_price: Numeric;
  discount: Numeric;
}
export interface Sale {
  id: string;
  shop_id: string;
  reference: string;
  status: "posted" | "partially_returned" | "returned" | "reversed";
  payment_method: SalePaymentMethod;
  subtotal: Numeric;
  discount_total: Numeric;
  total: Numeric;
  customer_name: string | null;
  customer_contact: string | null;
  note: string | null;
  occurred_at: string;
  created_by: string;
  net_total: Numeric;
  returned_total: Numeric;
  collected_total: Numeric;
  balance_due: Numeric;
  payment_status: "paid" | "unpaid" | "partially_paid" | "refunded" | "reversed";
  units: Numeric;
  product_names: string;
}
export interface SaleItem {
  id: string;
  sale_id: string;
  product_id: string;
  product_name: string;
  category_name: string | null;
  sku: string | null;
  unit: string;
  quantity: Numeric;
  unit_price: Numeric;
  discount: Numeric;
  line_total: Numeric;
  unit_cost: Numeric | null;
  cost_total: Numeric | null;
  returned_quantity: Numeric;
}
export interface Payment {
  id: string;
  sale_id: string;
  method: PaymentMethod;
  kind: "sale" | "collection" | "refund";
  amount: Numeric;
  note: string | null;
  occurred_at: string;
}
export interface SaleAdjustment {
  id: string;
  sale_id: string;
  kind: "return" | "reversal";
  reason: string;
  total: Numeric;
  occurred_at: string;
}
export interface SaleDetail {
  sale: Sale;
  items: SaleItem[];
  payments: Payment[];
  adjustments: SaleAdjustment[];
}
export interface InventoryMovement {
  id: string;
  shop_id: string;
  product_id: string;
  kind:
    "opening" | "sale" | "receipt" | "correction" | "damage" | "missing" | "return" | "reversal";
  quantity_delta: Numeric;
  stock_after: Numeric;
  unit_cost: Numeric | null;
  reference_id: string | null;
  note: string | null;
  occurred_at: string;
  created_by: string;
}
export interface Expense {
  id: string;
  shop_id: string;
  description: string;
  category: string;
  amount: Numeric;
  method: PaymentMethod;
  occurred_at: string;
  created_by: string;
}
export interface CashEntry {
  id: string;
  shop_id: string;
  kind:
    | "sale"
    | "credit_collection"
    | "refund"
    | "supplier_payment"
    | "expense"
    | "owner_withdrawal"
    | "owner_deposit";
  direction: "in" | "out";
  description: string;
  method: PaymentMethod;
  amount: Numeric;
  source_id: string | null;
  occurred_at: string;
}
export interface ReportSummary {
  revenue: Numeric;
  units: Numeric;
  sales_count: number;
  cost_of_goods: Numeric;
  gross_profit: Numeric | null;
  known_gross_profit: Numeric;
  unknown_cost_lines: number;
  expenses: Numeric;
  estimated_net_profit: Numeric | null;
  cash_received: Numeric;
  digital_received: Numeric;
  credit_sales: Numeric;
  refunds: Numeric;
  net_cash_movement: Numeric;
}
export interface ProductPerformance {
  product_id: string;
  name: string;
  sku: string | null;
  category: string;
  units: Numeric;
  revenue: Numeric;
  cost: Numeric;
  gross_profit: Numeric | null;
  unknown_cost_lines: number;
}
export interface CategoryPerformance {
  category: string;
  units: Numeric;
  revenue: Numeric;
  gross_profit: Numeric | null;
}
export interface Report {
  summary: ReportSummary;
  trend: { date: string; revenue: Numeric; units: Numeric }[];
  products: ProductPerformance[];
  categories: CategoryPerformance[];
  payment_methods: { method: PaymentMethod; inflow: Numeric; outflow: Numeric; net: Numeric }[];
}
export interface DateRange {
  from: string;
  to: string;
  start: string;
  end: string;
  label: string;
  preset: string;
}
export interface PageResult<T> {
  rows: T[];
  count: number;
  page: number;
  pageSize: number;
}
export interface InventoryData {
  products: PageResult<Product>;
  categories: Category[];
  counts: { active: number; low: number; out: number };
  filters: { search: string; category: string; stock: string; sort: string; active: string };
}
export interface DashboardData {
  today: Report;
  week: Report;
  period: Report;
  range: DateRange;
  lowStock: Product[];
  lowStockCount: number;
  recentSales: Sale[];
}
export type ActionResult<T = Record<string, unknown>> =
  { ok: true; data: T } | { ok: false; error: string; fields?: Record<string, string[]> };
