# Database core

## Files and verification

- `supabase/migrations/202610280001_core.sql`: the base transactional PostgreSQL migration; no extensions and no demo/business seed records. `gen_random_uuid()` is PostgreSQL core. PostgreSQL 15+ is required for security-invoker views; the local Supabase configuration selects PostgreSQL 17.
- `supabase/migrations/202610280002_workflow_hardening.sql`: audited optimistic catalog revisions, original COGS retained for unsaleable returns, currency frozen once products exist, and no future-dated cash/expense postings.
- `tests/accounting-edges.test.ts`: nine additional SQL integration checks, including execution of the published read-only reconciliation SQL.
- `supabase/config.toml`: optional local Supabase configuration. Only `public` is exposed to PostgREST; `pos_private` is not exposed.
- `tests/helpers/database.ts`: isolated in-memory PostgreSQL engine, test-only `auth.users` / `auth.uid()` and `anon`, `authenticated`, `service_role` roles. Loads every `.sql` migration from disk in filename order. No production auth stubs are installed.
- `tests/database.test.ts`: real SQL integration tests, not repository/RPC mocks.

Run after installing the project's dependencies:

```sh
npx vitest run tests/database.test.ts
npx eslint tests/database.test.ts tests/helpers/database.ts
npx tsc --noEmit
```

The base database suite has **39 tests** (plus nine workflow-hardening/reconciliation SQL tests) covering rollback (including failure after history insertion), stock limits, receiving/unknown costs, import atomicity, payload validation, retries/changed-payload conflicts, snapshots, fractional and full returns, cumulative rounding, reversals, credit collections/refunds, reports, expenses, DST boundaries, tenant FKs, RLS, grants, and immutable histories. It also verifies that migrations start without business data. Test timestamp fixtures temporarily disable user triggers as the database owner; production RPCs never expose a posting-time override.

**PGlite executes PostgreSQL SQL in one in-memory session. These tests do not prove multi-session locking/concurrency, PostgREST integration, hosted Supabase Auth, a deployed migration, or backup/restore.** Use the optional independent-session plan below before production.

## Local / hosted application

With the Supabase CLI and Docker available:

```sh
supabase start
supabase db reset             # DESTRUCTIVE: local development database only
supabase status
```

Use the URL and publishable/anon key printed by the local stack in the application's environment. Email confirmation is enabled; the local inbox is normally at `http://localhost:54324`. Do not put a service-role/database-owner credential in browser or ordinary application code. For a hosted project, review/commit the migration, link the intended project, and apply it with the normal Supabase migration workflow. This deliverable has not connected to or modified a hosted project.

Running the migration on plain PostgreSQL requires the standard Supabase `auth.users(id uuid)` table, `auth.uid()` function, and `anon`/`authenticated` roles to already exist. The test helper creates a minimal equivalent only for isolated tests. Never install a `current_setting`-only auth shim in production: Supabase Auth/PostgREST must verify the JWT before assigning `auth.uid()`.

## Schema and authorization

Tables match `docs/api-contract.md`: shops, shop_memberships, categories, products, sales, sale_items, inventory_movements, payments, sale_adjustments, sale_adjustment_items, expenses, purchases, purchase_items, cashbook_entries, audit_records, idempotency_keys. All tenant links use composite `(shop_id, …)` FKs, including sale/item/adjustment relationships. Polymorphic inventory `reference_id` and cash `source_id` have corresponding typed FK columns and source-shape constraints; their tenant consistency is not left to an unchecked generic UUID.

Every table has RLS enabled and an authenticated-member SELECT policy. No INSERT/UPDATE/DELETE policies or direct table-write grants exist for `authenticated`/`anon`. `idempotency_keys` reads additionally require the same actor. `sales_ledger` and `sale_items_ledger` are SELECT-only `security_invoker=true` views, so a view-owner RLS bypass does not leak another shop's data. A shop member can read its financial history and audit trail; staff may perform ordinary POS/catalog operations. Settings changes and bootstrap ownership are owner-only. Membership invitations/removal are not public RPCs in this MVP.

Every public mutation is a narrowly scoped `SECURITY DEFINER` function with `search_path=''`, qualified application objects, and explicit `auth.uid()` / membership checks. Only the intended RPCs and `is_shop_member(uuid)` are executable by `authenticated`; anonymous execution is revoked. Private helpers are not callable by application roles. No dynamic client SQL or client-supplied actor/shop assertion is trusted. The migration owner remains a trusted administrator; an owner can deliberately disable triggers/RLS, which is not something application roles can do.

