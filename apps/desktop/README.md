# Pixelated Desktop

Electron wrapper for starting and stopping the local Docker engine.

Run from this folder:

```sh
npm start
```

By default the desktop app builds the engine image from:

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
