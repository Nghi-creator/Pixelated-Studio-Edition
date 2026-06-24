# Pixelated API

Localhost-first backend control plane for Pixelated Studio.

## Local Development

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create or edit the local env file:

   ```bash
   cp .env.example .env
   ```

   This repository already has an ignored `services/api/.env` placeholder for local work. Fill in the Supabase values before testing authenticated routes.

3. Start the API:

   ```bash
   npm run dev
   ```

Default URL:

```text
http://localhost:4000
```

Health check:

```text
GET http://localhost:4000/health
```

Root probe:

```text
GET http://localhost:4000/
```

Readiness check:

```text
GET http://localhost:4000/ready
```

## Current Scope

The API now handles authenticated identity/permissions, game catalog reads, favorites, reactions, comments, profile updates/deletion, admin reports, admin users, access logs, game submission metadata and notifications, WebRTC ICE server config, persisted local pairing and multiplayer lobby metadata, persisted stream metric ingestion, and cloud game session creation/verification. The local engine still runs separately on `localhost:8080`.

Implemented now:

- Fastify server bootstrap.
- Environment parsing.
- CORS for localhost web and hosted Vercel origin.
- `GET /health`.
- `GET /`.
- `GET /ready`.
- `POST /access-logs`.
- Supabase JWT verification middleware.
- Authenticated `GET /me`.
- Authenticated `GET /me/permissions`.
- `GET /games`.
- `GET /games/featured`.
- `GET /games/:gameId`.
- Authenticated favorites routes.
- Authenticated game reaction routes.
- Authenticated comment and comment reaction routes.
- Authenticated profile routes.
- Authenticated `POST /games/:gameId/play-count`.
- Authenticated `POST /moderation/comments/:commentId/report`.
- Authenticated `GET /admin/reports`.
- Authenticated `POST /admin/reports/:reportId/action`.
- Authenticated `GET /admin/users`.
- Authenticated `PATCH /admin/users/:userId`.
- Authenticated `GET /admin/access-logs`.
- Authenticated `POST /submissions/games`.
- Optional server-side Formspree notifications for game submissions.
- Authenticated `GET /webrtc/ice-servers`.
- Authenticated `POST /sessions`.
- `POST /sessions/:sessionId/verify` for local engine cloud session verification.
- Authenticated local pairing routes.
- Authenticated multiplayer lobby control-plane routes.
- Authenticated stream metric routes.
- Supabase anon/service clients.

Next phase:

- Run the hosted-stack smoke after API or Supabase control-plane changes.

## Auth Routes

Auth routes expect:

```text
Authorization: Bearer <supabase-access-token>
```

Routes:

```text
POST /access-logs
GET /me
GET /me/permissions
GET /games
GET /games/featured
GET /games/:gameId
GET /favorites
GET /favorites/:gameId
PUT /favorites/:gameId
DELETE /favorites/:gameId
GET /games/:gameId/reactions
PUT /games/:gameId/reaction
GET /games/:gameId/comments
POST /games/:gameId/comments
DELETE /comments/:commentId
PUT /comments/:commentId/reaction
GET /profile
PATCH /profile
DELETE /me/account
POST /games/:gameId/play-count
POST /moderation/comments/:commentId/report
GET /admin/reports
POST /admin/reports/:reportId/action
GET /admin/users
PATCH /admin/users/:userId
GET /admin/access-logs
POST /submissions/games
GET /webrtc/ice-servers
POST /sessions
GET /sessions/:sessionId
DELETE /sessions/:sessionId
POST /local-pairings
GET /local-pairings/current
DELETE /local-pairings/current
PUT /multiplayer/lobbies/:sessionId
GET /multiplayer/lobbies/recent
DELETE /multiplayer/lobbies/:sessionId
POST /metrics/stream
GET /metrics/stream/recent
```

The local engine calls `POST /sessions/:sessionId/verify` with a `sessionToken` created by `POST /sessions`. That route is token-protected rather than Supabase-bearer protected because it is used server-to-engine during cloud game boot.

If Supabase env vars are missing, authenticated routes return `503`.

## Data Boundary