Triggers reject updates/deletes of posted sale items, adjustments, adjustment items, payments, movements, purchases, purchase items, cash entries, expenses and audit records. Sales permit only the constrained forward status transitions; all original sale fields stay immutable. Catalog edits and archiving never rewrite snapshots. Currency cannot change after any product, sale, purchase, cash entry, or expense; settings and all mutations use compatible shop-row locks to prevent a currency-change/posting race.

### Implemented RPCs

All contract RPCs are implemented with the exact parameter names and signatures: `create_shop`, `update_shop`, `create_category`, `save_product`, `import_products`, `receive_stock`, `adjust_stock`, `post_sale`, `collect_payment`, `return_sale`, `reverse_sale`, `record_expense`, `record_cash_movement`, and `report_shop`. Mutations return JSON containing at least `id`; sales also return `reference` and `total`. An invalid input raises a PostgreSQL exception rather than returning partial success.

Two additive read-side conveniences support the application queries without changing the contracted mutation payloads:

- `products.stock_status`: stored generated `out` (zero), `low` (positive and at/below threshold), or `in`, with a tenant/status index. It cannot be assigned by callers.
- `cashbook_totals(p_shop_id uuid, p_from timestamptz, p_to timestamptz)`: authenticated member-only aggregate `{inflow,outflow,net}` across **both** cash/digital methods in `[from,to)`, returned as decimal strings.

**Integration precision note:** RPC report/aggregate monetary fields are explicitly serialized as strings. For ordinary PostgREST table/view reads, request numerical fields using `::text` casts (particularly four-decimal `cost_price` / `unit_cost`, large aggregate costs, and summed quantities), or use a lossless JSON decoder. Calling `String(value)` _after_ a large JSON decimal has been parsed as a JavaScript Number cannot recover precision. Do not use JavaScript float summation. This matters near the permitted numeric bounds even if typical retail values are smaller.

## Validation and accounting conventions

SQL validates payloads independently of HTTP: required fields, strict object keys, arrays, booleans/UUIDs/text, enums, finite numerics, decimal scale, bounds, nonnegative/positive requirements, discounts, category/product/sale membership, available stock and returnable/collectable balances. Nullable nested fields must be explicit. Imports accept 1–500 rows, create categories atomically, and reject duplicate case-insensitive SKUs or duplicate barcodes; they never silently overwrite. Sales/returns accept 1–100 distinct product/line entries.

| Field                                     | Decimal places | Supported range                                                   |
| ----------------------------------------- | -------------: | ----------------------------------------------------------------- |
| Quantity / threshold / stock              |              3 | 0…999,999,999.999; posted quantities strictly positive            |
| Stock correction                          |              3 | signed, nonzero, absolute value ≤999,999,999.999                  |
| Unit cost                                 |              4 | 0…999,999,999,999.9999, or explicit null for unknown catalog cost |
| Price / discount / money per line or sale |              2 | 0…999,999,999,999.99                                              |
| Expense / collection / cash movement      |              2 | strictly positive, ≤999,999,999,999.99                            |

Cumulative adjustment header costs allow the sum of up to 100 full-range line costs. Numeric columns do not use coercing scale typmods; checks and RPC validation reject overprecision instead of silently rounding client input. Computed amounts round explicitly. Tiny/freely discounted sales can have a zero total, but no zero or negative receipt/cash entry is invented. Payment rows are signed: receipts/collections positive, refunds negative. Cash entries have a positive amount and explicit `in`/`out` direction. Stock histories have signed deltas, and damage/missing deltas must be negative.

Text limits match server forms: shop 2–120 characters; product 1–160; category 1–80; SKU/barcode ≤80; unit 1–24; supplier/customer/contact ≤160; optional notes ≤500; reasons/stock notes 3–500; expense/cash descriptions 3–240; expense category 1–80. Currency is checked against the supported ISO list; timezones must exist in PostgreSQL's timezone catalog. Date-only expenses/manual cash movements are posted at midnight of the selected shop-local date; their audit entry still has the actual posting time. Ordinary posting/return/reversal/collection/receiving events use database transaction time, never a client override.

### Idempotency and locks

