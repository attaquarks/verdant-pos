# Deployment

## Supported runtime

Use Node 24 and a Next.js-compatible Node host. Static export and static artifact hosting cannot run the authenticated server routes or database transactions. No live destination has been chosen or provisioned by this build.

Use npm ci with the committed lockfile. The build and runtime need the public Supabase URL/key; APP_URL is the exact application origin used for CSRF checks. Public variables must exist at build time and the app must be rebuilt when they change. Production APP_URL must be HTTPS and must match the browser origin. Separate staging and production projects, credentials, redirect URLs, and backups.

## Standard Node/managed Next deployment

1. Commit the project to your chosen repository. Do not commit .env.local, database credentials, backups, or customer exports.
2. Use the fresh Supabase project's migrations and authentication steps in README.md.
3. Configure protected environment values. The web app requires no service-role key, database password, or Management API key.
4. Build with npm ci followed by npm run lint, npm run typecheck, npm test, and npm run build.
5. Start with npm start. Configure the platform to route HTTPS traffic to the assigned port, set a canonical origin, and avoid shared caching of authenticated pages/API responses.
6. Exercise real confirmation and recovery links, login/logout, owner/staff policies, and the staging acceptance matrix in docs/testing.md.

The application uses same-origin mutation requests and exact Origin checks. Do not broadly add arbitrary preview origins to a production allowlist. For a preview environment, set that preview's exact APP_URL and use an isolated staging database. The Supabase private helper schema must remain unexposed. Authenticated records must not enter a CDN/shared cache.

## Standalone container

A Dockerfile is included. Its builder enables BUILD_STANDALONE=1; standard npm builds use Next’s normal output and npm start. Set the public variables as build arguments (they are public, not secret credentials); set APP_URL and public values at runtime too. Never send a service-role key as a build argument or public environment value.

```sh
docker build \
  --build-arg NEXT_PUBLIC_SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL" \
  --build-arg NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" \
  --tag verdant-pos:staging .

docker run --rm -p 3000:3000 \
  --env-file .env.production.local \
  verdant-pos:staging
```

Run these on a machine/CI runner with Docker. Docker is not installed in the build sandbox, so this container recipe is documented rather than claimed as an executed image build. Its Node build/start path matches the verified local production build.

## Operational checklist

- Configure provider rate limits and production email sending; verify recovery email delivery.
- Monitor failed HTTP/database requests without logging passwords, auth tokens, sale payloads, or customer contact details.
- Run backup jobs under a restricted operator/secret manager, not the application's public key.
- Configure retention and perform the isolated restore drill before onboarding real shop records.
- Take a backup before migrations that change live data. This initial migration is for a new project and is not designed to restructure an unrelated existing database.
- Deploy future migrations before app code that depends on them; retain a rollback/application compatibility plan.
- Run real concurrent HTTPS sale/collection/return tests on staging; PGlite serial tests cannot replace this.

## Deliberate limitations

The MVP records payment methods and cash movements; it does not process card payments or integrate a payment terminal. The schema supports staff membership, but self-service invitations/role administration and multi-shop switching are not implemented. Do not manually add multiple shop memberships to a user without implementing an explicit shop-selection workflow. Owner settings are enforced in SQL, not just hidden in the UI.
