# Isolated email confirmation and password recovery

## Local behavior and security boundary

Normal password sign-in still uses the existing Supabase SSR/PKCE cookie client and normal workspace navigation. URL session autodetection is explicitly disabled on that application client so an email URL accidentally landing outside the callback cannot silently install or switch an application session. Signup and reset **requests** use a fresh, memory-only `supabase-js` client with `flowType: implicit`, no session persistence, no automatic refresh, no URL autodetection and no auth-state broadcast sharing. Newly requested signup links using the default `{{ .ConfirmationURL }}` do not require the requesting browser's PKCE verifier. There is no callback-triggered send, automatic resend/retry, service-role key, confirmation bypass or rate-limit change.

`/auth/callback` and `/reset-password` are public shells, not authorization bypasses. The proxy does not read or refresh an unrelated application session on these paths. Before any provider verification request, the callback removes the entire query and fragment with `history.replaceState`. Pages have no-referrer, private/no-store and noindex headers. Do not add analytics, third-party scripts, URL logging or session replay to them. Fragment credentials are not sent to the application web server. Legacy query codes/hashes necessarily reach that server: hosting/access-log query redaction remains an operator responsibility.

The callback checks provider-verified JWT claims **and** `getUser(access_token)`, issuer/audience/subject, expiration, confirmed email and email-authentication context. It never accepts a query claiming confirmation or an existing app cookie as authorization. Signup completion only says **“Email confirmed, return to original window and sign in.”** It does not install an application session, redirect to a shop or offer a workspace button.

Recovery requires a **provider-validated recovery capability**, not just `#type=recovery`:

- A successful `verifyOtp({ token_hash, type: 'recovery' })` performed by this isolated client is supported.
- A token/code with an explicitly provider-signed `recovery` AMR is supported if the provider supplies that distinction.
- A generic signed `otp` AMR plus a recent `recovery_sent_at` timestamp is **not recovery proof**. The same context can occur on an ordinary magic-link session after somebody requests a reset. Such fragment tokens are rejected rather than exposing a password form. Timestamps are only additional freshness checks, never authority. Recovery additionally enforces the business policy `email_confirmed_at <= recovery_sent_at`: the account must already exist and its email must have been confirmed when the reset was requested. Missing/invalid confirmation timestamps or confirmation after the request are rejected even with genuine provider recovery proof. This intentionally narrows provider compatibility; users must sign up and confirm their email before requesting a reset. There is no account-existence lookup endpoint or account-enumerating response. A nonexistent provider identity cannot obtain application recovery authorization.

**Provider side-effect limitation:** redeeming a genuine recovery hash may itself confirm a previously unconfirmed email before the application reads the verified identity and rejects it under this policy. Local rejection prevents the password form/update, but does not undo or reverse that provider confirmation, revoke an already-issued access JWT, or promise rollback. The user must complete signup confirmation first, then request a fresh reset link. Signup confirmation remains a separate supported flow.

The popup-style `/reset-password` page shows the linked account email, warns against resetting the wrong account, and requires an explicit account-confirmation checkbox before submission. It validates password length and matching confirmation, rechecks the same provider identity and original proof lifetime, updates Supabase Auth with `updateUser`, then signs out **only the isolated session** (`scope: local`) and drops its memory context. No app cookie is overwritten or cleared, and no app sign-in or account switch occurs. Supabase may independently revoke other sessions for the _same_ account after a password change; the app cannot override provider policy. Success clears the password fields and asks the user to sign in with the new password in the original tab.

Recovery is limited to 15 minutes from token issuance, the provider token expiry, and a recovery request no older than one hour. Submission rechecks the original deadline and the live task/proof generation after awaited session/claims/identity checks and immediately before calling `updateUser`, even if a background-tab timer was delayed. Expiry marks that task terminal, clears the form and detaches its memory client before starting best-effort local signout. Stale async completions cannot dispatch a new mutation or overwrite terminal expiry/success UI. Success becomes terminal without waiting for the signout response.

**Dispatch boundary:** there is no await between the final live check and invoking `updateUser`. Once invoked, the SDK/provider operation is not cancellable by this UI. Expiry or local signout while that operation is in flight cannot undo a committed password change or guarantee that the provider rejected it. If expiry wins (including a deadline detected when the response returns), the page stays unavailable even if the provider committed the update; it does not display a stale success or error. The linked account's password may already have changed. A user unsure of the result should try signing in with their chosen new password in the original window, or request a fresh recovery link. This is a dispatch-time authorization guarantee, not an atomic server-side deadline/rollback guarantee. Reloading after URL scrubbing loses the isolated context; reopen the email link if still valid or request a fresh one. A fragment-only second email navigation starts a fresh document/client, never reuses the previous account's proof.

## Required provider settings — NOT changed or verified here

Local code alone cannot guarantee hosted delivery or redirect compatibility. No provider configuration was inspected or changed during this task. An authorized operator must review these settings before calling the published recovery flow ready:

