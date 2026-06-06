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

Override the companion web asset path for custom layouts with:

```txt
PIXELATED_WEB_DIST_DIR=/absolute/path/to/apps/web/dist
```
