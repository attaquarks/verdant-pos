# Verdant POS: R2 photo transition

Status: **in progress**. This document is a public handoff, not a claim that R2 photos are implemented or deployed. Verify the latest source, provider configuration and owner instructions before making changes. Never put credentials, private object URLs or undisclosed security details in this public repository.

## Current situation

Verdant is a non-AI, multi-shop point-of-sale app. A fresh Supabase project has been selected after the prior organization became unavailable; the owner did not request data recovery. The live website was reconnected to the new project and core migrations 0001–0003 were applied. Confirm the actual current state through authorized access; migration history may use provider-generated version identifiers with original filenames recorded as names.

The historical photo backend in this repository stores bytes in Supabase Storage. On the new project its photo schema and bucket have **not** been installed. Product photos are temporarily unavailable. Do not claim that photo replacement or old-file cleanup works on R2 yet. The owner selected an existing Cloudflare R2 bucket and wants no new Supabase project. Obtain the exact selected resource through private project context or the owner; never guess or choose another bucket.

The email confirmation and recovery screens were changed, but the existing Supabase built-in sender imposes a low email limit. The provider rejected editing its templates on the free default sender. Recovery requires a compatible template and remains blocked until the owner approves a suitable email provider or another eligible configuration. No real email flow was certified by the isolated fixture tests.

## Intended architecture

- **Supabase:** identity, active shop membership, product records, image metadata, and version pointers; enforce shop isolation.
- **Private R2 bucket:** actual compressed image files, using immutable per-operation object identifiers. No permanent public image URL and no shared application-wide public bucket access.
- **Existing Next.js server:** validate/normalize images and perform authorization before upload or download. No R2 secrets in browser/native bundles, public environment variables, logs or Git. Do not use a Supabase service-role/secret key in the application.
- **Replacement:** only publish a new current version after successful validation/upload; do not delete the old file before the new version commits. Preserve safe idempotent retries and concurrent edits, and record failures truthfully for narrowly scoped retry. The owner requested replacement-only old-file deletion, not a sweep of unrelated historical files.
- **Future Windows and Android:** cloud is authoritative. A bounded, disposable app-private cache keyed by account/shop/product/image version can avoid downloading an unchanged image again. Refresh membership/version information; isolate users and shops; handle logout, revocation, stale or evicted cache and interrupted downloads. Do not store files in the user's gallery or desktop. Offline image cache is not offline sales or guaranteed immediate revocation on disconnected devices.

R2's S3-compatible SDK uses an account-origin endpoint, the bucket name separately, and region `auto`. Cloudflare S3 Access Key ID/Secret Access Key are different from a Cloudflare management API token. Restrict credentials to the selected bucket and keep them server-side. A bucket access check alone is not proof of private access or application isolation. Provider pricing, geographic placement, quotas and transfer charges must be verified at deployment time.

## Before changing hosted services

1. Verify repository and deployed revision, current database migrations, exact Supabase project, exact R2 bucket, actual permissions and existing contents. Stop if a named resource is inaccessible; never substitute another.
2. Build and test a reviewed additive schema and server flow without changing existing sales, stock or immutable financial history. Migrations on the selected live/prototype database require explicit owner approval.
3. Distinguish local mock/fixture tests from authorized real-cloud proof. Plan retry, race, tenant access, revocation, corrupted-image, failed upload and failed cleanup checks. Do not create/reactivate test users, send emails, delete real objects or incur costs without required owner approval.
4. Coordinate backend schema, server-only secrets and deployment. Do not promote code that depends on unavailable schema/config. Provide the user a clear status, rollback plan and real hosted limitations.
5. Preserve the original clean layout, four dashboard tasks, simple wording, Urdu/RTL, night mode and collapsible sidebar. Never add AI features.

## References

- [Cloudflare R2 S3 compatibility](https://developers.cloudflare.com/r2/api/s3/api/)
- [Cloudflare R2 authentication](https://developers.cloudflare.com/r2/api/tokens/)
- [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/)
- `docs/continuation-guide.md`, `docs/architecture.md`, `docs/database.md`, `docs/testing.md` and `docs/email-auth-workflow.md`.

Original detailed historical handoff and unpublished security material are kept privately in the Verdant project, not this public repository. The owner handles personal login/2FA and approvals only; do not ask them to install local software or run terminal commands.
