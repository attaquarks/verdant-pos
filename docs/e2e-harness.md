# Local browser / real-SQL integration harness (TEST ONLY)

This harness lets the **actual Next pages, forms, API routes, auth helpers, and Supabase SDKs** run locally without a hosted Supabase project. It lives entirely in `tests/e2e/`; production code must never import it.

## What this does — and does not — test

- `fixture-server.ts` binds **only `127.0.0.1:54321`**. It refuses `NODE_ENV=production`, non-fixture Host headers, foreign browser origins, and wrong API keys. It does not connect to any hosted service or download a browser.
- It creates **one fresh in-memory PGlite database at startup** using `createDatabase()` from `tests/helpers/database.ts`: the existing minimal `auth.users` / `auth.uid()` test shim and **all real migration files in filename order**. No alternative test schema or edited migrations.
- Synthetic auth users are inserted into that shim administratively. Shops, categories, products, opening movements, and seeded cash/credit sales are created through the **real application SQL RPCs** as the relevant authenticated fixture user. No production/demo data is loaded.
- HTTP table reads execute as the real `authenticated` role with the authenticated fixture user's transaction-local JWT claims / `auth.uid()`. Category subqueries and security-invoker ledger views retain the real grants and RLS. The second fixture shop is intentionally invisible to the owner.
- RPC names, argument names, and SQL casts are explicitly allowlisted. Calls use SQL **named arguments**, bound values, and the existing transactional `asUser()` helper. Failed calls roll back the event writes **and** any idempotency reservation. Database work/reset is queued to avoid claims or role leakage between concurrent HTTP requests.
- Auth is a **small test compatibility adapter, not real GoTrue**. PostgREST wire handling is a **small test compatibility adapter, not real PostgREST**. The harness does **not** establish production GoTrue security, real email/password hashing, email confirmation/recovery, OAuth, MFA, JWKS, production key rotation, hosted JWT verification, HTTP protocol completeness, deployment configuration, or network/database concurrency correctness. Existing SQL tests / a real Supabase environment remain necessary for those concerns.
- No auth bypass, fake metrics, alternate data implementation, test-only application route, or production environment flag is added to `src/`. Next still calls its normal `createBrowserSupabase`, proxy, `getUser`, `requireShop`, read queries, and API action handlers.

## Explicit local values

These are **public synthetic fixtures, never real credentials or secrets**. Do not point these clients at a hosted project.

| Setting                            | Local fixture value                     |
| ---------------------------------- | --------------------------------------- |
| App origin                         | `http://127.0.0.1:3000`                 |
| Supabase-compatible fixture origin | `http://127.0.0.1:54321`                |
| Publishable key                    | `sb_publishable_verdant_e2e_local_only` |
| Owner email                        | `owner@verdant-fixture.test`            |
| Owner password                     | `Verdant-fixture-owner-2026!`           |
| Other-shop email                   | `other@verdant-fixture.test`            |
| Other-shop password                | `Verdant-fixture-other-2026!`           |
| No-shop email                      | `outsider@verdant-fixture.test`         |
| No-shop password                   | `Verdant-fixture-outsider-2026!`        |

The token endpoint accepts **only these exact credential pairs**. It returns a normal-shaped user/session with a one-hour HS256 synthetic JWT (`sub`, `aud`, `role`, `exp`, `iss`, `session_id`, etc.) and a process-local refresh token. A public, clearly test-only signing constant is used. The server accepts only unexpired tokens actually issued by this process; it never trusts an arbitrary caller's JWT claims. Refresh rotates the local session; sign-out invalidates it.

The **real `@supabase/ssr` browser client**, not the fixture server, writes the normal Supabase auth cookie(s) for the Next origin. The real SSR client reads them and calls the fixture's `GET /auth/v1/user`. Reloading a signed-in page therefore exercises the normal application cookie → server `getUser` → membership → shop path.

## Launch

The root playwright.config.ts is already configured for one Chromium worker and two local web servers. The standard command automatically builds and starts the production Next application with explicit synthetic public configuration, starts/stops the fixture, and runs all twelve browser cases:

```sh
npm run test:e2e
```

Linux uses the bundled @sparticuz/chromium development dependency. Other operating systems can use a locally installed Playwright Chromium or PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH. Runtime application builds do not import the fixture or browser dependencies. Rebuild with your normal environment after browser testing; never deploy a fixture-configured build as your real shop application.

For manual debugging only, from the project root:

```sh
NODE_ENV=test ./node_modules/.bin/tsx tests/e2e/fixture-server.ts
```

Wait until this returns 200:

```sh
curl --fail http://127.0.0.1:54321/__fixture/ready
```

