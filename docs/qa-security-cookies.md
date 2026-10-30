# Hosted QA finding: HTTPS session cookie flag

## Observed baseline

On October 30, 2026, real browser login against the owner-deployed main revision 7bdeedb succeeded, but the Supabase session cookies had `secure: false`, `httpOnly: false`, `sameSite: Lax`, and path `/`.

The missing Secure flag is a hardening defect: an HTTPS app must not permit its session cookie to be sent over plain HTTP. This observation is not evidence that any cookie was intercepted or any account compromised. HttpOnly=false is separate and expected for the current browser-readable Supabase SSR authentication architecture; setting it blindly would break the browser client. An HttpOnly/BFF architecture would require a separate deliberate change, not a cookie toggle.

## Candidate fix

The browser factory, server factory, and proxy refresh path now explicitly set `cookieOptions.secure`. A shared helper fails closed to Secure except for explicit HTTP loopback origins (`localhost`, `127.0.0.1`, `[::1]`) used by development and the isolated browser fixture. Missing or malformed origins do not turn protection off. SameSite, cookie paths, authorization checks, mutation origins, memberships, and ledger contracts are unchanged.

No production deployment or production environment variable was changed. This candidate is on the QA review branch, separate from the Urdu/night frontend branch.

## Verification

- Lint, typecheck, all 130 unit/SQL tests (including 14 new cookie-policy/factory tests), and the production build passed.
- All 12 pre-existing isolated Chromium workflow tests passed with this candidate. These validate loopback compatibility, not real-cloud security.
- A separate actual HTTPS Vercel preview of the QA branch was tested using only the isolated cloud QA owner account. Login created Secure, SameSite=Lax cookies; SSR reload and an authenticated product GET succeeded.
- A real server/proxy refresh was exercised by aging only the QA session's locally cached expiry while preserving its valid private tokens. The proxy refreshed through the real Supabase Auth service; every renewed auth Set-Cookie retained Secure, and the protected API returned 200. No session values were logged or stored in a trace.
- This read-only HTTPS check produced no unhandled browser errors and no business mutations.

## Release gate

Merge/redeploy the QA fix only after owner approval, then repeat the HTTPS login and server-refresh checks on the canonical live origin. A passing preview is not proof that the still-unchanged live deployment is fixed.