Every mutation requires a UUID request key. Keys are unique by actor across operations/shops and additionally unique per shop across operators and bind the shop, operation, and canonical JSONB payload. Object key order is immaterial; equivalent SQL numeric arguments are canonical numeric values. A successful retry returns the **original stored response** before rechecking mutable stock/balance state. Changed payload, operation or target shop is a conflict. Different actors in different shops have independent namespaces. The integrated migration additionally makes request IDs unique within a shop across operators, so a persisted checkout cannot post twice after a login/operator change; a cross-actor replay conflicts without exposing the original actor’s private key payload.

The reservation and response commit in the same transaction as the business event. `INSERT … ON CONFLICT` plus a request-row lock serializes identical concurrent requests. Any exception, including late return/overflow/import failures, rolls back the reservation and every business/audit row; the failed key remains reusable. There is no exception-swallowing subtransaction that consumes a failed key. Keep successful keys with the financial history: deleting old keys weakens replay protection.

Bootstrap is the exception to preexisting membership: it requires a verified user, locks that existing `auth.users` row, rejects users who already belong to a shop, then creates the owner membership and completed key atomically. Bootstrap retries recheck that ownership still exists.

Product rows are locked in stable UUID order before multi-product sales/returns, and stock is checked while those locks are held. Collections, returns, and reversals lock the original sale row before computing balances/remaining quantities. All product stock changes and movement entries commit atomically. These locks are intended for PostgreSQL's default READ COMMITTED isolation; serialization/deadlock/transport failures must be retried using the same request key, never blindly converted into a new sale intent.

### Costs, returns and credit

- Sale gross per line is `round(quantity × unit_price, 2)`; flat line discount is subtracted after that rounding. SQL recalculates all totals.
- Sale items snapshot name, SKU, unit, category name, quantity, unit price, discount, line total, unit cost, and rounded cost total. Subsequent catalog edits do not affect history.
- Receiving records a purchase, purchase line, stock movement, and—only if paid—a supplier-payment cash outflow. The new average is `round((old_qty × old_cost + received_qty × incoming_cost) / new_qty, 4)`. If existing positive stock had unknown cost, the new cost **stays null**; unknown is not treated as zero. When old stock is zero, incoming cost establishes the new cost.
- Return amounts are allocated from immutable **rounded line totals/costs**, not from current price/cost. Each event is `round(original_amount × cumulative_returned_qty / original_qty, 2) − previously_returned_amount`. Discounts follow the same rule. Thus the final return exactly exhausts the original total, discount and cost, without accumulated rounding drift.
- Restocked units reenter weighted-average inventory at their original snapshot unit cost. Mixing unknown-cost stock retains unknown cost. `restock=false` changes no inventory. The integrated report model reverses prorated snapshot COGS only for restocked quantities. A non-restocked/unsaleable return retains its original sale cost as an expense in COGS, preventing a fictitious zero loss after a refund. Return rows still preserve the original prorated cost for audit; the report applies the disposition rule.
- Credit sales initially create revenue/receivables but **no cash entry**. Collections create payment/cash events but no new revenue. Returns reduce the sale's remaining net total first; refund is `max(net_money_paid − remaining_net_sale, 0)`. Unpaid credit produces no pretend refund. Collections cannot exceed the sale's remaining balance.
- Reversal is a new full adjustment/restock/refund event, only for an otherwise unreturned posted sale. If any return already exists, return the remaining items instead.
- `sales_ledger.collected_total` is signed net receipts after refunds; `units` is original sale quantity. `net_total` and `balance_due` reflect adjustments. A fully returned sale uses the available `refunded` payment-status label even if it was unpaid credit and no cash refund was due.

## Report semantics

`report_shop` verifies membership and accepts finite `[from,to)` timestamp bounds, at most 3,660 days. The application currently imposes a smaller calendar-date range. Only the required shop/time records are aggregated in SQL.

