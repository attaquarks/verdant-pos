# Testing and go-live acceptance

## Local automated checks

Use Node 24 and the committed lockfile:

```sh
npm ci
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
npm audit --audit-level=moderate
```

The final npm run build above deliberately restores the normal environment after browser tests. The browser runner temporarily builds against an isolated loopback fixture; its build must not be mistaken for a build configured for your real Supabase project. Deployment builds must receive your own public project URL/key and APP_URL.

### Unit and server-boundary tests

- Decimal previews use the exact database rounding order, including sub-cent quantities with discounts. Currency and quantity formatting use BigInt integer parts plus exact fractions so large reports do not lose visible cents/units.
- Input schemas reject invalid/overprecise amounts, negative or zero sale quantities, duplicate products, excessive discounts, unknown fields, forged shop IDs, invalid dates/timezones/currencies, and unsafe update intents.
- HTTP tests cover verified authentication, same-origin JSON-only mutations, streamed byte limits, safe error handling, a confirmed result before success, and explicit bootstrap retry intent after membership has been created.
- CSV tests cover BOM/CRLF, quotes/commas/newlines, preserved string SKUs, malformed rows, bounded imports, formula-safe export, honest incomplete-cost fields, and explicit date-range rejection.
- Public configuration tests reject secret/service-role keys and insecure remote URLs.

### Real SQL integrity tests

The database suites run the actual migration files in PGlite, a PostgreSQL engine compiled to WebAssembly. The test-only auth shim supplies verified fixture identities and ordinary database roles; SQL is not replaced with JavaScript business logic.

Coverage includes atomic multi-line rollback, negative/upper stock boundaries, strict nested payload checks, category/SKU/tenant constraints, receiving/weighted costs, unknown costs, imports, exact-once requests, changed-payload conflicts, cross-operator duplicate prevention, historical price/name/category/cost snapshots, fractional returns and cumulative rounding, restocked versus unsaleable COGS, reversals, credit collections/overcollection/refunds, expense/cash separation, report dates/DST, RLS/grants/private helpers, immutable history, stale catalog revisions, and execution of scripts/reconcile.sql.

PGlite uses one in-memory SQL session. Neither Promise.all against it nor the fixture adapter proves independent-session PostgreSQL concurrency. It also does not prove hosted GoTrue, real PostgREST behavior, SMTP delivery, deployment security configuration, or a backup restore. Those remain staging gates below.

### Production-browser tests

npm run test:e2e starts the loopback fixture, performs a production Next build with explicit synthetic test configuration, and launches the production server. It uses one Chromium worker. On Linux, @sparticuz/chromium supplies the bundled browser; on another development OS install Playwright's Chromium on that machine or provide PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH.

The tests exercise the real React forms, SSR cookie clients, Next API routes, SQL RPCs, and RLS. The local HTTP compatibility fixture is not real GoTrue/PostgREST and is never imported by production code. See docs/e2e-harness.md.

Twelve browser cases cover login/logout and session persistence; inventory search/category/stock filters and history; product creation; quick sale plus identical HTTP replay; client and stale-server oversell rejection; credit sale/collection without doubled revenue; all seven destinations and reports; mobile menu/focus/Escape/overflow; first-shop onboarding in a browser timezone different from the server; receiving/damage/return/expense/CSV reconciliation; and desktop/mobile screenshots with automated WCAG 2 A/AA and 2.1 A/AA checks on the tested states. Automated accessibility checks are not a complete human accessibility certification.

Screenshots in artifacts/screenshots are explicitly synthetic SQL fixture records, not production shop metrics. Nothing is seeded in production migrations.

## Optional real Supabase HTTPS concurrency smoke test

Run only against a disposable staging project and a test account that has completed shop onboarding. It deliberately leaves tiny synthetic products/sales in that isolated shop so their audit history remains inspectable. It never deletes financial rows.

Provide these values through your own secure local/CI environment, not in chat or Git:

- SUPABASE_TEST_URL
- SUPABASE_TEST_PUBLISHABLE_KEY (public publishable/anon key, never service role)
- SUPABASE_TEST_EMAIL
- SUPABASE_TEST_PASSWORD
- POS_CONCURRENCY_TEST_CONFIRM=isolated-test-shop

```sh
npm run test:concurrency
```

