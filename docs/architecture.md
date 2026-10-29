# Architecture and accounting boundaries

## Request flow

App Router Server Components verify the Supabase user, load the supported single shop membership, and query only that shop's records. The SSR proxy refreshes cookies; server authorization uses getUser(), never an unverified client session or a submitted shop ID. The login UI uses the public Supabase client. Secrets and service-role keys are not needed by this application.

Interactive dialogs send JSON to /api/actions/{action}. The route checks the exact Origin, bounded request bytes, the action's strict Zod schema, and the verified server session. It derives shop_id from membership and calls one PostgreSQL RPC. SQL rechecks auth and membership so bypassing the HTTP route does not bypass authorization. An HTTP success is returned only after the RPC has committed.

All table writes by ordinary application roles are revoked. Public read views use security_invoker=true; SELECT RLS remains active. SECURITY DEFINER RPCs have an empty search path, qualify every relation/helper, validate payloads, and restrict grants. Helpers live in pos_private, which must not be added to Supabase's exposed API schemas.

## Modules

- src/lib/auth.ts: verified session and shop context; redirects for pages, status errors for API routes.
- src/lib/validation.ts: strict action payloads, decimal precision/ranges, explicit dates/timezones, bounded imports.
- src/lib/data.ts: paginated SQL reads and aggregate RPC calls. Decimal columns are selected with ::text casts; casting after JSON.parse would be too late for high-precision costs.
- src/lib/money.ts: decimal.js preview arithmetic. Currency and quantity text use exact BigInt whole parts and decimal fractions. Number conversion is restricted to SVG chart coordinates/axis interpolation, never posting, ledger text, or report accounting.
- src/lib/dates.ts: calendar-date to half-open UTC bounds with IANA timezone/DST awareness.
- src/lib/csv.ts: bounded RFC 4180 parsing and spreadsheet-formula-safe export.
- src/components/: presentation and small workflow dialogs. No accounting authority lives in React state.
- supabase/migrations/: the normalized ledger and its transaction rules.

## Data relationships

shops owns memberships, categories, products, sales, purchases, expenses, and cashbook entries. Every business record is shop-scoped; composite foreign keys prevent a valid record ID from another shop being linked accidentally.

sale_items snapshots product name, category, SKU, unit, quantity, actual unit price, discount, line total, unit cost, and cost total. Product rows are not deleted; they can be deactivated. A price/name/cost edit cannot rewrite a posted line. Returns/reversals create sale_adjustments and sale_adjustment_items referencing the original line, and signed refund payments when appropriate.

inventory_movements is the stock audit trail. Products.current_stock is a locked transactional balance updated with its movements, not a value recomputed asynchronously. Opening, sale, receiving, correction, damage, missing, return, and reversal are distinct movement types. A non-restocked returned item remains in the return history but does not invent an increase in available stock.

purchases and purchase_items snapshot received quantities and costs. A paid receipt also creates a supplier outflow. Unpaid receipts intentionally do not implement a complete accounts-payable subsystem: subsequent supplier payments are explicit cashbook movements with a description, not invoice reconciliation or creditor balance tracking.

payments is the sale receivable ledger: sale receipts, later credit collections, and negative refunds. cashbook_entries records actual money movements with a positive amount and in/out direction. Every automated cashbook entry links to its payment, expense, or paid receipt. Owner deposits/withdrawals and manual supplier payments are deliberately separate types, not profit/revenue.

## Idempotency and locks

Cached replay responses are scoped to the authenticated actor. A second unique shop/request index also prevents a copied/persisted checkout from posting again after the operator changes; that cross-actor replay conflicts safely. Its stored shop, operation, and full JSONB payload must match on reuse. A unique reservation serializes concurrent identical requests. A successful retry returns the stored result before attempting stock work. A failing transaction rolls back the reservation and all associated changes; the key remains safe to retry.

Shop share locks on posting operations serialize against owner settings updates, preventing a currency change racing a transaction. Product rows are locked in ascending UUID order before multi-line sales or restocking returns. Existing sale rows are locked before credit collections, partial returns, and reversals, preventing overcollection/overreturn races. There is no eventual-consistency stock worker or client-only stock deduction.

## Decimals and rounding

