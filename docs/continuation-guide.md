# Verdant POS: continuation guide

This public guide helps a new developer continue the existing project. It does not include credentials, private test evidence, or undisclosed security details. Before changing a live service, obtain the owner's current instructions and privately request the full handoff and security-review materials. Verify current branches, deployment, database, configuration, and permissions rather than relying on a dated document.

## The product

Verdant is a non-AI point-of-sale and inventory application for Pakistani shopkeepers. Keep the existing clean layout, four dashboard task cards, simple wording, Urdu and right-to-left layout, night mode, and collapsible sidebar. Never introduce AI/LLM features. Protect correct, atomic, idempotent sales, stock, and financial records; immutable history; shop isolation; and existing customer data.

## Where to start

- `README.md`: project overview and basic commands.
- `docs/architecture.md`, `docs/api-contract.md`, `docs/database.md`: system design, interfaces and data model.
- `docs/testing.md`, `docs/verification.md`, `docs/e2e-harness.md`: test methods and evidence limits.
- `docs/frontend-shopkeeper.md`: interface requirements and prior review.
- `docs/product-photo-backend.md`, `docs/product-photo-staging-qa.md`, `docs/product-photos-and-future-apps.md`: photo design, hosted findings and future app considerations.
- `docs/staff-access.md`: staff membership and revocation.
- `docs/deployment.md`, `docs/backup-restore.md`: deployment and recovery guidance. Some historical documents may describe earlier states or omit later photo changes; verify against current migrations and project settings.
- `docs/cloud-qa-2026-10-30.md` and `docs/qa-security-cookies.md`, when present after the QA changes are merged: the earlier cloud QA and cookie review.

Read the migration directory in order. Existing hosted environments may already have later photo migrations even when an older frontend is live. Confirm exact applied versions before proposing schema changes; never apply a migration to a shared database without explicit approval.

## Photos: current limitations

Product images are optional and stored in a private cloud storage bucket, separately from product metadata. The normal website upload reduces and re-encodes images, with a 2 MiB stored-file ceiling. Access is scoped to the active shop member. Successful product save and photo upload are separate operations, so retry behavior matters.

The current replacement flow displays the new photo, but **automatic deletion of the previous stored file is not implemented**. Old versions and interrupted uploads may remain and count toward existing per-shop and bucket limits. Do not claim that only one stored file per product is guaranteed. The owner wants replacement-only deletion—not a general historical cleanup. Design and test that change separately, including safe behavior if an upload or response is interrupted and protection of the current image. Do not delete any other objects or alter financial history. The selected staging database also serves the current prototype; obtain explicit approval for schema changes, real-object deletion tests, and deployment.

For current configuration, storage-usage and security notes, read the photo documents above. Storage allocations are shared at the provider account/organization level; they are not a separate provider allowance for each shop. Verify current quotas, prices and actual usage directly with the provider before making capacity or cost claims.

## Testing and release

Automated fixture tests use a test-only database and storage double; they are not proof of real hosted behavior. Keep local, preview and hosted evidence separate. The owner reported manually verifying login and password reset; do not present that as a fresh automated email test. A real independent database-and-photo restore and sustained load test were explicitly deferred by the owner; do not claim they passed. A dedicated customer-safe receipt-printing feature has not been implemented and is outside the current requested release scope.

Before shipping, review current known issues and security materials privately with the owner, confirm real deployment configuration, provider plan eligibility and any costs, test the exact combined revision, and prepare rollback and post-deployment checks. Do not merge, promote, change hosting/database settings, send emails, create identities, delete data, start trials, or incur costs without the relevant owner approval. Never reactivate retired test accounts. Use only newly authorized, clearly labeled test identities; preserve records and retire them after testing.

Do not place credentials in Git, chat, client code, or an application bundle. Never use a Supabase service-role or secret key in the app. Do not change unrelated projects; specifically leave 3am-talks paused and Medot untouched unless the owner expressly changes that instruction. The owner does not run local setup or terminal commands.

## Desktop and mobile later

Native desktop and mobile applications are future work. Reuse shop authorization and keep secrets out of clients. Product photo caching does not make sales or inventory work offline; offline transactions need a separate design and validation.
