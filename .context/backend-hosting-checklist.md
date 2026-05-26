# Backend Hosting Checklist

Updated: 2026-05-26

## Current Recommendation

The backend is ready for a staging deploy.

Pre-hosting checks passed on 2026-05-26:

- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `GET /health` returned `200`.
- `GET /ready` returned `200` with Supabase URL, anon key, service role key, and web origins configured.
- Unsigned `GET /me` returned `401`.
- Unsigned `POST /sessions` returned `401`.
- Vercel-origin CORS was accepted for `https://pixelated-studio-edition.vercel.app/`.

Do not treat the deploy as final production until the local engine validates backend-created session intent. The API now creates `sessionToken` values, but the current local engine still relies on the local pairing token for its boundary.

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
SUPABASE_URL=<your-supabase-url>
SUPABASE_ANON_KEY=<your-supabase-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-supabase-service-role-key>
```

Provider notes:

- Render may inject `PORT`; if it does, use the provider value.
- Fly.io usually wants the app to listen on `0.0.0.0`.
- CORS origin matching now normalizes trailing slashes, but the clean value is still `https://pixelated-studio-edition.vercel.app`.

## Health Checks

Liveness:

```txt
GET /health
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

Optional deeper local test with a real signed-in Supabase access token:

```sh
curl -H "Authorization: Bearer <token>" http://127.0.0.1:4000/me
curl -H "Authorization: Bearer <token>" http://127.0.0.1:4000/me/permissions
```

This was not run by Codex because no user access token was provided in the repo context. It should be tested from the browser after staging deploy.

## Vercel Frontend Env

For local frontend development:

```txt
VITE_API_URL=http://127.0.0.1:4000
```

After staging backend deploy:

```txt
VITE_API_URL=https://<your-backend-host>
```

## Remaining Production Gaps

- Local engine does not yet validate backend session tokens.
- API sessions are in memory, so multiple backend replicas will not share session state.
- No API rate limiting yet.
- No centralized stream metrics ingestion yet.
- No hosted engine fleet assignment yet.
