# Product photos: web now, desktop and mobile later

This document explains the intended direction for Verdant's product photos and the additional work a future desktop or mobile team must complete. It is **not a claim that offline selling or a production backup service exists**.

## Why not require a Cloudinary account for every shop?

The web product already uses Supabase authentication, Postgres, and shop membership. For the first version, using an application-owned **private Supabase Storage bucket**, with the current photo's object reference in the database and shop-scoped authorization on every read/write, keeps setup simpler: a shopkeeper uses their existing Verdant login rather than creating and configuring a second cloud account. No Cloudinary account or API secret belongs in browser or mobile code. [Cloudinary explicitly says to sign sensitive uploads on a backend and never expose the API secret to a client](https://cloudinary.com/documentation/client_side_uploading).

This is a pragmatic starting point, not a claim of zero cost. Storage, bandwidth and any image processing use provider resources; free allowances and terms may change, and usage must be monitored. [Supabase's pricing](https://supabase.com/pricing) describes current plan quotas. A per-client Cloudinary account can be revisited as a separate optional integration if customers want portability, specialist image delivery or different account ownership; it requires credential onboarding, security review, quota planning and data migration. [Cloudinary free-plan credits cover storage, transformations and bandwidth](https://cloudinary.com/documentation/developer_onboarding_faq), not unlimited usage.

## Web trust boundaries

- The authenticated shop and active membership determine the tenant; the browser cannot choose another shop's folder or read/write its photos.
- The database stores a private object identifier or path, not binary photo content or an API secret. A controlled application route checks the current session and shop membership before retrieving a photo.
- Private buckets require authorization; a public bucket makes a known URL accessible to anyone. See [Supabase bucket access models](https://supabase.com/docs/guides/storage/buckets/fundamentals) and [Storage access control](https://supabase.com/docs/guides/storage/security/access-control).
- Use small JPEG/PNG/WebP images with bounded byte size, decoded dimensions and pixel count; reject SVG, unsupported or deceptive content. Client-side file-type/size hints alone are not a security boundary. Normalize image bytes and strip unnecessary metadata before delivery where the implementation supports it. Never fetch arbitrary user-supplied external URLs on the server.
- Only one current photo reference should be shown per product. Save and upload are separate operations: if saving the product succeeds but the image fails or the network response is lost, the UI must clearly preserve the product and offer an image retry without creating a duplicate product. Concurrent replacements and retry behavior must be tested. Storage objects not referenced after a failed operation need a deliberate, authorized cleanup policy; do not delete objects blindly during a failed or ambiguous request.
- Avoid long-lived public or signed URLs for private inventory: a signed URL is a bearer credential until it expires and does not automatically vanish when a user's shop membership is revoked. The proposed Storage policies allow only ordinary authenticated reads and uploads and deny issuing signed URLs; this needs verification against the real hosted Storage service before release. [Supabase documents private downloads and signed URL behavior](https://supabase.com/docs/guides/storage/serving/downloads). Do not cache private images in a way that silently defeats access revocation.
- Database backups contain Storage metadata but **not actual uploaded object bytes**. Before treating photos or the POS as production-ready, test recovery of both the database and photo objects into an isolated authorized destination. Supabase recommends Free-plan users maintain their own off-site database exports; [backup documentation](https://supabase.com/docs/guides/platform/backups) explains these limits. A CSV inventory export is not a backup.

## Future desktop application

A desktop app is a separate product decision. Evaluate a supported wrapper/native shell, code signing, install/update channels, hardware integration, Windows/macOS/Linux support, accessibility, privacy and support burden before choosing a stack. The web backend remains authoritative for the current product record and photo version.

1. Authenticate with a normal short-lived user session; never embed a Supabase service-role key, Cloudinary API secret, or another shop's bearer token in a desktop bundle.
2. Obtain only authorized photos using the user's active shop membership. A local image cache is an **optional** speed enhancement, not the source of truth.
3. If an offline image cache is later approved, scope entries by user and shop, use an opaque photo-version key, consider encryption at rest, bound storage, and purge on sign-out, membership revocation or shared-device handover. Define retention, replacement/invalidation and behavior when a product has no photo. Do not leave another shop's cached media visible after account switching.
4. Explicitly warn users that previously cached media may remain available on a device while offline unless purge/encryption controls are implemented; revocation cannot instantly erase files on an unreachable device.
5. Native file-system access and update privileges require OS-specific permissions and a security review. Web browsers cannot be assumed to have arbitrary access to a desktop folder.

## Future mobile application

Mobile may use a native application or a carefully evaluated web/PWA experience. Define camera/photo-library permission prompts, device capability and image orientation, slow-network upload/retry, data-usage budgets, battery, low-end devices, accessible controls, platform signing and release policies. Reuse server-enforced authorization and validation; do not put API secrets in the app.

A bounded, user/shop-scoped local image cache can improve perceived speed, with the same invalidation and sign-out/revocation rules as desktop. Browser/PWA storage can be evicted by the OS, can be private-mode restricted, and must never be assumed durable. iOS and Android native apps have different permitted storage locations and lifecycle rules.

## Offline sales are a separate feature

Cached images only make previously downloaded images available offline. They do **not** make authentication, inventory, sales, payments, credit or synchronization work offline. A reliable offline POS would need a separately designed encrypted local ledger, conflict resolution, device identity, replay/idempotency, no-oversell policy, recovery and multi-device reconciliation, with extensive real-device and failure testing. Do not promise offline transactions based on an image cache.
