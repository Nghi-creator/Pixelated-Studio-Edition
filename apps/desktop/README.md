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

The desktop app passes `PIXELATED_API_URL` into the engine so cloud sessions can be verified with the backend before boot. It defaults to the hosted Render API; override it for localhost API testing:

```txt
PIXELATED_API_URL=http://127.0.0.1:4000
```