1. Keep email confirmation **enabled**. Keep normal provider rate limits.
2. Set Supabase Auth Site URL (`site_url`) to the actual production origin. The production origin recorded in repository QA notes is `https://verdant-pos-tau.vercel.app`; confirm it is still current.
3. Include these exact redirect values in the Auth allowlist (`uri_allow_list`), substituting the actual production origin if different:
   - `https://verdant-pos-tau.vercel.app/auth/callback` — signup.
   - `https://verdant-pos-tau.vercel.app/reset-password` — password reset.
     Use only separately authorized exact preview origins, not an unrestricted wildcard. The provider may otherwise fall back to Site URL, where these callbacks cannot run. Signup requests use `/auth/callback`; reset requests now use `/reset-password`, with no `next` redirect.
4. Signup can retain the default template using `{{ .ConfirmationURL }}` for **new implicit** links.
5. **Recovery needs a recovery-specific token-hash template on providers whose default ConfirmationURL returns generic `otp` AMR (including typical GoTrue flows).** Recommended reset-link `href`, with a literal approved production origin:

   ```text
   https://verdant-pos-tau.vercel.app/reset-password#token_hash={{ .TokenHash }}&type=recovery
   ```

   The application redeems this hash with the provider's recovery-specific verification API. The fragment avoids sending the bearer hash in application access logs or referrers. A conventional `?token_hash={{ .TokenHash }}&type=recovery` link is also supported but has initial server-log exposure. Other OTP types, supplied redirects and mixed credentials are rejected. This template change requires separately authorized provider configuration (for example, the relevant Supabase Management API Auth configuration fields); **it has not been performed**. Default generic-OTP recovery links deliberately fail closed, so do not claim that unchanged default recovery templates are now compatible.

6. Legacy PKCE codes can use a same-origin POST to `/auth/email-code`. It reads **only** the original verifier cookie, exchanges without application-cookie writes, and returns credentials no-store to the isolated client. Missing verifier, used/expired code or a generic `otp` purpose produces an accurate invalid/unsupported-link message. Cross-browser PKCE cannot be rescued without the original verifier. An old link is not repaired simply by requesting or deploying this patch.
7. Hosted email delivery has project/provider limits; a 429/email-send-limit error displays friendly guidance with no automatic retry. Default hosted SMTP can have stringent quotas and recipient restrictions. Real customer delivery may require an owner-authorized SMTP provider/domain configuration. This patch neither verifies nor changes the project's quota, SMTP service, paid plan or provider settings.

Local signout revokes the isolated session's refresh capability; it does **not** instantly invalidate an already-issued Supabase access JWT. Such a bearer may remain usable until its expiry (subject to provider policy). Client disposal, no persistence and no automatic refresh prevent this page from continuing to use that context, not an attacker who already copied the bearer. The email-only synthetic fixture retains issued access JWTs until expiry while revoking refresh tokens at logout; preexisting non-email fixture revocation behavior is unchanged.

Management API connection/configuration review is managed separately by the parent/operator. This local correction does not inspect or change live Auth settings, users or provider sends. No deployment is included, and the required recovery TokenHash template must not be assumed to exist until separately reviewed/applied.

Bearer links remain secrets: anyone possessing an intact valid link may exercise its provider-granted authority. Use HTTPS and protect email accounts. Memory isolation is not an XSS defense.

## Evidence boundary

Automated email tests use only isolated unit mocks or a loopback-only synthetic Auth fixture. They establish application control flow, provider-proof rejection, cross-browser/client isolation, password validation, local signout, normal-login preservation, and Urdu RTL/night rendering. They do **not** establish hosted GoTrue delivery, actual AMR shape, SMTP, email-client rewriting, redirect allowlists, template contents or live expiry.

No live signup, password reset, email send, account mutation, migration, API configuration, deployment or cloud write was performed. After an authorized operator applies/reviews the required configuration and deploys separately, the owner should request fresh links and perform the real email tests themselves. Do not use old already-consumed PKCE links as evidence of fresh-link compatibility.

## Local validation for this patch

Using Node 24.22.1 and the existing locked dependencies:

- `npm run lint` — passed (zero warnings).
- `npm run typecheck` — passed.
- `npm run format:check` — passed.
- `npm test` — 241 passed across 24 files.
- `npm run build` — passed.
- `npm run test:e2e -- tests/e2e/email-auth.spec.ts --workers=1` — 13 passed, including confirmation-after-request rejection and 4 deterministic async expiry/terminal-state cases.
- `npm run test:e2e -- --workers=1` — 34 passed, 1 intentionally skipped, zero failures. The existing opt-in `/chart-fixture` test is skipped by the normal suite unless run through `npm run test:chart-responsive`; the actual dashboard/reports responsive test passed. The opt-in chart-only command was not run for this auth patch.

The browser commands above used only the synthetic loopback fixture, not browser-service tools or a hosted provider. The async cases suspend identity verification, an already-committed mutation response, a delayed mutation error, or success signout; they advance the browser clock past expiry and verify terminal state, dispatch counts, and unchanged other-account credentials. The recovery fixtures now prove confirmation after request is rejected even with genuine recovery capability; generic OTP bearer rejection remains covered. The synthetic provider retains its confirmation side effect after local rejection, and the account password remains unchanged. The original same-document fragment-navigation and null-code-challenge compatibility cases remain covered. No live-email claim follows from these results.
