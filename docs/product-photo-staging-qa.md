# Product photos: staging QA and release boundaries

## Scope

The test used the actual Verdant Vercel review preview and the selected Verdant Supabase staging project, real Auth, PostgREST, Storage, and application routes. A fresh labeled QA shop, another QA shop, and disposable QA accounts were used. No existing shop's products or accounts were modified. The preview was not merged or promoted to the live frontend. The staging database is also used by the currently deployed prototype, so photo migrations changed that shared database's schema and Storage configuration, not its historical sale or stock data.

## Passed on the real hosted preview

- Creating a product with a photo uploaded and linked it. A deliberately lost successful upload response was retried with the same request ID and bytes; only one product was created.
- The photo appeared in the existing 36-pixel desktop and 37-pixel mobile thumbnail; row height did not increase in the test. The product card showed a larger image and product information, its stock-history button opened movements, and photo replacement worked.
- The normal authenticated app route served WebP with `private, no-store` and `nosniff`. Bad/mismatched image bytes were rejected. A direct upload with no reserved slot was denied, and signed download URL creation was denied.
- A different shop and an anonymous client could not read the QA photo on cache miss. The mobile page had no horizontal overflow in the tested viewport; Axe found no violations on the tested product card.
- The simplified dashboard retained four task cards and omitted the repeated metric and heading explanations. No unhandled page errors or hosted 5xx responses were observed during this pass.
- All four QA identities used for photo and revocation testing were subsequently banned and their memberships inactive. New logins failed and old tokens could not read product rows. Labeled QA data and photo objects remain for audit; nothing was deleted.
- Seven database reconciliation queries returned zero stock, sale, return, payment, balance, idempotency and RLS discrepancies after the tests.

## Important: cached photo access after revocation

The app's own photo route immediately denied a revoked staff session. The database membership and RLS path helper also returned inactive/false. However, two separate real tests observed that the **same previously authorized, unexpired JWT could retrieve the exact previously cached Storage object after revocation**: HTTP 200 with `cf-cache-status: HIT`. A request with a fresh query string and a new token were denied. This did not expose previously uncached objects in the test, but it is still an access-revocation window.

As an additional experiment, an image was uploaded with `max-age=0, no-store, private`. Its response said `private, no-store`, but the provider CDN still reported MISS followed by HIT. Request `no-store` alone is therefore not treated as a fix. [Supabase documents that private authenticated Storage CDN responses can remain accessible to the same JWT after access is removed until the token expires](https://supabase.com/kb/markdown/troubleshooting/storage-private-bucket-files-still-accessible-after-remove-access-or-logout.md). Signed URLs are blocked by our policies, but that does not prevent the separate authenticated CDN behavior.

The application continues to authorize every normal image request, but a user who knows a cached object's direct Storage path and possesses the old token may bypass that route. People can also save screenshots or bytes while authorized. **Do not represent product-photo access as instantly revocable or promote the feature as fully release-ready without a privacy/risk decision and an appropriate redesign or mitigation.** [Supabase's CDN purge feature requires a secret key and Pro or above](https://supabase.com/docs/guides/storage/cdn/purge-cdn-cache); it also has propagation/browser-cache limits. No upgrade, secret key, CDN purge, or global token-lifetime change was made.

## Limits still to resolve

- The private bucket enforces small object limits and guarded upload reservations, but retained old/orphaned image objects still count against the per-shop/global limits. There is no automatic safe cleanup job or production usage-alert system.
- Normal app uploads are decoded and normalized. Storage clients with valid user authorization can call Storage directly; application photo reads revalidate data, but direct Storage is a separate surface. Full malware scanning and production abuse controls are not implemented.
- A synthetic local PGlite snapshot/restore exercise passed; it is not a backup of the actual Supabase project. A real independent database-and-photo-object backup and restore remains unverified.
- Actual signup and password-reset email delivery remains unverified. The Gmail access card was offered for inbox verification; no test message was sent and no existing user's password was changed.
- Physical devices, native Urdu copy review, a shopkeeper usability study, load testing, and customer-safe receipt printing remain unverified or unimplemented.
- The separately reviewed HTTPS session-cookie `Secure` fix is still in QA PR #2, not the unchanged live frontend. Current Free/host plan terms and usage need review before real commercial rollout.

## Evidence

Sanitized test summaries are kept in the ignored development artifacts `real-photo-qa-evidence.json`, `real-photo-cache-probe-evidence.json`, and `real-photo-retirement-evidence.json`. They contain synthetic QA identifiers/measurements, not passwords or session tokens. Actual photo access keys and SQL payloads were kept out of source control.
