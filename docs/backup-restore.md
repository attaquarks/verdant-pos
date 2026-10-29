# Backup and restore runbook

A CSV export is useful for spreadsheets or moving an opening catalog. It is not a database backup: it does not preserve authentication users, memberships, sale lines, payments, adjustments, stock movements, audit records, or idempotency keys.

This deliverable does not create a cloud backup or restore any database. The procedures below must be exercised against your chosen Supabase project before go-live.

## Recovery objectives

Agree on an acceptable recovery point and recovery time for the shop. A daily backup can lose most of a day's sales. If that is not acceptable, choose a plan with point-in-time recovery and test it. Keep an independent encrypted off-site copy and a record of the application Git commit and database migration version. Restrict backup access: customer names/contact details and authentication data are sensitive.

Never delete a Supabase project expecting its hosted backups to remain available. Supabase documents that deleting a project also removes its backups.

## Managed Supabase backups — preferred

1. Open the correct project's Database > Backups screen and verify that successful backups exist, not merely that a plan was purchased.
2. Confirm retention and recovery features actually available on the project's plan. Supabase documents daily backups on Pro/Team/Enterprise; free projects should make regular CLI exports. Do not assume point-in-time recovery is included.
3. Record the project reference, backup timestamp, shop timezone, latest accepted sale reference, application commit, and migration version.
4. Before restoring a working shop, get the owner's explicit approval, stop shop writes, export a precautionary current backup, and communicate downtime and the expected lost-write window.
5. Prefer a restore-to-new-project or isolated restore drill first. Select a backup before the incident. Follow the dashboard's confirmation and completion status; the project is inaccessible while restoring.
6. Validate the restored records and sign-in before changing the app's project URL/key. Update allowed auth redirects and redeploy the app for its new public environment values.
7. Do not resume trading until the reconciliation checklist below passes.

Supabase database backups do not contain Storage API objects, only their metadata. This MVP does not use Storage; if images/files are added later, back them up separately. Custom database role passwords may need resetting after a restore.

## Portable logical backup

Run on your own trusted machine or a controlled backup job with the Supabase CLI, Docker, and an appropriate PostgreSQL client. The build sandbox's successful local SQL tests are not an export of your hosted database. Keep credentials in a password manager/secret manager or protected environment, never in this repository or chat.

Following the official Supabase CLI backup guide, make a dated encrypted backup directory, then supply SOURCE_DATABASE_URL through your secure environment. Use the direct connection string, or the session pooler when direct IPv6 is unavailable. Do not use the transaction pooler for these operations.

```sh
mkdir -p backups/YYYY-MM-DD
supabase db dump --db-url "$SOURCE_DATABASE_URL" --file backups/YYYY-MM-DD/roles.sql --role-only
supabase db dump --db-url "$SOURCE_DATABASE_URL" --file backups/YYYY-MM-DD/schema.sql
supabase db dump --db-url "$SOURCE_DATABASE_URL" --file backups/YYYY-MM-DD/data.sql --use-copy --data-only -x "storage.buckets_vectors" -x "storage.vector_indexes"
```

The exclusions above follow the provider's current guide for managed storage-vector metadata; this application does not create those tables. Confirm your CLI's supported flags with supabase db dump --help if the provider changes them. Ensure pos_private functions, public policies/RPCs, auth users/identities, and all business tables are present. Verify nonempty files, save cryptographic checksums, encrypt them, restrict file permissions, and copy them off the project account. A dump that has never been restored is not a verified recovery mechanism.

The backup includes secrets and user information. Do not upload it as a public artifact or commit it. The project's .gitignore excludes environment files and common dump extensions, but operators must still keep backup directories outside the source tree or explicitly ignore them.

## Restore a logical backup into an isolated new Supabase project

Restoring overwrites/conflicts with destination data. Confirm the exact destination project with the owner and use a new disposable destination, not a project that already contains a live shop. Do not first run the application's schema migration over the restore destination: the schema dump already contains it.

The app does not use Vault, encrypted columns, extra extensions, database webhooks, or custom replication. If those features are added, consult the provider's additional restore instructions, especially encryption root-key handling. Do not replace encryption keys casually.

For the simple application schema, the official Supabase procedure is:

```sh
psql \
  --single-transaction \
  --variable ON_ERROR_STOP=1 \
  --file backups/YYYY-MM-DD/roles.sql \
  --file backups/YYYY-MM-DD/schema.sql \
  --command 'SET session_replication_role = replica' \
  --file backups/YYYY-MM-DD/data.sql \
  --dbname "$DESTINATION_DATABASE_URL"
```

The replica setting is temporary for this controlled import connection, not a setting for application sessions. It suppresses triggers during the trusted restore, so independently reconcile the result. End the connection after completion. On failure stop and inspect the error; do not repeatedly rerun partial imports into a populated destination. The single transaction is intended to leave no partial restore. Check the provider's current guide for managed-role adjustments on your project's PostgreSQL version.

Also preserve Supabase's migration history, or reconcile it with the schema snapshot using the CLI's documented migration repair procedure after comparing versions. Do not mark a migration applied if its objects are missing. Keep the source project's backup and credentials until the restored project is verified.

## Post-restore reconciliation

- All expected auth user IDs exist and shop memberships still reference them. An owner can sign in and email recovery works.
- Compare row counts for products, categories, sales, sale_items, adjustments, payments, expenses, purchases, inventory_movements, cashbook_entries, audit_records, and idempotency_keys with the source snapshot.
- Every product current_stock equals the sum of its quantity_delta inventory movements; none is negative.
- Every sale total equals the sum of immutable line totals. Returned quantities do not exceed original quantities. Net receipts plus balance due equal the remaining net sale value.
- Payment/refund entries reconcile to their cashbook entries. Expenses and supplier purchase payments have not been double-counted.
- RLS is enabled on every business table. anon cannot read data; ordinary authenticated users cannot insert/update/delete tables directly; a second shop cannot read the first shop's rows or call its mutations. The private schema is not an exposed API schema.
- Compare a known daily/weekly report in the shop timezone with the source and spreadsheet export. Unknown costs remain explicitly unavailable, not converted to zero.
- Retry a previously committed request ID in the isolated restore and confirm it returns the original result without another stock deduction.
- Restart application writes only after the owner accepts the restored state and expected lost-write window.

## Sources

Provider procedures and plan behavior should be rechecked before an actual recovery:

- [Supabase Database Backups](https://supabase.com/docs/guides/platform/backups)
- [Supabase Backup and Restore using the CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)

Consulted October 28, 2026. No backup, live restore, or paid plan action was performed by this source build.
