# Internal database and HTTP contract

All normalized tables use snake_case matching src/lib/types.ts. PostgreSQL numerics arrive as strings or safe numeric JSON values; the server normalizes numeric fields to strings. Do not sum money with JavaScript floats.

## Database

Tables: shops, shop_memberships, categories, products, sales, sale_items, inventory_movements, payments, sale_adjustments, sale_adjustment_items, expenses, purchases, purchase_items, cashbook_entries, audit_records, idempotency_keys.

Read views (security_invoker=true): sales_ledger (Sale type including computed balances and product_names), sale_items_ledger (SaleItem type including returned_quantity). Products expose category via categories relationship. All tables and views are shop-scoped under RLS; ordinary authenticated users cannot write tables directly. Membership column is shop_id; product current quantity column is current_stock. Payments use method, kind, signed amount. Cash entries use positive amount plus direction. Inventory movements use kind and signed quantity_delta.

Every mutation returns JSON with at least id. Require a logged-in shop member server-side and inside SQL. Member helper: is_shop_member(uuid). Owner-only settings and shop bootstrap are appropriate. Each RPC accepts p_request_id uuid and rejects changed-payload key reuse. RPCs:

- create_shop(p_name text, p_currency text, p_time_zone text, p_request_id uuid)
- update_shop(p_shop_id uuid, p_name text, p_currency text, p_time_zone text, p_request_id uuid)
- create_category(p_shop_id uuid, p_name text, p_request_id uuid)
- save_product(p_shop_id uuid, p_product_id uuid nullable, p_product jsonb, p_request_id uuid). Product payload matches ProductInput; opening_stock is only for new products. Optional expected_updated_at is stripped/checked by the public wrapper before the strict core validator; the HTTP boundary requires it for existing products so stale forms cannot overwrite received weighted costs or concurrent edits. The catalog audit entry includes before/after snapshots.
- import_products(p_shop_id uuid, p_products jsonb array, p_request_id uuid). Each row has ProductInput fields plus category_name instead of category_id; create categories atomically as needed. Reject duplicate SKUs/barcodes instead of silently overwriting. Maximum 500 rows.
- receive_stock(p_shop_id uuid, p_product_id uuid, p_quantity numeric, p_unit_cost numeric, p_supplier text nullable, p_payment_method text: cash/digital/unpaid, p_note text nullable, p_request_id uuid)
- adjust_stock(p_shop_id uuid, p_product_id uuid, p_quantity_delta numeric, p_kind text: correction/damage/missing, p_note text, p_request_id uuid). Damage/missing require negative deltas. Never use this as a sale/return.
- post_sale(p_shop_id uuid, p_items jsonb array of product_id/quantity/unit_price/discount, p_payment_method text: cash/digital/credit, p_customer_name text nullable, p_customer_contact text nullable, p_note text nullable, p_request_id uuid). Credit requires customer name. Reject duplicate product IDs and negative or overprecision amounts. Discounts are flat amounts per line, not percentages. Return id and reference.
- collect_payment(p_shop_id uuid, p_sale_id uuid, p_amount numeric, p_method text: cash/digital, p_note text nullable, p_request_id uuid). Reject overcollection.
- return_sale(p_shop_id uuid, p_sale_id uuid, p_items jsonb array of sale_item_id/quantity/restock boolean, p_reason text, p_refund_method text: cash/digital, p_request_id uuid). Refund only money paid beyond the remaining net sale; unpaid credit reduces the balance without pretending cash was paid. Pro-rate line discount and cost exactly, assigning rounding remainder on final return.
- reverse_sale(p_shop_id uuid, p_sale_id uuid, p_reason text, p_refund_method text: cash/digital, p_request_id uuid). Fully reverse an unreturned posted sale and restock original items. A sale with prior returns cannot use reversal; return the remaining items instead. All new events occur now.
- record_expense(p_shop_id uuid, p_description text, p_category text, p_amount numeric, p_method text: cash/digital, p_occurred_on date, p_request_id uuid)
- record_cash_movement(p_shop_id uuid, p_kind text: supplier_payment/owner_withdrawal/owner_deposit, p_description text, p_amount numeric, p_method text: cash/digital, p_occurred_on date, p_request_id uuid)
- report_shop(p_shop_id uuid, p_from timestamptz, p_to timestamptz) returns Report type. Use half-open [from,to) bounds. Revenue and units reflect posted sale events minus return/reversal events in their own periods, regardless of current sale status. original sale events are always included. Gross/net profit are null when cost is missing. Cash received is positive cash receipts (sales and collections), digital received likewise; refunds are separate positive refund amount. Net cash movement includes all cashbook methods and directions. Trend is calendar date in shop timezone with zero days filled. Products sorted by net revenue descending. Only aggregate required records in SQL.

## Server API

All POST /api/actions/{action} payloads include request_id and return {ok:true,data} or {ok:false,error,fields?}. The server obtains shop_id and user_id from the authenticated session; never trust a client shop id. HTTP errors use 400 validation, 401 unauthenticated, 403 forbidden, 409 business conflict, 500 generic failure. Supported actions and payloads:

- product: {product_id: uuid|null, product: ProductInput}
- category: {name}
- sale: {items: SaleLineInput[], payment_method, customer_name:null|string, customer_contact:null|string, note:null|string}
- receive: {product_id, quantity, unit_cost, supplier:null|string, payment_method:cash/digital/unpaid, note:null|string}
- adjust: {product_id, quantity_delta, kind:correction/damage/missing, note}
- collect: {sale_id, amount, method, note:null|string}
- return: {sale_id, items:[{sale_item_id,quantity,restock}], reason, refund_method}
- reverse: {sale_id, reason, refund_method}
- expense: {description,category,amount,method,occurred_on:YYYY-MM-DD}
- cash: {kind,description,amount,method,occurred_on:YYYY-MM-DD}
- shop: {mode:create|update,name,currency,time_zone}. Intent is explicit: retries of a committed bootstrap still call create_shop even though a membership now exists; they must not accidentally become settings updates.
- import: {csv: string}, maximum 500 rows, server-side CSV parsing and row validation.

GET /api/products?q=... returns {products:Product[]} (active products for sale/search, maximum 25). GET /api/products/{id}/movements returns {movements:InventoryMovement[]} newest first. GET /api/sales/{id} returns SaleDetail. GET /api/export?type=inventory|sales|report|cashbook|expenses&from=YYYY-MM-DD&to=YYYY-MM-DD returns safe CSV. Report exports respect the calendar dates in shop timezone. GET /api/template returns a header and blank template example guidance, not imported demo records.

## Client components expected

Server pages import:

- AppShell({shop,userEmail,lowStockCount,children}) from components/app-shell.tsx
- DashboardView({data,shop}) from components/dashboard-view.tsx
- InventoryView({data,shop}) from components/inventory-view.tsx
- SalesView({sales:PageResult<Sale>,shop,range:DateRange,filters:{search,method}}) from components/sales-view.tsx
- ReportsView({report,shop,range}) from components/reports-view.tsx
- CashbookView({entries:PageResult<CashEntry>,shop,range,totals:{inflow:string,outflow:string,net:string}}) from components/cashbook-view.tsx
- ExpensesView({expenses:PageResult<Expense>,shop,range,total:string}) from components/expenses-view.tsx
- SettingsView({shop,role}) from components/settings-view.tsx
- AuthView({mode:'login'|'reset'}) from components/auth-view.tsx
- OnboardingView() from components/onboarding-view.tsx
- SetupView() from components/setup-view.tsx
- PageError({message?,reset?}) from components/ui.tsx
- LoadingView() from components/ui.tsx

Forms call src/lib/client-api.ts (or fetch through useMutation helper in components). It exports mutate(action,payload,requestId):Promise<Record<string,unknown>>, getJSON<T>(url):Promise<T>. Keep requestId stable on network/HTTP retries and until payload changes; changed payload means new key. Use router.refresh after mutations and prevent duplicate submissions while pending. Persist pending intent in sessionStorage for sale submission if practical; never store passwords. Use src/lib/money.ts exports money(value,currency), quantity(value), lineTotal(qty,unitPrice,discount), stockStatus(product). Date display uses shop.time_zone. For auth import createBrowserSupabase from src/lib/supabase/client.ts and use real Supabase auth; do not show mock authenticated screens. Unconfigured applications redirect to /setup with instructions, not fake metrics.

Design: Verdant POS, small retail commerce console. User palette exactly in globals.css design tokens. White panels on #F7F8F6, #176B55 green, charcoal text, fine rules, compact metrics and tables, small consistent Lucide icons, restrained radius and shadows. No generic oversized admin header, gradients, decorative imagery, AI, or demo values. Desktop sidebar 224px; all seven required nav destinations; mobile menu; keyboard-accessible dialogs with focus return and escape. Inline feedback and explicit confirmation for destructive/reversal actions. Inventory supports product editor, Sell (multi-line shared sale dialog), Receive Stock, Adjust Stock, movement history, filters, category addition, CSV import/export. Empty states explain next action. Reports SVG charts must derive only from provided data. Generic empty chart states are fine.

## Integrated hardening

The second migration retains original COGS on non-restocked/unsaleable returns; only restocked costs reverse in reports. Catalog currency freezes as soon as a product or financial event exists. Future-dated cash/expense events are rejected both by the server and SQL. Existing-product HTTP updates require product.expected_updated_at (the current updated_at string). Product create may omit it; trusted direct RPC clients may omit a revision to intentionally overwrite catalog fields. No stock is editable through a product form. All numeric table reads use PostgREST ::text casts before JSON parsing. Report exports leave incomplete cost/profit blank and include unknown_cost_lines.

Request IDs are additionally unique per shop across operators. Reusing a persisted checkout key after an operator/session change conflicts safely rather than posting another sale; only the original actor can read/replay its cached response. Different shops retain independent UUID namespaces across different actors.

## Retained staff revocation

Membership includes is_active and revoked_at. Server context and all SQL permission helpers enforce active state; a revoked caller can select only their own membership tombstone. Protected pages redirect to /access-revoked, protected APIs reject 403 even for bootstrap, and historical actor FKs remain valid. Public revoke_staff(p_shop_id uuid,p_user_id uuid,p_reason text,p_request_id uuid) is an active-owner-only, idempotent administrative RPC. It refuses owner/self/cross-shop targets, appends audit, and retains membership/history. There is no team administration UI in this phase. Mutations share-lock active membership; revocation locks the target for update. Returns lock all referenced products in sorted UUID order, including non-restocked FK references. See docs/staff-access.md.