Run Next in a **separate process**, with these values present when Next starts (and at build time if testing a production build):

```sh
NEXT_TELEMETRY_DISABLED=1 \
APP_URL=http://127.0.0.1:3000 \
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_verdant_e2e_local_only \
./node_modules/.bin/next dev --hostname 127.0.0.1 --port 3000
```

Do not use `localhost` in some places and `127.0.0.1` in others: origins, cookie scope, the app's mutation-origin check, and the fixture CORS allowlist must agree. `APP_URL` must match exactly.

Keep **one Chromium project** and **workers: 1** for this shared in-memory fixture. The supplied configuration sets NODE_ENV=test only on the fixture, even while Next runs in production mode. To run only the baseline cases:

```sh
./node_modules/.bin/playwright test tests/e2e/verdant.spec.ts --workers=1
```

The spec uses absolute local URLs, not an externally supplied base URL. It blocks and records unexpected external browser HTTP requests. It does **not** mock successful browser/API responses. Run it against the actual Next app. Dashboard lives at the root route /. An application exception or unexpected server error is a failure to fix, not a successful response to fake in the harness.

## Adapter self-check (no browser or Next needed)

With the fixture server running:

```sh
./node_modules/.bin/tsx tests/e2e/verify-fixture.ts
```

This validates bad/good explicit credentials, a normal SDK session and user, the **actual `@supabase/ssr` cookie serializer/deserializer round trip**, read filters, range/count/head/single handling, embedded category, second-shop RLS, rejection of unsupported grammar/writes/forged tokens, named RPC arguments independent of JSON key order, exact retry idempotency, oversell rollback, report output, refresh, and sign-out. It resets before and after; do not run it alongside browser tests or manual work.

## Initial data / state controls

Owner shop: **Verdant Fixture Shop**, USD, UTC; category: **Fixture Pantry**. Every reset generates fresh business UUIDs; use the returned state rather than hard-coding IDs.

| Product                                | Opening stock |      Seeded sale | Current stock |
| -------------------------------------- | ------------: | ---------------: | ------------: |
| Fixture Rice (`FIX-RICE`, $5.00)       |            12 |   Cash sale of 2 |        **10** |
| Fixture Soap (`FIX-SOAP`, $3.50)       |             3 |             None |    **3**, low |
| Fixture Empty Jar (`FIX-EMPTY`, $1.00) |             0 |             None |    **0**, out |
| Fixture Tea (`FIX-TEA`, $7.00)         |             8 | Credit sale of 1 |         **7** |

Baseline revenue is **$17.00**; cash received **$10.00**; unpaid credit **$7.00**. A separate owner/shop has `Other Shop Secret Product` (999 units), excluded by the real RLS from the primary owner.

Only the loopback fixture server has these endpoints; **none is an application route**:

- `GET /__fixture/ready`: readiness after migrations and seed finish.
- `POST /__fixture/reset`: truncate the synthetic dataset, re-seed through RPCs, clear all local sessions and call counters. Reuses the same PGlite WASM instance rather than allocating a new instance per test. Schema/migrations are reloaded only on a new process.
- `GET /__fixture/state`: owner-authenticated SQL snapshots of products, sales, and ledger/idempotency row counts, plus fixture IDs and bounded aggregate call counters. No tokens/passwords are returned.

`reset` and `state` require the explicit local control header:

```sh
curl --fail -X POST -H 'x-verdant-fixture: local-tests-only' \
  http://127.0.0.1:54321/__fixture/reset
curl --fail -H 'x-verdant-fixture: local-tests-only' \
  http://127.0.0.1:54321/__fixture/state
```

This header is a local accident-prevention convention, **not a production security boundary**. Reset logs out all open test browser sessions. Each Playwright test resets and signs in independently. The single spec explicitly uses default sequential mode even if a custom configuration enables `fullyParallel`; do not add a parallel project or run multiple suites against this one shared fixture.

## Ready browser cases

`tests/e2e/verdant.spec.ts` contains eight tests:

1. Unauthenticated inventory redirects; bad credentials reject; valid real-form sign-in sets SDK cookies; SSR reload works; sign-out revokes access.
2. Real opening-minus-sale stock, categories embedding, second-shop invisibility, low/out/category filters, SKU search, and stock history; Escape returns focus.
3. Add product through the actual form → Next `/api/actions/product` → `save_product`; verify stock/movement/category in SQL state.
4. Inventory quick cash sale reduces stock exactly once. Replay the identical successful Next HTTP payload/request ID and verify the original response and unchanged event counts/stock.
5. Client oversell marks the quantity invalid; a direct authenticated Next API oversell rejects and rolls back. A competing sale then makes an otherwise valid open dialog stale; SQL rejects that submission and the UI surfaces the stock error without another ledger event.
6. New credit sale creates receivable but no receipt; collect digitally from sale details; verify balance/cashbook and unchanged sales/stock. Reports show $31 revenue, not $45 after collection.
7. All seven navigation destinations and seeded SQL report aggregates ($17 baseline).
8. 390px touch viewport: mobile menu destinations, menu closes on navigation, editor focus/Escape/return, and no horizontal page overflow.