- Original-sale line events are positive at the original timestamp, **regardless of current sale status**. Return/reversal line events are negative at their own timestamps. No later status change erases a prior period.
- Revenue and units are net event sums. `sales_count` counts original sales in the interval, never subtracts a later return. `credit_sales` is net credit-sale revenue events, **not** current outstanding debt or collections.
- Known COGS are summed with event signs, with cost reversal only for restocked return quantities. `known_gross_profit` includes only known-cost events. `unknown_cost_lines` counts missing-cost event lines; any such event makes gross and estimated net profit null (conservatively, even if a full unknown-cost return cancels its sale in the same interval). Known COGS is a partial amount when costs are missing, not evidence that missing costs were zero.
- Expenses are operating expenses recorded in the interval. Estimated net profit is gross profit minus those expenses, or null if costs are incomplete. Purchases and owner movements are not silently double-counted as operating expenses.
- `cash_received`/`digital_received` include only positive sale/collection payments, not owner deposits. Refunds are a separate positive magnitude. `net_cash_movement` and `payment_methods` include **all** cashbook directions and both methods: purchases, expenses, refunds and owner movements included.
- Trend dates use the shop's current IANA timezone and are calendar-generated/zero-filled; DST 23/25-hour days do not become missing/duplicate dates. Bounds remain half-open UTC instants. Product/category grouping uses immutable snapshots; products sort by net revenue descending, and a product spanning renamed snapshots displays its latest event snapshot label. Categories remain grouped by snapshot category labels.

Useful indexes cover membership lookups, tenant category/SKU/barcode uniqueness, inventory/status/category filtering, sale/payment/adjustment/expense/purchase/cashbook timestamps and source/line lookups. Historical data has no destructive application delete path. Back up database **and** Auth/configuration through a supported Supabase process, store encrypted copies off-site, and practice restoration into a disposable project; no restore exercise has been run here.

## Optional real PostgreSQL independent-session concurrency plan

Use a **disposable local Supabase database**, never production. Use two separate `psql` connections (not one PGlite engine and not just `Promise.all` on a single connection). Create a real local Auth test user first and note its UUID. Connect with the local owner database URL printed by the Supabase CLI status command. Owner access here is only a test harness; application traffic must not use it.

### Setup

In a `psql` session, replace `USER_UUID` with that new user's UUID:

```sql
\set user_id USER_UUID
select set_config('request.jwt.claim.sub', :'user_id', false);
set role authenticated;
select public.create_shop('Concurrency QA','USD','UTC',gen_random_uuid())->>'id' as shop_id \gset
select public.save_product(:'shop_id',null,'{
  "name":"Concurrency QA item", "category_id":null, "sku":null, "barcode":null,
  "unit":"piece", "cost_price":"1.0000", "selling_price":"5.00",
  "opening_stock":"1.000", "low_stock_threshold":"0.000", "is_active":true
}'::jsonb,gen_random_uuid())->>'id' as product_id \gset
\echo :user_id :shop_id :product_id
```

These are explicit QA fixtures, not production migration seeds. Copy the resulting IDs into **both** test sessions using `\set user_id …`, `\set shop_id …`, and `\set product_id …`. Generate and record distinct UUID request keys before each scenario.

### Oversell race

