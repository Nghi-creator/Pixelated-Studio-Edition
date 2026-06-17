# Backend Hosting Checklist

Last reviewed: 2026-06-17

This file is the short operational reference for hosted API/web deployment.
Historical migration notes and smoke artifacts were removed from `.context`;
use Git history for old incident detail.

## Required Gates

Run from the repository root before deploying hosted API or web changes:

```sh
npm run verify:hosted-contract
```

For staging schema/predeploy validation:

```sh
STAGING_API_URL=<render-api-url> \
STAGING_SUPABASE_URL=<supabase-project-url> \
STAGING_SUPABASE_ANON_KEY=<supabase-anon-key> \
STAGING_SMOKE_EMAIL=<dedicated-staging-admin-email> \
STAGING_SMOKE_PASSWORD=<dedicated-staging-admin-password> \
npm run predeploy:hosted
```

The predeploy gate signs in the staging smoke account and verifies:

- Access-log schema and admin summary RPC compatibility.
- Submission cleanup storage policy via a disposable upload/delete.
- API typecheck, lint, tests, and build.

If submission cleanup deletion is denied, apply:

```txt
supabase/migrations/20260614153000_allow_own_submission_cleanup.sql
```

## GitHub Actions

- `.github/workflows/hosted-api-deploy-gate.yml`
  - Pull requests run `npm run verify:api`.
  - Pull requests also run `npm run verify:hosted-contract`.
  - Non-PR/manual staging runs can execute `npm run predeploy:hosted`.
- `.github/workflows/hosted-deploy.yml`
  - Runs on `main` and manual dispatch from `main`.
  - Calls the deploy gate before Render or Vercel deploy hooks.
  - Checks production `/health`, `/ready`, and Vercel build fingerprint before smoke.

Disable direct provider auto-deploys that bypass GitHub:

- Render API Git auto-deploy should be off.
- `apps/web/vercel.json` disables Vercel automatic `main` deploy; deploy via hook.

## Staging Environment

Protected GitHub environment: `staging`

Secrets:

```txt
STAGING_API_URL
STAGING_SUPABASE_URL
STAGING_SUPABASE_ANON_KEY
STAGING_SMOKE_EMAIL
STAGING_SMOKE_PASSWORD
```

Use a dedicated staging-only admin or super-admin smoke account. Do not use a
personal admin account or a service-role key for this browser smoke.

## Production Environment

Protected GitHub environment: `production`

Variables:

```txt
HOSTED_API_URL=https://pixelated-api-services.onrender.com
HOSTED_WEB_URL=https://pixelated-studio-edition.vercel.app
HOSTED_SUPABASE_URL=<production-supabase-url>
```

Secrets:

```txt
RENDER_API_DEPLOY_HOOK_URL
VERCEL_WEB_DEPLOY_HOOK_URL
HOSTED_SMOKE_EMAIL
HOSTED_SMOKE_PASSWORD
SUPABASE_SERVICE_ROLE_KEY
```

`SUPABASE_SERVICE_ROLE_KEY` is used only by the hosted auth smoke for
throwaway-user setup/cleanup. Never expose it to Vercel.

## API Runtime Env

Render/API runtime must provide:

```txt
NODE_ENV=production
HOST=0.0.0.0
PORT=<provider-port>
WEB_ORIGIN=https://pixelated-studio-edition.vercel.app
SUPABASE_URL=<supabase-url>
SUPABASE_ANON_KEY=<supabase-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<supabase-service-role-key>
RATE_LIMIT_REDIS_REST_URL=<upstash-compatible-url>
RATE_LIMIT_REDIS_REST_TOKEN=<upstash-compatible-token>
```

Optional:

```txt
CONTROL_PLANE_CLEANUP_INTERVAL_MS=3600000
STREAM_METRIC_RETENTION_DAYS=7
STUN_URLS=stun:stun.l.google.com:19302
TURN_URLS=<comma-separated-turn-urls>
TURN_SHARED_SECRET=<coturn-rest-secret>
TURN_STATIC_USERNAME=<static-turn-username>
TURN_STATIC_CREDENTIAL=<static-turn-credential>
TURN_CREDENTIAL_TTL_SECONDS=3600
FORMSPREE_SUBMISSION_URL=<formspree-endpoint>
```

Production `/health` should report the Redis rate-limit store, and `/ready`
should pass before deployment proceeds.

## Health Checks

```txt
GET /
HEAD /
GET /health
GET /ready
```

`/ready` returns `503` until required Supabase and production shared
rate-limit-store configuration is present.

## Hosted Browser Smokes

The deploy workflow runs:

- Signed-in hosted pairing smoke against Vercel, Render, the real desktop HTTPS
  companion, and a deterministic local engine probe.
- Hosted auth regression smoke using Supabase action links and throwaway users.

Local signed-in pairing smoke:

```sh
npm ci
npm ci --prefix apps/desktop
npx playwright install chromium
npm run build --prefix apps/desktop
HOSTED_SMOKE_EMAIL=<email> \
HOSTED_SMOKE_PASSWORD=<password> \
npm run smoke:hosted-pairing
```

Local hosted auth smoke:

```sh
HOSTED_AUTH_SMOKE_EMAIL=<email> \
HOSTED_SUPABASE_URL=<supabase-url> \
HOSTED_SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
npm run smoke:hosted-auth
```