Quantities support three decimal places, money two, and unit costs four. Inputs are validated before any implicit rounding. The database recalculates round(quantity * unit_price, 2) minus the flat line discount; a discount cannot exceed its rounded subtotal. Snapshot cost is round(quantity * unit_cost, 2). Totals are sums of validated lines. The application currently uses two money decimals even for currencies whose customary minor-unit conventions differ; choose a two-decimal operating currency for this MVP.

Receiving updates a four-decimal weighted-average unit cost when old positive stock has a known cost. If positive stock has unknown cost, a priced delivery does not make that unknown cost disappear. Receiving into zero stock establishes the delivery cost. Return restocking reintroduces the immutable original unit cost into the current weighted average, retaining unknown cost if either stock component is unknown.

Partial returns use rounded cumulative targets minus prior returned amounts. The last return exhausts the original line total, discount, and snapshot cost exactly; independently rounding every small return could lose cents. Refunds equal the net amount actually paid beyond the remaining net sale, never the original total of an unpaid credit sale. A sale with earlier returns must return the remaining quantities rather than also invoking full reversal.

## Reporting

PostgreSQL aggregates original sale-line events and negative return/reversal events in their own posting periods. It does not filter old sales out just because their current status changed. Calendar days are zero-filled in the configured timezone. Custom UI ranges cover at most 366 calendar days.

- Revenue: net sale-line event values, regardless of whether cash has been collected.
- Units: net quantities sold after return/reversal events in that period.
- Cash/digital received: positive sale receipts and collections by method in the period. Refunds are separate outflows.
- Credit sales: original credit-sale revenue less credit return adjustments in the period, not an outstanding-balance balance sheet.
- Cost of goods: recorded immutable sale costs, reversing them only when returned quantities are restocked; unsaleable returns retain their original COGS.
- Gross profit: revenue less recorded cost of goods, unavailable if the period includes unknown-cost events.
- Expenses: recorded operating expenses dated in the period.
- Estimated net profit: gross profit less operating expenses; not reduced a second time by stock purchase payments or owner withdrawals.
- Cashbook net: all recorded inflows less outflows (cash plus digital). Not a physical till count or balance brought forward.

The MVP does not provide taxes, formal general-ledger posting, depreciation, payments processing, supplier invoice reconciliation, opening cash balances, or inventory-loss valuation. Stock damage/missing corrections change quantity and audit history but are not automatically valued as operating expenses. Treat profit as an estimate and record any additional noncash adjustments in a proper accounting system.

## Pagination and exports

Inventory and transaction ledgers use 25-row server-side pages, stable secondary ID sorting, bounded text search, and database counts. Product search for a sale returns up to 25 active products; refine the query for larger catalogs. Movement details show the latest 200 events and clearly say so. Category selectors are intended for a small-shop catalog (up to 1,000 categories).

Exports page through at most 50,000 rows and fail explicitly if the selected result is larger; they never intentionally truncate a claimed complete export. They are operational exports, not transactionally consistent database snapshots during concurrent writes. Use a maintenance window for point-in-time reconciliation or a proper backup for recovery. Report CSV has a section column separating summary, daily, product, and category rows. Unknown profit/cost values export blank, not zero. Catalog export maps current_stock to opening_stock for importing into a fresh shop, not replaying history into the existing shop.

## Future extension

A later daily brief can read report_shop's typed report output and historical events as an isolated read-only consumer. It must never own or bypass stock mutations, numeric calculations, accounting dates, authorization, or transaction posting. No integration or AI runtime is installed in this MVP.

## Catalog edit concurrency

Product dialogs send the current expected_updated_at revision. SQL locks the product and rejects stale revisions before touching fields; successful retries still recover the cached result. This prevents a stale edit/deactivation form from undoing a newer receipt’s weighted cost or another operator’s price. Audit rows include before/after catalog snapshots. Bootstrap has an explicit create/update intent at the HTTP boundary, so a lost bootstrap response is recovered as the same operation even after membership exists.

## Revocation and complete return lock sets

Returns lock every referenced product, not only restocked goods, because adjustment-item foreign keys can take KEY SHARE product locks. That complete sorted lock set matches checkout's acquisition order. Membership rows are retained with active/revoked state; helpers require active membership, mutations share-lock it, and owner-only revocation updates the target plus audit atomically. A revoked user's valid Auth session cannot bypass SQL permissions, replay an old request, read shop records, or bootstrap another shop. Only their own tombstone is visible for the explicit access-revoked screen. See docs/staff-access.md. Independent-session race verification remains a staging gate.