The browser should not call Supabase tables, RPCs, or realtime channels directly. `apps/web/src/lib/api/apiClient.ts` is the frontend boundary for app data. Browser-side Supabase usage should stay limited to auth/session handling and Storage uploads that intentionally need direct signed-in client upload behavior.

`supabase/migrations/20260527111500_api_owned_social_writes.sql` removes direct browser policies for the workflows now owned by this API. Deploy the matching API and web builds before pushing that migration, or push it immediately after both are live.

## Staging Hosting Notes

Use `/health` for liveness checks and `/ready` for confirming required Supabase env vars are configured.

Minimum backend host env:

```text
NODE_ENV=production
HOST=0.0.0.0
PORT=<provider port>
WEB_ORIGIN=https://pixelated-studio-edition.vercel.app
CONTROL_PLANE_CLEANUP_INTERVAL_MS=3600000
STREAM_METRIC_RETENTION_DAYS=7
STUN_URLS=stun:stun.l.google.com:19302
TURN_URLS=<optional comma-separated turn: or turns: URLs>
TURN_SHARED_SECRET=<optional coturn REST shared secret>
TURN_STATIC_USERNAME=<optional static TURN username>
TURN_STATIC_CREDENTIAL=<optional static TURN credential>
TURN_CREDENTIAL_TTL_SECONDS=3600
FORMSPREE_SUBMISSION_URL=<optional Formspree endpoint for submission notifications>
GLOBAL_RATE_LIMIT_PER_MINUTE=600
PUBLIC_READ_RATE_LIMIT_PER_MINUTE=180
HEALTH_RATE_LIMIT_PER_MINUTE=120
RATE_LIMIT_REDIS_REST_URL=<Upstash-compatible Redis REST endpoint>
RATE_LIMIT_REDIS_REST_TOKEN=<Redis REST bearer token>
RATE_LIMIT_REDIS_TIMEOUT_MS=1000
SUPABASE_URL=<your Supabase URL>
SUPABASE_ANON_KEY=<your Supabase anon key>
SUPABASE_SERVICE_ROLE_KEY=<your Supabase service role key>
```

Production readiness requires both Redis REST values. Session verification,
report, comment, reaction, and play-count limits use atomic shared counters so
multiple API instances enforce the same thresholds. Local development may omit
Redis and uses a bounded in-memory limiter. If the configured Redis endpoint is
temporarily unavailable, the API falls back to that local limiter so protected
routes remain available with per-instance abuse protection. Redis requests are
bounded by `RATE_LIMIT_REDIS_TIMEOUT_MS` before fallback.

Production enables Fastify proxy trust so `request.ip` uses the client address
forwarded by Render's ingress. Keep production traffic behind a trusted ingress;
do not expose the Node port directly while accepting client-supplied forwarded
headers. Render supplies the volumetric edge DDoS layer, while these API limits
protect application work such as authentication and database queries.

### Abuse-Control Limits

| Workflow | Limit | Coordination |
| --- | --- | --- |
| All non-health API requests | 600 per client IP per minute | Redis shared counter |
| Public catalog reads | 180 per client IP per minute | Redis shared counter |
| Liveness and readiness checks | 120 per client IP per minute | Redis shared counter |
| Session verification by IP | 1,000 per minute | Redis shared counter |
| Session verification by IP and session | 30 per minute | Redis shared counter |
| Comments | 10 per user per minute | Redis shared counter |
| Game and comment reactions combined | 120 per user per minute | Redis shared counter |
| Play-count writes | 60 per user per minute | Redis shared counter |
| Comment reports | 10 per user per hour | Redis shared counter |
| Game submissions | 3 per user per hour | Supabase submission rows |
| Stream metrics | 1 per user/session every 5 seconds | Supabase metric rows |

## Tests

Run the focused API test suite from this folder:

```bash
npm run test
```

Tests are grouped under `services/api/tests/unit`, `integration`, and `smoke`.
The route-level integration tests use Fastify injection and a fake Supabase
service, so they do not require local database access. HTTP routes mirror their
domains under `src/routes/admin`, `auth`, `catalog`, `multiplayer`, `system`,
and `users`.

## Staging Smoke

Before triggering a Render API or Vercel web deploy, run the fail-fast hosted
access-log schema gate from the repository root with a dedicated staging admin
or super-admin smoke account:

```bash
STAGING_API_URL=<render-api-url> \
STAGING_SUPABASE_URL=<supabase-project-url> \
STAGING_SUPABASE_ANON_KEY=<supabase-anon-key> \
STAGING_SMOKE_EMAIL=<dedicated-staging-admin-email> \
STAGING_SMOKE_PASSWORD=<dedicated-staging-admin-password> \
npm run predeploy:hosted
```

The root command delegates to `services/api`. `predeploy:hosted` first runs
`check:access-log-schema` against the currently hosted API, then runs
`check:submission-cleanup-policy` against Supabase Storage. The access-log check
writes and updates one unique `public.access_logs` session and calls
`public.admin_access_log_summary`; missing access-log migrations stop the
command before typecheck, lint, or build. The submission-cleanup check uploads
and removes one disposable object under the smoke user's
`submissions/{userId}/staging-smoke/` folder; if removal is denied, apply
`supabase/migrations/20260614153000_allow_own_submission_cleanup.sql` to the
hosted Supabase project before deploying. Configure `STAGING_API_URL` when
checking a non-default Render service.

GitHub Actions workflow `.github/workflows/hosted-api-deploy-gate.yml` runs:

- `npm run verify:api` on every pull request so its required status check is
  never skipped by path filtering.
- `npm run predeploy:hosted` on pushes to `main`, manual dispatches, and calls
  from future Render/Vercel deploy workflows.

Configure the GitHub `staging` environment with secrets `STAGING_API_URL`,
`STAGING_SUPABASE_URL`, `STAGING_SUPABASE_ANON_KEY`, `STAGING_SMOKE_EMAIL`, and
`STAGING_SMOKE_PASSWORD`. The dedicated smoke account must be an admin or
super-admin so the access-log summary RPC cannot be skipped. The runner signs
in at the start of every run and does not store an expiring access token.

Run the hosted-stack smoke test using the same dedicated smoke account:

```bash
STAGING_SUPABASE_URL=<supabase-project-url> \
STAGING_SUPABASE_ANON_KEY=<supabase-anon-key> \
STAGING_SMOKE_EMAIL=<dedicated-staging-admin-email> \
STAGING_SMOKE_PASSWORD=<dedicated-staging-admin-password> \
npm run smoke:staging
```

Environment variables:

- `STAGING_BEARER_TOKEN` or `SUPABASE_ACCESS_TOKEN`: optional signed-in bearer token override for local/manual runs.
- `STAGING_SUPABASE_URL`, `STAGING_SUPABASE_ANON_KEY`, `STAGING_SMOKE_EMAIL`, and `STAGING_SMOKE_PASSWORD`: automatic smoke-account sign-in credentials used when no bearer-token override is provided. The hosted predeploy cleanup-policy check also uses the Supabase URL and anon key to exercise browser-style Storage upload/delete behavior.
- `STAGING_API_URL` or `API_URL`: optional API base URL, defaulting to `https://pixelated-api-services.onrender.com`.
- `STAGING_GAME_ID`: optional game id for cloud session creation. If omitted, the runner discovers the first catalog game with a ROM target.
- `STAGING_SMOKE_ENGINE_URL`: optional local pairing URL, defaulting to `http://127.0.0.1:8080`.

The runner checks `/games` cache headers and `MISS`-then-`HIT` behavior, verifies `/games/featured` remains `no-store`, checks `/me` and `/me/permissions`, writes and updates one unique access-log session to detect hosted `public.access_logs` column/index drift, verifies authenticated submission upload cleanup in Supabase Storage, exercises local pairing save/read/delete with restore, creates/updates/reads/deletes a multiplayer lobby, creates/reads/verifies/deletes a cloud session, and writes/reads a stream metric. When the token has admin access, it also verifies the hosted `public.admin_access_log_summary` RPC through `/admin/access-logs`.

Recognized Supabase access-log schema failures return API code `access_log_schema_drift` with the relevant migration names. The smoke also treats generic failures from the access-log routes as possible hosted drift, which keeps the check useful while an older API deployment is still active.

The smoke intentionally writes one access-log session row and one stream metric row and temporarily changes local pairing metadata for the signed-in user; smoke lobbies and sessions are deleted before the run exits.
