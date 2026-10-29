# Verification record

Verified locally on October 28, 2026. This is a source MVP and an isolated test run, not a claim of a connected production deployment.

## Executed results

| Check                                | Result                                                                                                                                                                                                                                                      |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dependency installation              | npm ci succeeded from the committed dependency tree; the final tree was also installed/validated after the formatting tool was added.                                                                                                                       |
| Dependency compatibility             | npm ls passed with no invalid or unmet peers. Node 24.22.1 / npm 11.19.1 used.                                                                                                                                                                              |
| Formatting                           | npm run format:check passed.                                                                                                                                                                                                                                |
| Lint                                 | npm run lint passed, with zero warnings permitted.                                                                                                                                                                                                          |
| Strict TypeScript                    | npm run typecheck passed.                                                                                                                                                                                                                                   |
| Unit / API / SQL                     | 116 tests passed in 12 files; the SQL suites execute all three migrations, with additional complete-return-lock and retained-revocation regressions plus server auth-race tests.                                                                            |
| Browser integration                  | 12 production-browser tests passed with one Chromium worker. Final complete run: 12 passed in approximately 2.5 minutes, including staff offboarding and direct/API/page access denial.                                                                     |
| Accessibility                        | Automated WCAG 2/2.1 A/AA scans reported zero violations on the tested states, including the quick-sale dialog, mobile inventory and new-shop onboarding. Keyboard focus/Escape/mobile navigation are also exercised. This is not full human certification. |
| Isolated SDK/HTTP fixture self-check | Passed real SDK sign-in/session-cookie round trip, role-scoped reads, safe query grammar, RLS, named SQL RPCs, retry/rollback, report, refresh and sign-out.                                                                                                |
| Production build                     | npm run build succeeded on Next.js 16.4.3. Rebuilt with normal/unconfigured public environment after the fixture-configured browser build.                                                                                                                  |
| Dependency audit                     | npm audit --audit-level=moderate reported 0 vulnerabilities for the full dependency tree.                                                                                                                                                                   |

Runtime versions include Next.js 16.4.3, React 19.3.1, Supabase JS 2.118.0 / SSR 0.12.7 and Zod 4.6.7. Exact direct versions and package-lock.json are included. TypeScript 6.0.3 is the current compatible stable line for the pinned TypeScript ESLint parser; TypeScript 7 is intentionally not forced through unsupported peers.

## Integrity details actually checked

- A repeated successful sale request returns the same sale and deducts stock only once.
- The same shop/request ID cannot post again if a different operator retries a persisted checkout; the replay conflicts without another deduction.
- Failed multi-line sales, imports and returns roll back all writes and their idempotency reservation.
- Stock limits and decimal precision are enforced in SQL, not just the browser.
- Historical price, discount, product/category/name/unit/SKU and cost snapshots survive catalog edits.
- Partial returns exhaust original rounded totals/costs exactly. Refunds are limited to money genuinely paid beyond remaining value.
- Unsaleable, non-restocked refunds retain original COGS instead of erasing the loss.
- Credit collections create receipts, not additional revenue. Supplier/owner movements are not confused with operating profit.
- Unknown costs keep profit unavailable and report CSV fields blank/flagged, not fictitiously zero.
- Stale product edits/deactivation cannot overwrite a concurrent receipt's weighted cost; audit rows preserve before/after values.
- Bootstrap retry intent stays create_shop after membership has been created, recovering a lost original response safely.
- Public key guards reject secret/service-role values before Next can inline them into a client bundle, including an unsafe fallback key.
- Exact decimal formatting preserves cents/quantities even for aggregates beyond JavaScript's safe-integer display range.
- Shop-local calendar bounds, Monday weeks, DST changes and half-open reporting intervals are covered.
- Real database-role RLS, tenant composite FKs, read-only table grants, inaccessible private helpers and immutable histories are covered in the isolated SQL engine.

The browser suite uses the actual Next forms, auth clients, server routes and SQL functions. The HTTP authentication/Data API compatibility service is explicitly test-only and loopback-only; it is not a replacement for hosted Supabase Auth/PostgREST. Screenshots contain synthetic SQL fixture records only. Production migrations insert no shop/product/sale seed records.

## Not executed / go-live gates

The following require the owner's actual isolated infrastructure and were not performed:

- Opening a PR, provisioning production resources, or deploying a public site. A public GitHub repository and a Supabase staging project now exist; their verification is recorded separately once complete.
- A local Supabase stack through the CLI (Docker is unavailable in this build environment). A hosted Supabase staging project was used instead; see the cloud staging record below.
- Real GoTrue/PostgREST integration, email confirmation/reset delivery, SMTP configuration, provider rate limits, password hashing, JWT verification/key rotation or production auth redirect configuration.
- Independent-session PostgreSQL concurrency tests. The SQL locks and constraints are implemented, but PGlite and the local HTTP fixture serialize database work. Run scripts/test-concurrency.ts over HTTPS on a disposable Supabase shop and the two-session variants in docs/database.md before live trading.
- A managed/logical backup and restore drill. Provider-grounded instructions and read-only reconciliation SQL are delivered; a live restore is not claimed.
- Building/running the optional Docker image, production load tests, or Safari/Firefox/manual assistive-technology certification.

These are deployment acceptance steps, not hidden fake successes. The app is intentionally unconfigured until a real project URL/public key is supplied. A repository bundle and source archive preserve the local Git commit; no remote URL is invented.

## Independent review revision

The independent review identified an implicit foreign-key lock-order issue for mixed-restock returns and a retained-history staff-offboarding gap. Both are addressed by 202610280003_locking_and_membership_revocation.sql, applied by the local test engine. The bootstrap-retry and non-restocked-COGS findings in that report had already been fixed by the second migration/application integration.

The revision locks all referenced products before return inserts, retains memberships with active/revoked state, blocks revoked accounts in RLS and both SQL authorization helpers, shares membership locks for posting operations, and supplies an audited owner-only revoke_staff RPC. A dedicated UI and server-context refresh handle revocation without sending a former staff account back to onboarding. Tests confirm old history stays intact and former users cannot replay/write/read shop records. The installed-function lock regression is structural and the SQL engine remains single-session: the deterministic mixed-return two-session staging experiment is documented, not claimed as executed.

## Cloud staging record (October 29, 2026)

All three migrations were applied in order to a fresh, empty Supabase Free-plan project (PostgreSQL 17.11). The recorded migration versions were aligned with the repository file names (202610280001 to 202610280003) so later Supabase CLI work stays in sync.

Verified against the real platform roles and default privileges, which the in-memory SQL tests cannot exercise:

- 16 tables and 2 views exist. Row-level security is enabled on all 16 tables, each with a member-scoped read policy.
- The anonymous role has no privilege on any table or view. The authenticated role has SELECT only; every write goes through the 17 intended functions.
- The private helper schema and its 18 functions are unreachable by the API roles.
- Supabase security advisors report no errors. Their 17 warnings (SECURITY DEFINER functions executable by signed-in users) are the intended RPC surface: each function authorizes the caller by active shop membership in SQL, uses an empty search_path, and is granted to the authenticated role only.
- Performance advisors report informational items only: unused indexes on an empty database, foreign-key indexes that matter for parent-row deletes this immutable ledger never performs, and two policy initplan notes on tables the application does not scan. These are accepted at MVP scale and should be revisited with production data volumes.

Still pending against this real stack: application flows with real Auth sessions and PostgREST, independent-session concurrency, email delivery, and a restore drill. They are tracked in docs/testing.md.
