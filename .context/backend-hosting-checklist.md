# Backend Hosting Checklist

Updated: 2026-06-03

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

From `services/api`:

```sh
npm run typecheck
npm run lint
npm run build
npm start
```

Then test:

```sh
curl http://127.0.0.1:4000/health
curl http://127.0.0.1:4000/ready
```

Optional hosted-stack smoke with a real signed-in Supabase access token:

```sh
STAGING_BEARER_TOKEN=<token> npm run smoke:staging
```

Run from `services/api`. Optional overrides:

```sh
STAGING_API_URL=https://pixelated-api-services.onrender.com
STAGING_GAME_ID=<known-game-id>
STAGING_SMOKE_ENGINE_URL=http://127.0.0.1:8080
```

This was not run by Codex because no user access token was provided in the repo context. The command checks `/me`, permissions, local pairing save/read/delete with restore, cloud session create/read/verify/delete, and stream metric write/read against the hosted API.

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

1. Deploy the Render API build with catalog, favorites, reactions, comments, profiles, admin users, and admin access-log routes.
2. Deploy the Vercel web build that calls those routes through `apps/web/src/lib/apiClient.ts`.
3. Push any migration that removes old direct-browser policies.
4. Run `STAGING_BEARER_TOKEN=<token> npm run smoke:staging` from `services/api`, then smoke-test signed-in library, favorites, player comments/reactions, profile update, admin user management, admin access logs, and cloud play from the browser as needed.

## Remaining Production Gaps

- No API rate limiting yet.
- No hosted engine fleet assignment yet.
