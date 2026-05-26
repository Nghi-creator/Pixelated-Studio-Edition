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
