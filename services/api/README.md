# Pixelated API

Hosted Fastify control plane for PIXELATED Studio. The API is the browser-facing data boundary for authenticated app workflows and the server-to-engine verifier for cloud game boot.

## Scope

The API owns:

- Supabase JWT verification, roles, permissions, and profile access.
- Catalog reads, featured games, favorites, reactions, comments, reports, and moderation.
- Admin users, reports, submissions, catalog candidates, and access logs.
- Game submission metadata and optional Formspree notifications.
- Cloud session creation, read/delete, and engine-side session verification.
- WebRTC ICE server configuration.
- Signed-in local pairing metadata without storing raw desktop engine tokens.
- Multiplayer lobby metadata and recent lobby discovery.
- Stream metric ingestion and recent metric reads.
- Cleanup jobs and production shared rate limiting.

The local engine still runs separately on `localhost:8080` and verifies cloud sessions through this API before booting catalog games.

## Code map

```text
src/config/       Environment parsing
src/plugins/      Fastify plugins for CORS, logging, security, rate limits
src/modules/      Domain-owned routes, services, policies, contracts
tests/unit/       Domain and utility tests
tests/integration Fastify injection tests with fake Supabase services
tests/smoke/      Hosted/predeploy smoke helpers
scripts/          Hosted checks, importers, catalog artwork, staging smoke
```

## Local development

```sh
npm install
cp .env.example .env
npm run dev
```

Default local URL:

```text
http://localhost:4000
```

Health and readiness probes:

```text
GET /
HEAD /
GET /health
GET /ready
```

If Supabase env vars are missing, authenticated routes return `503`. Production `/ready` also requires the shared rate-limit store.

## Verification

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

Root-level API gate:

```sh
npm run verify:api
```

Hosted predeploy gate:

```sh
npm run predeploy:hosted
```

`predeploy:hosted` checks hosted access-log schema, submission cleanup policy, catalog RPC shape, catalog candidate import validation, typecheck, lint, and build.

## Auth model

Authenticated browser routes expect:

```text
Authorization: Bearer <supabase-access-token>
```

The engine calls:

```text
POST /sessions/:sessionId/verify
```

with the session token created by `POST /sessions`. This route is token-protected for server-to-engine verification rather than Supabase-bearer protected.

## Data boundary

The browser should not call Supabase tables, RPCs, or realtime channels directly. `apps/web/src/lib/api/*` is the frontend boundary for API-owned app data.

Browser-side Supabase use should stay limited to:

- Auth/session handling.
- Storage uploads that intentionally need direct signed-in client upload behavior, such as game submissions.

## Important route groups

| Group | Examples |
| --- | --- |
| System | `/`, `/health`, `/ready`, `/access-logs` |
| Identity | `/me`, `/me/permissions`, `/profile`, `/me/account` |
| Catalog | `/games`, `/games/featured`, `/games/:gameId`, `/games/:gameId/play-count` |
| Social | `/favorites`, `/games/:gameId/reactions`, `/games/:gameId/comments`, `/comments/:commentId/reaction`, moderation report routes |
| Admin | `/admin/users`, `/admin/reports`, `/admin/access-logs`, admin submission and catalog-candidate routes |
| Submissions | `/submissions/games` |
| Engine/control | `/webrtc/ice-servers`, `/sessions`, `/sessions/:id/verify`, local pairing routes, multiplayer lobby routes |
| Metrics | `/metrics/stream`, `/metrics/stream/recent` |

## Production environment

Minimum hosted env:

```txt
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

Production readiness requires both Redis REST values. Local development may omit Redis and uses a bounded in-memory limiter.

Production enables Fastify proxy trust so `request.ip` uses the client address forwarded by Render's ingress. Keep production traffic behind a trusted ingress; do not expose the Node port directly while accepting client-supplied forwarded headers.

## Abuse-control limits

| Workflow | Limit | Coordination |
| --- | --- | --- |
| All non-health API requests | 600 per client IP per minute | Redis shared counter |
| Public catalog reads | 180 per client IP per minute | Redis shared counter |
| Liveness/readiness checks | 120 per client IP per minute | Redis shared counter |
| Session verification by IP | 1,000 per minute | Redis shared counter |
| Session verification by IP and session | 30 per minute | Redis shared counter |
| Comments | 10 per user per minute | Redis shared counter |
| Game and comment reactions combined | 120 per user per minute | Redis shared counter |
| Play-count writes | 60 per user per minute | Redis shared counter |
| Comment reports | 10 per user per hour | Redis shared counter |
| Game submissions | 3 per user per hour | Supabase submission rows |
| Stream metrics | 1 per user/session every 5 seconds | Supabase metric rows |

If Redis is temporarily unavailable, the API falls back to an in-memory limiter so protected routes remain available with per-instance abuse protection.

## Staging smoke

Before triggering Render API or Vercel web deploy hooks, run:

```sh
STAGING_API_URL=<render-api-url> \
STAGING_SUPABASE_URL=<staging-supabase-project-url> \
STAGING_SUPABASE_ANON_KEY=<staging-supabase-anon-key> \
STAGING_SMOKE_EMAIL=<dedicated-staging-admin-email> \
STAGING_SMOKE_PASSWORD=<dedicated-staging-admin-password> \
npm run predeploy:hosted
```

Run the broader hosted-stack smoke:

```sh
STAGING_API_URL=<render-api-url> \
STAGING_SUPABASE_URL=<staging-supabase-project-url> \
STAGING_SUPABASE_ANON_KEY=<staging-supabase-anon-key> \
STAGING_SMOKE_EMAIL=<dedicated-staging-admin-email> \
STAGING_SMOKE_PASSWORD=<dedicated-staging-admin-password> \
npm run smoke:staging
```

The smoke authenticates as a dedicated staging admin/super-admin account, verifies catalog cache behavior, identity/permissions, access-log schema, submission cleanup, local pairing save/read/delete, multiplayer lobby lifecycle, cloud session lifecycle, session verification, stream metric writes/reads, and admin access-log summary access when permitted.

Keep Supabase Auth CAPTCHA disabled on the staging project so CI can complete password-grant sign-in. `STAGING_BEARER_TOKEN` is still supported as a temporary fallback, but access tokens expire and should not be the normal staging configuration.

Recognized Supabase access-log schema failures return API code `access_log_schema_drift` with relevant migration names.

## GitHub Actions

`.github/workflows/hosted-api-deploy-gate.yml` runs:

- `npm run verify:api` on pull requests.
- Hosted predeploy checks on pushes, manual dispatches, and reusable hosted deploy calls.

`.github/workflows/hosted-deploy.yml` calls the deploy gate before Render/Vercel deploy hooks and then runs production hosted pairing/auth smokes.
