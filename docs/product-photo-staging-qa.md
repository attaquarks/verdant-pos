# Product photos: staging QA and release boundaries

## Scope

The test used the actual Verdant Vercel review preview and the selected Verdant Supabase staging project, real Auth, PostgREST, Storage, and application routes. A fresh labeled QA shop, another QA shop, and disposable QA accounts were used. No existing shop's products or accounts were modified. The preview was not merged or promoted to the live frontend. The staging database is also used by the currently deployed prototype, so photo migrations changed that shared database's schema and Storage configuration, not its historical sale or stock data.

## Passed on the real hosted preview

- Creating a product with a photo uploaded and linked it. A deliberately lost successful upload response was retried with the same request ID and bytes; only one product was created.
- The photo appeared in the existing 36-pixel desktop and 37-pixel mobile thumbnail; row height did not increase in the test. The product card showed a larger image and product information, its stock-history button opened movements, and photo replacement worked.
- The normal authenticated app route served WebP with `private, no-store` and `nosniff`. Bad/mismatched image bytes were rejected. A direct upload with no reserved slot was denied, and signed download URL creation was denied.
- A different shop and an anonymous client could not read the QA photo on cache miss. The mobile page had no horizontal overflow in the tested viewport; Axe found no violations on the tested product card.
- The simplified dashboard retained four task cards and omitted the repeated metric and heading explanations. No unhandled page errors or hosted 5xx responses were observed during this pass.
- All seven QA identities used across the photo, cache-probe and S3 cutover tests were subsequently banned and their memberships inactive. New logins failed and old tokens could not read product rows. Labeled QA data and photo objects remain for audit; nothing was deleted.
- Seven database reconciliation queries returned zero stock, sale, return, payment, balance, idempotency and RLS discrepancies after the tests.

## CDN revocation finding and cache-free S3 cutover

The app's own photo route immediately denied a revoked staff session. The database membership and RLS path helper also returned inactive/false. However, two separate real tests observed that the **same previously authorized, unexpired JWT could retrieve the exact previously cached Storage object after revocation**: HTTP 200 with `cf-cache-status: HIT`. A request with a fresh query string and a new token were denied. This did not expose previously uncached objects in the test, but it is still an access-revocation window.

As an additional experiment, an image was uploaded with `max-age=0, no-store, private`. Its response said `private, no-store`, but the provider CDN still reported MISS followed by HIT. Request `no-store` alone is therefore not treated as a fix. [Supabase documents that private authenticated Storage CDN responses can remain accessible to the same JWT after access is removed until the token expires](https://supabase.com/kb/markdown/troubleshooting/storage-private-bucket-files-still-accessible-after-remove-access-or-logout.md). Signed URLs are blocked by our policies, but that does not prevent the separate authenticated CDN behavior.

The application always verifies active membership before fetching an image. To prevent new direct authenticated-HTTP cache entries, a follow-up policy restricts photo reads to Supabase's user-scoped S3 protocol, which does not use the authenticated-download CDN, and denies Storage HTTP downloads and signed URLs. The server forwards the authenticated user's session and a public legacy anon credential, never a service-role or secret key. In real-hosted verification after the final cutover, an active QA staff member read a photo through the app and S3; direct HTTP and signed URL creation were denied. Immediately after owner revocation, the same S3 token returned 404, the app returned 403, metadata was no longer visible, and the revoked screen appeared. The app's image response remained private/no-store.

**Caveat:** cached HTTP responses issued during the earlier trial can persist for their earlier JWTs until expiry; there were no photo objects in non-QA-named shops at the cutover check. Previously saved downloads or screenshots cannot be recalled. [Supabase's CDN purge feature requires a secret key and Pro or above](https://supabase.com/docs/guides/storage/cdn/purge-cdn-cache), with propagation and browser-cache limits. No upgrade, service-role key, CDN purge, or global token-lifetime change was made.

## Limits still to resolve

- A real S3 cutover retest confirmed a previously saved product stayed unique after a lost photo response; retry reused the same ID and bytes. After a page reload, replacement succeeded, two competing replacements produced one success and one conflict, the winning retry returned success, and altered bytes with the same request ID were rejected. A normal immediate card replacement without intercepting the network also succeeded. The immediate replacement following a deliberately intercepted lost response repeatedly timed out in the browser harness without a reload, so that combined edge case remains to be investigated; do not claim it passed.
- The private bucket enforces small object limits and guarded upload reservations, but retained old/orphaned image objects still count against the per-shop/global limits. There is no automatic safe cleanup job or production usage-alert system.
- Normal app uploads are decoded and normalized. Storage clients with valid user authorization can call Storage directly; application photo reads revalidate data, but direct Storage is a separate surface. Full malware scanning and production abuse controls are not implemented.
- A synthetic local PGlite snapshot/restore exercise passed; it is not a backup of the actual Supabase project. A real independent database-and-photo-object backup and restore remains unverified.
- Actual signup and password-reset email delivery remains unverified. The Gmail access card was offered for inbox verification; no test message was sent and no existing user's password was changed.
- Physical devices, native Urdu copy review, a shopkeeper usability study, load testing, and customer-safe receipt printing remain unverified or unimplemented.
- The separately reviewed HTTPS session-cookie `Secure` fix is still in QA PR #2, not the unchanged live frontend. Current Free/host plan terms and usage need review before real commercial rollout.

## Evidence

Sanitized test summaries are kept in the ignored development artifacts `real-photo-qa-evidence.json`, `real-photo-cache-probe-evidence.json`, and `real-photo-retirement-evidence.json`. They contain synthetic QA identifiers/measurements, not passwords or session tokens. Actual photo access keys and SQL payloads were kept out of source control.
