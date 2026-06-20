# Pixelated Web

Vite/React frontend for the hosted Pixelated Studio web app.

Shared browser infrastructure lives under `src/lib/`, grouped into `api`,
`auth`, `engine`, `navigation`, `session`, and `webrtc`. Tests live under
`tests/unit/<domain>/`; the browser harness lives under `tests/interaction/`.

Run from this folder:

```sh
npm run dev
```

Run unit tests and the production build with:

```sh
npm test
npm run build
```

Important env vars:

```txt
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_PUBLIC_APP_URL=https://pixelated-studio-edition.vercel.app
VITE_API_URL=https://pixelated-api-services.onrender.com
VITE_ENGINE_URL=http://localhost:8080
```

Set `VITE_PUBLIC_APP_URL` in Vercel and in Supabase Auth redirect settings so password recovery, email verification, and OAuth callbacks never fall back to localhost.

For hosted auth, set Supabase Authentication URL Configuration to:

```txt
Site URL: https://pixelated-studio-edition.vercel.app
Redirect URLs: https://pixelated-studio-edition.vercel.app/**
```

Signup confirmation and recovery links expire after 5 minutes. Unconfirmed
accounts older than 72 hours are removed by
`20260611153000_cleanup_stale_unconfirmed_users.sql`.

Configure the Vercel project's Root Directory as `apps/web`.
`apps/web/vercel.json` rewrites direct requests such as `/admin` and
`/play/:id` to the React entry point so browser refreshes work with
`BrowserRouter`.

The main library and multiplayer host catalog use the API's paginated `/games`
endpoint. Searches are sent to the backend so results include the full cloud
catalog, not only the currently visible page.
