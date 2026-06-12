# Backend Hosting Checklist

Updated: 2026-06-10

## Current Recommendation

The backend is deployed for staging and ready for signed-in browser smoke testing.

Pre-hosting checks passed on 2026-05-26:

- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `GET /health` returned `200`.
- `GET /ready` returned `200` with Supabase URL, anon key, service role key, and web origins configured.
- Unsigned `GET /me` returned `401`.
- Unsigned `POST /sessions` returned `401`.
- Vercel-origin CORS was accepted for `https://pixelated-studio-edition.vercel.app/`.
- Production-mode startup with blank `HOST` bound to `0.0.0.0`, which is required for Render port detection.
- `GET /` and `HEAD /` returned `200` for provider root probes.

`supabase/migrations/20260527093000_backend_control_plane_state.sql`, `20260527103000_secure_game_submissions.sql`, `20260527104500_backend_access_logs.sql`, and `20260527111500_api_owned_social_writes.sql` were pushed to the hosted Supabase project on 2026-05-27.

On 2026-06-03, hosted access-log reads exposed schema drift: Render returned Supabase error `42703` because the hosted `public.access_logs` table did not have the `path` column expected by the API. Push `supabase/migrations/20260603090000_repair_access_logs_path.sql` before relying on hosted `/admin/access-logs`.

On 2026-06-04, access logs moved from raw route rows to user session summaries. Push `supabase/migrations/20260604090000_access_log_sessions_summary.sql` with the API/web deploy so `POST /access-logs` can upsert by `session_id` and `GET /admin/access-logs` can call `public.admin_access_log_summary`.

The hosted staging smoke now detects this access-log drift automatically. It writes the same unique session twice with different `path` values, which exercises `public.access_logs.path`, `session_id`, `last_seen_at`, `access_count`, and the `access_logs_session_id_key` upsert contract. With an admin token it also calls `/admin/access-logs` to verify `public.admin_access_log_summary`. Recognized Supabase schema errors return `access_log_schema_drift` plus the repair migration names.

Before every Render API or Vercel web deploy, run the strict hosted predeploy
gate from the repository root:

```sh
STAGING_API_URL=<render-api-url> \
STAGING_SUPABASE_URL=<supabase-project-url> \
STAGING_SUPABASE_ANON_KEY=<supabase-anon-key> \
STAGING_SMOKE_EMAIL=<dedicated-staging-admin-email> \
STAGING_SMOKE_PASSWORD=<dedicated-staging-admin-password> \
npm run predeploy:hosted
```

This runs `check:access-log-schema` first and signs in a dedicated staging admin
or super-admin smoke account, so the summary RPC cannot be skipped. Missing
access-log migrations fail before local typecheck, lint, or build starts.

The GitHub Actions workflow `.github/workflows/hosted-api-deploy-gate.yml`
provides the repository deploy gate:

- Every pull request runs the local `npm run verify:api` contract without
  exposing staging secrets to untrusted code, so the required status check is
  never skipped by path filtering.
- Manual dispatches run the real `npm run predeploy:hosted` gate against the
  hosted staging API without deploying.
- `.github/workflows/hosted-deploy.yml` runs on pushes to `main` and manual
  dispatches selected from `main`. It calls the reusable gate, then triggers
  the Render API and Vercel web deploy hooks only after the gate succeeds.
- Configure a protected GitHub environment named `staging` with:
  - `STAGING_API_URL`: the Render API origin to validate.
  - `STAGING_SUPABASE_URL`: the staging Supabase project URL.
  - `STAGING_SUPABASE_ANON_KEY`: the staging project's publishable anon key.
  - `STAGING_SMOKE_EMAIL` and `STAGING_SMOKE_PASSWORD`: credentials for a
    dedicated staging-only admin or super-admin smoke account. The harness
    signs in on each run and obtains a fresh access token automatically.

Do not use a personal admin account or the Supabase service-role key for the
smoke account. Protect the `staging` environment, restrict deployment branches,
and rotate the dedicated account password periodically.

Configure a protected GitHub environment named `production` with:

- `RENDER_API_DEPLOY_HOOK_URL`: the deploy hook for the existing Render API
  service.
- `VERCEL_WEB_DEPLOY_HOOK_URL`: the deploy hook for the existing Vercel web
  project.
- `HOSTED_API_URL`: the production Render API origin. The workflow reads
  `/health` before the deploy and waits for a newer process that also passes
  `/ready`.
- `HOSTED_WEB_URL`: the production Vercel origin. The workflow fingerprints
  `/engine` before the deploy and waits for a different production HTML build
  that contains the signed-in pairing bundle.
- `HOSTED_SUPABASE_URL`: the production Supabase project URL used by the hosted
  auth regression smoke.
- `SUPABASE_SERVICE_ROLE_KEY`: a production environment secret used only by the
  hosted auth smoke to generate one-time confirmation/recovery action links and
  delete its throwaway users. Never expose it to Vercel.

