# Pixelated Desktop

Electron wrapper for starting and stopping the local Docker engine.

Run from this folder:

```sh
npm start
```

Package a release from this folder:

```sh
npm run dist
```

The desktop `dist` script first runs the React production build in `../web`,
then electron-builder bundles `../web/dist` into packaged desktop artifacts as
`resources/web-dist`. It finishes by running `npm run smoke:release` against
electron-builder's unpacked packaged app. The release command fails if
`app.asar` is missing required main/preload/renderer files, HTML references
missing or CommonJS renderer output, the preload imports unsupported sandbox
modules or omits its IPC bridge, bundled `resources/web-dist` differs from the
fresh `apps/web/dist` build, or bundled engine runtime resources are incomplete.

Re-run the packaged artifact guard without rebuilding the installer:

```sh
npm run smoke:release
```

Packaged builds resolve the LAN HTTPS companion player from the bundled
`resources/web-dist` resource. Local development still resolves the companion
player from `apps/web/dist`, so run `npm run build` in `apps/web` before testing
LAN companion mode with `npm start`.

When the engine starts in LAN mode, its health payload advertises the desktop
HTTPS companion URLs. The player lobby uses the first companion URL for its
session-specific share link and copies invite-code guidance with it. Local-only
localhost play continues to share a direct spectator link. Desktop also adds
the dynamic companion origins to the engine allowlist for proxied browser and
Socket.IO traffic.

By default the desktop app builds the engine image from the bundled
`resources/engine-runtime` directory in packaged builds, falling back to the
workspace source path during local development:

```txt
../../engine/runtime
```

Override that path for packaged or custom layouts with:

```txt
PIXELATED_ENGINE_RUNTIME_DIR=/absolute/path/to/engine/runtime
```

The launcher can also use a prebuilt engine image. By default it keeps the local
developer build path, but a packaged release can pull a tagged image first:

```txt
PIXELATED_ENGINE_IMAGE=ghcr.io/your-org/pixelated-engine:latest
PIXELATED_ENGINE_PULL=1
```

If the pull fails, the launcher falls back to a local build unless disabled:

```txt
PIXELATED_ENGINE_BUILD_FALLBACK=0
```

The desktop UI reports structured startup states: checking Docker, pulling or
building the image, removing stale containers, starting the container, waiting
for health, ready, stopping, stopped, and failed.

The desktop app passes `PIXELATED_API_URL` into the engine so cloud sessions can be verified with the backend before boot. It defaults to the hosted Render API; override it for localhost API testing:

```txt
PIXELATED_API_URL=http://127.0.0.1:4000
```

The engine accepts the hosted app plus local Vite origins by default. Override
the explicit comma-separated allowlist when testing another trusted web origin:

```bash
PIXELATED_ALLOWED_ORIGINS=https://pixelated-studio-edition.vercel.app,http://localhost:5173,http://127.0.0.1:5173
```

`Launch Web` opens the hosted Vercel app and securely redeems a one-time pairing
ticket through the local HTTPS companion. Override the hosted target when needed:

```bash
PIXELATED_WEB_URL=https://pixelated-studio-edition.vercel.app
```

The companion on port `8090` is a background HTTPS proxy, trust endpoint, and
invite API. Opening it directly shows a small status page. LAN share links and
QR codes open the hosted `/engine` invite flow, which uses the companion URL for
certificate preflight and invite redemption.

Override the companion web asset path for custom layouts with:

```txt
PIXELATED_WEB_DIST_DIR=/absolute/path/to/apps/web/dist
```