Every baseline case checks **no unhandled page errors, no HTTP 5xx, and no external browser HTTP requests**. Expected business rejection statuses (409) are deliberately asserted, not hidden. Console warnings and full production auth semantics are outside this assertion.

## Deliberately supported HTTP subset

- Auth: `POST /auth/v1/token?grant_type=password|refresh_token`, `GET /auth/v1/user`, `POST /auth/v1/logout`, plus CORS OPTIONS for the one app origin. Signup, email/recovery, user updates, OAuth, MFA, and administrative auth APIs reject rather than pretending to work.
- GET/HEAD tables/views: `shops`, `shop_memberships`, `categories`, `products`, `sales_ledger`, `sale_items_ledger`, `inventory_movements`, `payments`, `sale_adjustments`, `cashbook_entries`, `expenses`. Public schema only; **no direct writes**.
- Selection: `*`, actual allowlisted columns, or their explicit `::text` casts; only `products` supports the app's exact `category:categories(id,shop_id,name)` embedding. Numerics are emitted as exact decimal strings; no JS float arithmetic is used for business calculations.
- Filters: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, a constrained `in.(...)` list, `is.null|true|false`, and the app's parenthesized `or=(column.ilike.pattern,...)`. Standalone `like/ilike`, `and`, `not`, nested logical expressions, arbitrary aliases/embeddings or casts other than the permitted ::text, escaped/nested lists, and all unknown columns/operators reject with 400.
- Ordering: allowlisted columns, asc/desc, optional nullsfirst/nullslast. Pagination: bounded `limit`/`offset` (SDK `.range()`), or bounded `Range`/`Range-Unit: items` headers, up to 1,000 returned rows. Exact counts via `Prefer: count=exact` / `Content-Range`; HEAD emits no body. Supports the singular object media type and PGRST116 cardinality errors so the SDK's `.single()` / `.maybeSingle()` work. No claim of complete PostgREST range/count semantics.
- POST RPCs: application mutation functions plus `report_shop` and `cashbook_totals`, using the explicit signatures in `fixture-server.ts`; unsupported names, schemas, query parameters, and argument sets reject.

SQL identifiers are selected only from the table/function allowlists and migration-derived column metadata. User values always use bound PostgreSQL parameters. This is deliberately not a general SQL endpoint or general Supabase emulator.

## Resources and shutdown

One in-memory database is shared per process; requests serialize real SQL transactions. Reset truncates/reuses the instance. Session entries are capped at 100 and cleared on reset; expired entries are pruned when issuing another session. Request bodies are capped at 600 KB, URLs/ranges are bounded, and no unbounded request log is kept. These limits suit local tests, not hostile traffic.

SIGINT/SIGTERM stop the HTTP listener, close lingering connections after a short grace period, drain database work, and close PGlite; the CLI has a final shutdown deadline. Process exit drops all data. There are no external processes, persistent database directories, scheduled jobs, or downloads to clean up. A second fixture server intentionally fails with EADDRINUSE instead of silently selecting another port.

## Additional integrated browser cases

- accessibility.spec.ts scans login, all seven operational screens, quick sale and mobile inventory against automated WCAG 2/2.1 A/AA rules and saves desktop/mobile screenshots using only SQL fixture records. This is not complete human accessibility certification.
- onboarding.spec.ts signs in the no-shop user in an Asia/Karachi browser timezone, creates a real shop through the app, adds a category/product, records the first sale and checks timezone-aware revenue/profit. This also guards server/browser timezone hydration.
- operations.spec.ts receives stock, records damage, sells and restocks a return, imports/exports CSV, records an expense and checks reports/cashbook reconciliation through the actual interface.

The complete configured suite has twelve browser tests. See docs/verification.md for executed results; this harness does not replace the real hosted-auth, PostgREST, independent-session concurrency or backup/restore staging gates.

The synthetic staff@verdant-fixture.test account (password Verdant-fixture-staff-2026!) belongs to the primary fixture shop. revocation.spec.ts records staff activity, authenticates the owner through the SDK, invokes the real revoke_staff RPC, and verifies the existing staff session loses page/API/direct Data API access while history remains. The fixture includes this one additional allowed RPC, not an Auth-administration bypass.