Disable Render's Git-based auto-deploy in the API service dashboard.
`apps/web/vercel.json` disables Vercel's automatic `main` deploy while leaving
the branch deploy hook available. A provider that also deploys directly from
`main` bypasses the GitHub gate; the protected deploy hooks must be the only
automatic production deploy path.

Require the workflow's `API contract` status check before merging. Treat the
`Hosted schema and predeploy` job as the required green signal before triggering
Render or Vercel deployment.

## Local `.env`

Created at:

```txt
services/api/.env
```

These values are now filled locally by the project owner:

```txt
SUPABASE_URL=<configured locally>
SUPABASE_ANON_KEY=<configured locally>
SUPABASE_SERVICE_ROLE_KEY=<configured locally>
```

Keep `SUPABASE_SERVICE_ROLE_KEY` only in the backend environment. Never put it in Vercel frontend env vars.

## Staging Deploy Env Vars

Use these values on the backend host:

```txt
NODE_ENV=production
HOST=0.0.0.0
PORT=<provider-assigned-port-or-4000>
WEB_ORIGIN=https://pixelated-studio-edition.vercel.app
CONTROL_PLANE_CLEANUP_INTERVAL_MS=3600000
STREAM_METRIC_RETENTION_DAYS=7
STUN_URLS=stun:stun.l.google.com:19302
TURN_URLS=<optional-comma-separated-turn-urls>
TURN_SHARED_SECRET=<optional-coturn-rest-secret>
TURN_STATIC_USERNAME=<optional-static-turn-username>
TURN_STATIC_CREDENTIAL=<optional-static-turn-credential>
TURN_CREDENTIAL_TTL_SECONDS=3600
FORMSPREE_SUBMISSION_URL=<optional-formspree-endpoint>
SUPABASE_URL=<your-supabase-url>
SUPABASE_ANON_KEY=<your-supabase-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-supabase-service-role-key>
```

Provider notes:

- The API now defaults to `HOST=0.0.0.0` when `NODE_ENV=production`, which fixes Render port scanning even if `HOST` is not explicitly set.
- Render may inject `PORT`; if it does, use the provider value.
- If Render still reports no open ports, confirm `NODE_ENV=production` or set `HOST=0.0.0.0` explicitly in Render env vars.
- Fly.io usually wants the app to listen on `0.0.0.0`.
- CORS origin matching now normalizes trailing slashes, but the clean value is still `https://pixelated-studio-edition.vercel.app`.

## Health Checks

Liveness:

```txt
GET /health
```

Render's default root probe also succeeds:

```txt
GET /
HEAD /
```

Readiness:

```txt
GET /ready
```

`/ready` returns `503` until Supabase URL, anon key, and service role key are configured.

## Pre-Deploy Smoke Tests

From the repository root:

```sh
STAGING_API_URL=<render-api-url> STAGING_SUPABASE_URL=<supabase-project-url> STAGING_SUPABASE_ANON_KEY=<anon-key> STAGING_SMOKE_EMAIL=<email> STAGING_SMOKE_PASSWORD=<password> npm run predeploy:hosted
npm --prefix services/api start
```

Use `STAGING_API_URL=<render-api-url>` when deploying against a Render service
other than the default staging target. Store the admin smoke token as a
short-lived CI/deploy secret; never expose it to Vercel frontend runtime env.

Then test:

```sh
curl http://127.0.0.1:4000/health
curl http://127.0.0.1:4000/ready
```

Optional hosted-stack smoke using the same automatic smoke-account sign-in:

```sh
STAGING_SUPABASE_URL=<supabase-project-url> STAGING_SUPABASE_ANON_KEY=<anon-key> STAGING_SMOKE_EMAIL=<email> STAGING_SMOKE_PASSWORD=<password> npm run smoke:staging
```

Run from `services/api`. Optional overrides:

```sh
STAGING_API_URL=https://pixelated-api-services.onrender.com
STAGING_GAME_ID=<known-game-id>
STAGING_SMOKE_ENGINE_URL=http://127.0.0.1:8080
```

This was not run by Codex because no user access token was provided in the repo context. The command checks `/me`, permissions, hosted access-log write/upsert schema, admin access-log summary schema when authorized, local pairing save/read/delete with restore, multiplayer lobby lifecycle, cloud session create/read/verify/delete, and stream metric write/read against the hosted API.

## Signed-In Hosted Pairing Smoke

The `Hosted Deploy` workflow runs the browser proof after both production deploy
hooks. Configure these production environment values:

```txt
HOSTED_SMOKE_EMAIL=<dedicated-password-auth-smoke-account>
HOSTED_SMOKE_PASSWORD=<smoke-account-password>
HOSTED_WEB_URL=https://pixelated-studio-edition.vercel.app
HOSTED_API_URL=https://pixelated-api-services.onrender.com
```

