# Verdant POS — implementation plan

## Scope and environment

This is a new project authorized by the owner. The initial workspace was empty. No existing repository, hosted Supabase project, or deployment provider is connected. Build and verify locally; deliver a source archive and local Git commits. Do not claim that hosted authentication, database migrations, or production deployment have been exercised until those services are connected.

The application contains no AI, LLM, natural-language sales parsing, agents, or AI SDKs. It is a single-shop, single-currency retail MVP; authentication and shop membership isolate data. Multiple users can belong to a shop in the schema, but invitations and branch management are out of scope.

## Stages

1. Establish a current stable Next.js App Router application, TypeScript, centralized design tokens, responsive navigation, Supabase SSR authentication, and initial setup.
2. Implement PostgreSQL schema, RLS, append-only financial and stock histories, and validated database RPCs. All stock-affecting mutations must be atomic and idempotent.
3. Implement products, categories, paginated inventory, quick Sell, receiving, stock corrections, and movement history.
4. Implement a multi-line sale, immutable price and cost snapshots, transaction detail, audited partial returns, reversals, and credit collections.
5. Implement database-calculated dashboard and reports, cashbook, expenses, CSV import/export, and settings.
6. Verify SQL invariants, server validation, decimal arithmetic, timezone boundaries, CSV safety, authorization, type checking, linting, tests, and a production build.
7. Document local setup, environment variables, migrations, deployment, backup and restore, report semantics, and remaining infrastructure validation.

## Business decisions

- Amounts are PostgreSQL numeric values. JavaScript uses decimal.js for display previews only; the database recalculates every posted amount.
- Quantities allow three decimal places. Money has two decimal places; unit cost supports four decimal places. Currency is configured during shop creation and cannot change after financial activity.
- Every mutation carries a UUID idempotency key. A repeated key with a changed payload is rejected. Retrying a successful request returns the original result.
- Product rows are locked in stable UUID order before a sale. The database enforces nonnegative stock, including concurrent sales.
- Catalog edits never rewrite sale item name, category, SKU, price, discount, or cost snapshots.
- Receiving changes the current weighted-average cost when the previous cost is known. Unknown historical costs remain explicitly unknown; reports must not pretend a missing cost is zero profit.
- Posted sale and payment records are not deleted. Returns and reversals are new events dated when recorded. Earlier sales remain visible in their original period; return periods include the negative adjustment.
- Credit sales create revenue and receivables, not cash. Collections create cashbook entries, not new revenue.
- Reporting dates use the shop's IANA timezone and half-open UTC ranges. Weeks start on Monday. Cash movements and calculated profit are labeled separately.
- CSV imports are bounded and atomic. Exported text is escaped against spreadsheet formula injection.
- Production screens show truthful loading, setup, error, and empty states. There are no seeded demo business metrics in the production application.