The script launches two competing one-unit sales and eight simultaneous identical requests over HTTPS. It asserts exactly one competing success, no negative stock, one sale ID across all retries, and one sale movement/line. This script was delivered but not run against a hosted service because no Supabase project/account is connected.

For independent SQL-session variants including collections, returns, rollback, opposite product orders, and currency races, follow the explicit two-connection plan in docs/database.md. Record real results before claiming production concurrency verification.

## Staging acceptance matrix

Use a separate staging database, not a shop's live records. Do not install tests/helpers/database.ts or the loopback fixture in Supabase.

| Scenario                                   | Expected outcome                                                                                                                       |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Signup, confirmation and recovery          | Real emails arrive; codes/token hashes exchange on the configured callback; expired links show a safe error.                           |
| Unauthenticated access                     | Protected pages redirect to login; APIs return 401 and no shop data.                                                                   |
| Two independent shops                      | Neither can select the other's data, link cross-shop records, or call its RPCs. Verify through actual Data API, not only UI.           |
| Staff versus owner                         | Staff can operate the POS; only an owner can change settings. Self-service invitations are not part of the MVP.                        |
| Product creation                           | Category, SKU/unit/prices and opening movement persist; refreshed inventory matches stock.                                             |
| Quick cash and multi-line digital sales    | Actual prices/discounts and costs snapshot; one atomic sale, lines, payments and movements; stock decreases once.                      |
| Retry / changed payload / changed operator | Identical same-operator retry recovers the first result; changed payload or cross-operator reuse conflicts without a second deduction. |
| Simultaneous final-unit sales              | At most one commits. The rejected transaction creates no partial rows or consumed failed key.                                          |
| Receiving and stale edit                   | Purchase/movement/outflow are distinct; weighted cost updates; a stale edit/deactivation cannot overwrite it.                          |
| Partial/final returns                      | Exact original discounts/cost allocations; no overreturn; refunds limited to actual overpayment; restock disposition reflected.        |
| Non-restocked return                       | Revenue reduces but original COGS is retained; an unsaleable refunded item does not become a fictitious zero loss.                     |
| Full reversal                              | Original sale retained; one adjustment/refund/restock; no second reversal and no reversal after earlier returns.                       |
| Credit and collections                     | Credit revenue creates no receipt; later collections reduce debt and add cash without adding sales revenue.                            |
| Prices renamed/repriced                    | Old sale references, names, categories, prices, discounts and costs stay readable and unchanged.                                       |
| Costs missing                              | Gross/net profit unavailable, not zero; CSV preserves the missing-cost distinction.                                                    |
| Expenses, purchases and owner money        | Operating expense reduces profit; supplier payments/withdrawals are cash movements, not duplicate expenses or sales.                   |
| Timezone / DST / week/month boundary       | Shop-local dates use correct half-open UTC boundaries; Monday weeks and month-to-date agree with known events.                         |
| CSV import / export                        | Validated bounded all-or-nothing import; no silent overwrite; formula-safe exports; no silent row truncation.                          |
| Mobile / keyboard                          | Core screens usable at 390px; menus/dialogs accessible, focus returns, no page overflow; test longer names/references too.             |
| Recovery                                   | Perform an isolated full backup restore and run scripts/reconcile.sql, RLS checks, known report comparisons and idempotency replay.    |

## Deliberate operational boundaries

The app needs network connectivity to its database and does not provide offline sales sync, taxes, terminal payment processing, supplier invoice balances, physical drawer reconciliation, multi-branch access, or a full accounting ledger. Recorded expense/manual cash entries are immutable after posting in this MVP. Confirm amounts and dates before recording; do not silently edit the underlying database to make corrections. Future corrections need an explicit append-only adjustment workflow, not deletion.

## Review regression additions

Eight tests in locking-and-revocation.test.ts cover the complete mixed-return lock set, mixed stock/COGS behavior, membership lock definitions, retained staff histories, RLS revocation/read-only tombstones, owner-only/idempotent offboarding, state constraints and private helper grants. Four auth-context tests additionally cover active/revoked/new-user routing and revocation between membership and shop reads. revocation.spec.ts exercises a staff account through actual Next pages/APIs and the isolated direct Data API before/after an owner-authorized revoke. It verifies retained activity and automated accessibility of the revoked screen. The complete unit/API/SQL total is now 116; browser total 12. These do not replace the newly documented mixed-disposition two-session staging scenario.