`HOSTED_WEB_URL` and `HOSTED_API_URL` are optional environment variables and
fall back to the current production URLs for local smoke runs, but the hosted
deploy workflow requires both as production environment variables so it can
capture pre-hook baselines. The credentials must be environment secrets. The
job compiles and starts the real desktop HTTPS companion beside a deterministic
local engine probe, signs in through Vercel, launches `/engine` with a one-use
desktop ticket, registers and restores pairing metadata through Render, and
creates/verifies a cloud session. It restores the smoke account's previous
pairing metadata during cleanup. Before opening Chromium, the runner waits up
to ten minutes for `/health` to identify a newer Render process, for `/ready`
to pass, and for Vercel's live `/engine` HTML fingerprint to change and its
JavaScript bundle to contain the one-click `/launch/redeem` flow.

The workflow passes `HOSTED_SMOKE_RENDER_BASELINE_STARTED_AT_SECONDS` and
`HOSTED_SMOKE_VERCEL_BASELINE_HTML_SHA256` internally to the smoke. Local runs
may omit them, in which case the smoke checks readiness and pairing support
without requiring a newly deployed target. `HOSTED_SMOKE_PUBLISH_TIMEOUT_MS`
optionally overrides the ten-minute wait. The Vercel fingerprint assumes a new
production build changes the static Vite `/engine` HTML; rerunning the deploy
hook for an identical build will intentionally time out instead of proving a
new production promotion.

Every run uploads `.context/hosted-pairing-smoke/` with a JSON report, concise
Markdown result, sanitized browser URL/status log, browser console capture, and
screenshots. Credentials, authorization headers, companion credentials, and the
temporary companion TLS private key are not included. Run the same proof locally
after building the desktop app:

```sh
npm ci
npm ci --prefix apps/desktop
npx playwright install chromium
npm run build --prefix apps/desktop
HOSTED_SMOKE_EMAIL=<email> HOSTED_SMOKE_PASSWORD=<password> npm run smoke:hosted-pairing
```

## Hosted Auth Regression Smoke

After the signed-in pairing smoke passes, the deploy workflow runs
`npm run smoke:hosted-auth` in a separate job. It verifies the June 11 auth
contract in `Auth.tsx`, `ResetPassword.tsx`, and `supabase/config.toml`, then:

- creates a throwaway account through the hosted signup UI;
- proves the resend control is disabled for 60 seconds, then performs a real
  hosted resend and confirms the cooldown resets;
- generates and redeems a real Supabase signup confirmation action link and
  verifies it redirects to `HOSTED_WEB_URL` with a browser session;
- generates and redeems a real recovery action link, verifies it redirects to
  `${HOSTED_WEB_URL}/reset-password`, and updates the password through the
  hosted UI;
- waits 305 seconds, then proves a second recovery link is rejected as expired.

The service-role key is necessary because CI cannot read the production inbox;
the admin action-link endpoint exposes the same one-time verification and
recovery tokens without putting them in artifacts. Signup and resend still run
through the public hosted UI and SMTP path. The smoke deletes every throwaway
user in cleanup and uploads `.context/hosted-auth-smoke/` even on failure.
Production SMTP and Supabase Auth rate limits must allow at least two messages
per deploy run, one signup confirmation and one resend, and the configured
`HOSTED_SMOKE_EMAIL` inbox must support plus addressing. The smoke derives
unique addresses such as `account+pixelated-auth-pending-...@example.com` from
that existing secret, so no owned email domain or additional inbox is required.

Run it locally with:

```sh
HOSTED_WEB_URL=https://pixelated-studio-edition.vercel.app \
HOSTED_SUPABASE_URL=<production-supabase-url> \
HOSTED_SUPABASE_SERVICE_ROLE_KEY=<value-from-SUPABASE_SERVICE_ROLE_KEY> \
HOSTED_AUTH_SMOKE_EMAIL=<plus-address-capable-inbox> \
npm run smoke:hosted-auth
```

`HOSTED_AUTH_SMOKE_EXPIRY_WAIT_MS` is an optional local-only diagnostic
override. CI intentionally leaves it unset so the negative check waits 305
seconds and proves the configured 300-second expiry.

## Vercel Frontend Env

For local frontend development:

```txt
VITE_API_URL=http://127.0.0.1:4000
```

After staging backend deploy:

```txt
VITE_API_URL=https://pixelated-api-services.onrender.com
```

## Data-Boundary Deploy Order

For future API-owned social/profile/admin boundary changes:

1. Push to `main` or manually dispatch `Hosted Deploy`. The workflow stops before either provider deploy hook if the hosted gate fails.
2. Confirm the Render API deploy containing catalog, favorites, reactions, comments, profiles, admin users, and admin access-log routes completes.
3. Confirm the Vercel web deploy that calls those routes through `apps/web/src/lib/apiClient.ts` completes.
4. Push any migration that removes old direct-browser policies.
5. Run `npm run smoke:staging` from `services/api` with the staging smoke-account environment variables configured, then smoke-test signed-in library, favorites, player comments/reactions, profile update, admin user management, admin access logs, and cloud play from the browser as needed.

## Remaining Production Gaps

- No API rate limiting yet.
- No hosted engine fleet assignment yet.
