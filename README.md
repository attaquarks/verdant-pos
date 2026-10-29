# Verdant POS

A focused POS and inventory workspace for a small retail shop. Register products once, sell in a few clicks, and keep stock, revenue, collections, and expenses separate and trustworthy.

**No AI is required or included.** There are no LLM SDKs, natural-language sales parsers, agents, barcode hardware integrations, branches, loyalty features, or general-ledger accounting modules.

## Status

Pre-production MVP. The source passes its local automated checks (see docs/verification.md). Cloud staging verification against a real Supabase project is in progress, and no production deployment exists yet. Without public Supabase configuration the application intentionally displays a setup screen, not invented shop metrics.

Before real shop records are entered, complete the staging acceptance gates in docs/testing.md.

## Stack

- Next.js 16.4.3, App Router, React 19.3.1, strict TypeScript.
- Supabase PostgreSQL and email/password authentication with SSR cookie refresh.
- Plain responsive CSS, centralized forest-green design tokens, and Lucide icons.
- Zod validation, decimal.js for previews, PostgreSQL numeric for the actual ledger.
- Vitest with a real in-memory PostgreSQL engine through PGlite; Playwright browser checks.
- Exact direct dependency versions and package-lock.json. Node 24 LTS is the supported runtime.

The stable TypeScript 6.0 line is pinned because the current stable TypeScript ESLint parser does not yet support TypeScript 7. ESLint 10 uses its current flat config and compatible plugins directly, avoiding incompatible legacy plugin peers. Runtime dependencies were resolved from the npm registry on October 28, 2026. Install with npm ci rather than resolving a new tree.

## Getting started on your machine

Requirements: Node 24, npm, a Supabase project (or the Supabase CLI and Docker for local Supabase), and an editor.

```sh
npm ci
cp .env.example .env.local
```

Set these values in .env.local or your deployment provider's protected environment editor:

| Variable                             | Purpose                                                                                                                                           |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| NEXT_PUBLIC_SUPABASE_URL             | Your Supabase project URL. HTTPS in production.                                                                                                   |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | The project's public publishable key, never a secret/service-role key. A legacy anon JWT key is also supported via NEXT_PUBLIC_SUPABASE_ANON_KEY. |
| APP_URL                              | Exact public origin, such as http://localhost:3000 locally or https://shop.example in production. Required for production mutation origin checks. |

No service-role key or database password is used by the web app. Build-time checks reject secret/service-role values before either public key variable can be bundled. Never add one to a NEXT_PUBLIC variable or commit any environment file. Do not paste credentials into chat.

### Apply the database migration

Use a fresh Supabase project. The migration expects the standard auth schema and anon/authenticated roles provided by Supabase. It installs public business tables, the private helper schema pos_private, RLS policies, indexes, views, RPCs, and immutable-history triggers. It inserts no production shop, product, or sale records.

With the Supabase CLI installed and authenticated on your machine:

```sh
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

Alternatively, open the SQL Editor in the correct Supabase project and execute the files in supabase/migrations in filename order. Do not run them over an unrelated existing database. The local testing shim in tests/helpers/database.ts is not a production migration and must never be run in Supabase.

For local Supabase, use supabase start and supabase db reset on an isolated development database. Reset deletes local data; do not use it on a working shop.

### Configure authentication

1. In Supabase Authentication, enable email/password sign-up and require email confirmation.
2. Set Site URL to APP_URL. Add the exact deployed /auth/callback URL to allowed redirect URLs. For local development add http://localhost:3000/auth/callback.
3. Password recovery uses /auth/callback?next=/reset-password; add that exact recovery redirect URL too. Use the equivalent HTTPS origin in production.
4. Use the standard PKCE confirmation flow. If customizing email templates, use a /auth/callback link with token_hash and the appropriate type, not a client-only session-fragment redirect. The callback supports both exchanged authorization codes and verified token hashes.
5. Set up production SMTP and verify confirmation and password-reset delivery before accepting real users.
6. Start the app, create an account, confirm the email, then create the shop. Choose its name, currency, and IANA timezone before entering products.

```sh
npm run dev
# Open http://localhost:3000
```

Public environment variables are compiled into the client build. Rebuild after changing them. No configured Supabase connection means /setup is shown intentionally.

## Daily workflows

- Inventory: searchable, paginated catalog, category/stock filters, sorting, active/inactive products, and CSV import/export.
- Products: name, optional SKU/barcode/category, unit, selling price, optional cost, opening stock, and low-stock threshold. Barcode values are typed or searched as text; no hardware integration is included.
- Sell: quick Sell per product or New sale for multiple lines. Quantity, actual price, flat line discount, and cash/digital/credit are checked before posting and recalculated in SQL. Alt+N opens a new sale.
- Receive stock: new purchase and inventory movement; update weighted-average cost; optionally record the supplier payment. An unpaid receipt does not invent an outflow.
- Adjust stock: counted corrections, damage, and missing stock with a required reason. These are not disguised sales.
- Sales: inspect immutable line values, record credit collections, return quantities with a restock disposition, or deliberately reverse an unreturned sale with a reason.
- Reports: today, Monday-start week, month-to-date, or custom dates up to 366 calendar days; trend and category charts, product tables, best sellers, expenses, and profit estimates.
- Cashbook: actual recorded cash/digital movements, including collections, refunds, supplier payments, operating expenses, and owner deposits/withdrawals.

## Integrity and report semantics

All writes use authenticated, member-checked database RPCs. Ordinary application roles have SELECT-only table access under RLS; no direct insert/update/delete policies. Each mutation uses a UUID idempotency key bound to the actor, shop, operation, and complete payload, with an additional shop-wide uniqueness guard against reposting after an operator change. Equal retries recover the original response; changed-payload reuse is rejected. Reservations and every stock/payment/history record roll back together on failure.

Product locks are acquired in deterministic UUID order. Collections, returns, and reversals also lock the sale. PostgreSQL constraints prevent negative stock. Historical name, category, SKU, unit, price, discount, and cost snapshots do not change when catalog values change. Production reads cast decimal columns to text in PostgREST, preserving precision before JavaScript parses the response.

Revenue is posted sales less return/reversal events dated in the period when they occur. Changing a sale's current status never erases its original revenue from earlier periods. Credit creates revenue and a receivable, not cash; collections add cash without adding revenue. Cash received and digital received mean positive sale/collection receipts; refunds are shown separately. Cashbook net movement includes all its inflows/outflows and is not a cash-on-hand balance or net profit.

Gross profit is net revenue less recorded cost of goods. Estimated net profit subtracts operating expenses, not supplier purchase payments or owner withdrawals. An unknown sale cost makes profit unavailable instead of pretending it was zero. Non-restocked returns retain their original COGS so refunding an unsaleable item does not erase its cost. Catalog edits use a checked revision to avoid overwriting a concurrent receipt’s weighted cost. These are management estimates, not a complete tax/accounting system; they exclude tax, depreciation, financing, and unrecorded inventory losses. See docs/database.md and docs/architecture.md for precise return and cost treatment.

All posting timestamps use timestamptz. Date inputs are interpreted in the shop's IANA timezone with half-open UTC bounds, including DST. Expenses and manual cash movements are dated at the start of the chosen shop day. The UI never uses hardcoded production business metrics.

## Commands

```sh
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm start
npm run test:e2e
```

The database tests exercise actual PostgreSQL SQL in PGlite, not mocked sale logic. PGlite is single-session: passing it does not prove multi-session lock behavior, real Supabase auth delivery, deployed RLS wiring, or production performance. Browser integration uses an explicitly local test-only Supabase protocol fixture; see docs/e2e-harness.md. Run the optional HTTPS concurrency smoke test against a disposable Supabase project before go-live; see docs/testing.md.

## Deployment

Deploy as a Node 24 Next.js application (for example on Vercel or another Next-compatible Node host), not a static HTML export.

1. Create a fresh isolated staging Supabase project and apply the migrations.
2. Configure authentication, SMTP, and exact redirect URLs for staging.
3. Set the three environment values in the deployment environment. Do not expose database passwords or secret keys.
4. Run npm ci and the full checks, then npm run build. The standard start command is npm start.
5. For a standalone Docker/node deployment, build with BUILD_STANDALONE=1 and copy .next/standalone, .next/static, and public into the expected output structure; run its server.js. See docs/deployment.md.
6. Verify account confirmation/reset, two-user data isolation, stock/sale/return/credit flows, CSV downloads, the optional concurrency smoke test, timezone boundaries, and a restore drill.
7. Configure backups and retention before using live records. See docs/backup-restore.md.

No hosting, domain, cloud project, or external repository was created by this local implementation. Deploying to a chosen destination requires that account/project to be connected or configured.

## Project map

```text
src/app/                 Server-rendered App Router pages and authenticated API boundaries
src/components/          Responsive client UI and focused workflow dialogs
src/lib/                 Auth, Supabase clients, validation, decimal/date/CSV helpers, queries
supabase/migrations/     Normalized schema, RLS, atomic RPCs, report aggregates
scripts/                 Explicit real-database integration checks
tests/                   Unit, SQL integrity, HTTP, and test-only browser integration
docs/                    Architecture, setup, verification, deployment, backup/restore
```

## Extension boundary

Later read-only sales briefs can consume the existing authenticated report output and append-only event histories without redesigning the ledger. No AI module, credentials, agent hooks, or background writer is included in this phase. Any future integration must not become a dependency of stock, posting, totals, or reporting correctness.

The app requires network access to its database; offline checkout/synchronization is not included. Expense and manual cash records are immutable after posting in this MVP; check them before confirmation. Supplier invoice balances and noncash inventory-loss valuation remain outside the management estimate.

## Security review revision

Apply all three migrations in filename order. If the first two were already applied to an isolated project, apply 202610280003_locking_and_membership_revocation.sql before deploying this revision. It preserves data while adding active membership state and consistent mixed-return locks.

Returns lock all referenced product rows, including items not restocked, before their foreign-key inserts. Staff can be offboarded without deleting their historical membership: an active-owner-only revoke_staff RPC appends an audit record, RLS immediately denies subsequent shop access, and the application shows a dedicated revoked-access screen. Self-service staff invitation/administration UI remains excluded; see docs/staff-access.md.