Session A:

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', :'user_id', true);
select public.post_sale(:'shop_id',
  jsonb_build_array(jsonb_build_object('product_id',:'product_id','quantity','1.000','unit_price','5.00','discount','0.00')),
  'cash',null,null,null,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select pg_sleep(8); -- keeps the successful stock decrement uncommitted
commit;
```

While A sleeps, run the same block in session B with a **different** request UUID and no sleep. B must block until A commits, then fail with insufficient stock; `ROLLBACK` B's failed transaction. As owner, assert stock is zero, exactly one sale/payment/inflow/sale movement was posted for this fixture, inventory deltas reconcile, and B's request key does not exist. Do not accept two successes or negative stock.

### Required variants

Reset only by creating fresh QA fixture products/sales and use fresh request UUIDs:

1. **Same key / identical payload:** both sessions use the same key on a one-unit product; A sleeps before commit. B waits and returns A's exact response/id. Assert one sale, one stock decrement, one payment/inflow and one completed key.
2. **Same key / changed payload:** change B's quantity/note but reuse A's key. B waits, then gets the changed-payload conflict, with no second business event.
3. **Rollback and retry:** A executes the RPC then rolls back after sleeping. B waiting on the same key must proceed successfully after the rollback. A's rolled-back sale and reservation must not survive.
4. **Opposite input product order:** create two one-unit products. A submits `[B,A]`, B submits `[A,B]` under distinct keys. Stable UUID lock order must avoid the classic opposite-order deadlock; one succeeds and the other cannot oversell. Repeat under simultaneous starts, not only after A has already locked both.
5. **Collections:** create a credit sale of 10.00. A collects 6.00 and holds its transaction; B concurrently collects 6.00. B waits then rejects overcollection, leaving paid 6.00/due 4.00 and no failed key.
6. **Returns:** create a paid two-unit sale. A returns one unit while B returns two, or both request the final remaining unit. Only quantities available after the first commit may succeed; aggregate returned quantity, discounts, cost, refunds and restocking must stay bounded/exact.
7. **Return/reversal/collection races:** on a partly paid credit sale, run a collection against a reversal in separate sessions. Sale-row serialization must yield either a collection followed by its correct refund, or a reversed sale that rejects collection. No negative debt/over-refund. A prior committed partial return must make reversal fail.
8. **Currency settings race:** hold an ordinary financial mutation before commit, then attempt a changed-currency `update_shop` in the other session. It waits on the shop lock, then rejects once the financial event commits; no mixed-currency history or consumed failed key.

After each scenario, inspect `sales_ledger`, signed payments, inventory deltas, adjustment quantities, cash sources, audit rows and key counts as owner. Run the same tests through authenticated PostgREST as a separate integration check, including HTTP transport retries. Record actual server/version/connection results before claiming production concurrency verification. None of these independent-session or hosted checks were run by the PGlite suite.

## Integrated catalog revision and audit behavior

The public save_product wrapper accepts an optional product.expected_updated_at string and strips it before strict product-core validation. For existing products it locks the row and rejects a mismatched revision before changing any field; a failed revision check rolls back its idempotency reservation. The HTTP endpoint requires a revision for all edits/deactivations. Direct authorized RPC clients may omit the optional revision for an intentional overwrite. Successful catalog writes append before/after snapshots to audit_records. Idempotent retries return their original response before checking the now-changed revision. Receiving/stock changes update updated_at, so a stale name/deactivation form cannot roll the weighted cost backward.

Bootstrap HTTP requests carry an explicit create/update mode. A bootstrap retry remains create_shop even after the first attempt committed and membership now exists. SQL idempotency itself remains actor/shop/operation/payload bound.

## Review follow-up: mixed-return lock order

Migration 202610280003_locking_and_membership_revocation.sql locks every product referenced by a return, in UUID order, before inserting any adjustment item. This includes restock=false products: their foreign keys acquire KEY SHARE locks even though their stock does not change. Locking only the restocked subset could reverse the checkout lock order and produce a retryable deadlock. The integrated fix standardizes the complete lock set; non-restocked quantities still do not increase stock.

The regression suite tests mixed-disposition accounting/stock behavior and inspects the installed function definition to guard the complete ordered lock set. That structural check is not a two-session concurrency proof.

### Additional independent-session staging scenario

Use the disposable QA database and a known paid sale containing two products A and B, with A's UUID sorting before B's UUID. Both must have enough current stock for a new checkout. The return will select A with restock=false and B with restock=true.

1. In session A, as the trusted database test operator, BEGIN and SELECT the product A row FOR UPDATE. This is a deliberate test barrier corresponding to checkout's first lock, not an application-role grant.
2. In session B, under the ordinary authenticated owner's identity, begin/call return_sale for the mixed dispositions. Confirm it is waiting for A before proceeding. Do not commit or alter records administratively to force a success.
3. In session A's existing transaction, use the authenticated test identity and call post_sale for both products, then COMMIT. With the fix, B has not taken B out of order; checkout can acquire B and finish.
4. Session B then acquires A followed by B and completes its return. Assert no 40P01 cycle, nonnegative stock, correct movement/refund counts, no duplicate adjustments, exact cost dispositions, and reconciliation. Repeat with the API's normal transactions on staging.

The earlier subset-only implementation could let B lock product B and then wait on A's FK lock while checkout held A and waited on B. Do not claim this controlled two-session experiment was executed by the single-session PGlite tests.

## Review follow-up: revocable retained memberships

The same third migration adds is_active/revoked_at membership tombstones, active checks in both permission helpers, membership SHARE locks before mutations, and an owner-only idempotent revoke_staff RPC. The row stays in place for all historical actor FKs. Revoked callers see only their own membership tombstone and no shop records; they cannot replay old successful RPCs. The app explicitly blocks page/API access and does not send them back to shop onboarding. See docs/staff-access.md for safe operation and limitations. Invitation/role administration UI remains out of scope.
