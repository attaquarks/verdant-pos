# Staff access and retained offboarding

This MVP has no self-service invitations, role-administration UI, or account directory. Use an owner-only deployment unless a trusted project operator has deliberately provisioned staff membership. Adding full team administration is a separate feature; do not casually edit roles or delete membership/history rows to simulate it.

## Retained membership state

shop_memberships contains is_active and revoked_at. Existing/new memberships start active. An inactive membership is retained so sale, payment, inventory, audit, and idempotency foreign keys remain valid. Its historical records still belong in the shop's reports.

Both SQL authorization helpers require active membership. Ordinary table RLS rejects revoked users, even if their Supabase authentication token is still valid. A revoked account may read only its own membership tombstone, not shop names, products, sales, payments, audit records or cached request results. The app shows /access-revoked rather than inviting that account to recreate the shop. API mutations and reads return 403. A user can still sign out or manage their own authentication account; that never restores shop permission.

## Owner-authorized revocation RPC

The database exposes a narrowly scoped revoke_staff function for an authenticated active owner. A trusted operator can integrate/call it with the same public Supabase SDK and the owner's verified session. No service-role key is needed or permitted in browser code.

```ts
// supabase is the normal public-key client with the ACTIVE OWNER signed in.
// Confirm both identifiers with the owner before executing against a real shop.
const result = await supabase.rpc("revoke_staff", {
  p_shop_id: verifiedShopId,
  p_user_id: confirmedStaffUserId,
  p_reason: "Owner-approved staff offboarding",
  p_request_id: crypto.randomUUID(), // retain this for an unchanged retry
});
if (result.error) throw result.error;
```

This is an operational example, not a request to run against an unspecified destination. The source build only executes it on synthetic local test memberships.

The function refuses self-revocation, owner targets, users in another shop, inactive callers, non-owner callers, and already-revoked targets under a new request. It requires a reason and an idempotency key. Repeating a successful owner's identical request returns its original result and does not duplicate the audit record. Failed requests leave their keys reusable.

Revocation updates the retained row and appends an immutable audit event with operator, reason, target and timestamp. Never delete a used membership: historical FKs intentionally prevent that. Reactivation or owner recovery is not a public self-service function in this phase; it requires a verified project administrator and a deliberate, audited access decision. A revoked user cannot reactivate themselves or bootstrap a replacement membership.

## Concurrent requests

Normal mutations acquire a SHARE lock on the active caller's membership before posting. Revocation takes an UPDATE lock on the target membership. It waits for an already-started mutation to complete, then marks the member inactive; later mutations recheck the predicate and cannot post. Read-only reports use an active-member check without row locks. An already-running read can finish under its PostgreSQL statement snapshot, but subsequent reads are denied; revocation cannot erase information already legitimately viewed.

Independent-session blocking behavior still needs the staging concurrency drill. The local tests verify SQL state, RLS, grants, retained history, replay denial, helper lock definitions, the real Next revoked screen/API responses, and direct SQL RPC denial through the isolated protocol fixture. They do not prove real hosted authentication or multi-session scheduling.
