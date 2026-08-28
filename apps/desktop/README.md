# Pixelated Desktop

Electron desktop app for running PIXELATED Studio's local engine. It owns Docker diagnostics, engine image build/pull, container lifecycle, engine token generation, local/LAN exposure, HTTPS companion pairing, invite codes, QR codes, connected-browser controls, and packaged release validation.

## Code map

```text
main/companion/    HTTPS companion server, launch tickets, invites, QR, proxy
main/docker/       Docker command wrappers, diagnostics, recovery guidance
main/engine/       Engine startup/shutdown orchestration and recovery workflows
main/network/      Local/LAN exposure detection
main/runtime/      Runtime channel/config/health state
renderer/          Desktop UI helpers for phases, status, logs, recovery, clients, events, and exposure
scripts/           Web-bundle preparation and packaged release smoke
tests/unit/        Main-process subsystem tests
tests/integration/ Package configuration and release-contract coverage
```

## Local development

Run from this folder:

```sh
npm install
npm start
```

`npm start` builds TypeScript and launches Electron. Docker Desktop must be installed and running for engine startup.

Useful commands:

```sh
npm run build
npm test
npm run smoke:release
npm run dist:ci
```

`npm run build` clears stale compiler output before rebuilding so moved files cannot remain in `dist` and accidentally enter tests or packaged releases.

## Normal engine flow

1. Desktop checks Docker availability and reports targeted recovery guidance for missing Docker, stopped daemon, permission issues, virtualization problems, disk space, invalid contexts, and timeouts.
2. Desktop builds or pulls the engine image.
3. Desktop creates a per-run engine token.
4. Desktop removes stale `pixelated-node` containers and starts a fresh runtime.
5. Local mode publishes `127.0.0.1:8080`; LAN mode publishes `0.0.0.0:8080`.
6. Desktop polls `/health` until the engine is ready.
7. LAN mode also starts the HTTPS companion on port `8090`.

The desktop UI reports structured startup states such as checking Docker, pulling/building, removing stale containers, starting, waiting for health, ready, stopping, stopped, and failed.

## Launch Web and pairing

`Launch Web` opens the configured web app and redeems a one-use launch ticket through the local HTTPS companion. The web app stores the companion URL and a scoped `companion:<credential>` token. Signed-in launches register only non-secret pairing metadata with the hosted API so later browser visits can restore the companion target.

The browser probes saved credentials on startup and every five seconds. An
unreachable engine is shown as offline without immediately deleting the
credential during Docker restarts; credentials rejected by the engine are
cleared. Closing the desktop app therefore cannot leave the UI claiming that a
stale pairing is online.

Override the hosted web target:

```txt
PIXELATED_WEB_URL=https://pixelated-studio-edition.vercel.app
```

The companion also powers LAN invite flows. LAN share links and QR codes open the hosted `/engine` invite flow, which performs certificate preflight and invite redemption before proxying HTTP and Socket.IO traffic to the local engine.

## Engine runtime source and images

Packaged builds include `engine/runtime` as `resources/engine-runtime`. Local development falls back to the workspace source path:

```txt
../../engine/runtime
```

Override the runtime source path:

```txt
PIXELATED_ENGINE_RUNTIME_DIR=/absolute/path/to/engine/runtime
```

Use a prebuilt libretro engine image:

```txt
PIXELATED_ENGINE_IMAGE=ghcr.io/your-org/pixelated-engine:latest
PIXELATED_ENGINE_PULL=1
PIXELATED_ENGINE_BUILD_FALLBACK=1
```

Native Debian runtime images are opt-in:

```txt
PIXELATED_ENGINE_RUNTIME_KIND=native_linux
PIXELATED_ENGINE_NATIVE_IMAGE=pixelated-engine-native:debian-native-v1-...
```

Without an explicit native image override, the launcher derives the native image tag from `engine/runtime/native-runtime.lock.json`, builds `Dockerfile.native`, and passes lock metadata into image labels.

## API and origin configuration

The desktop app passes the hosted API URL into the engine so cloud sessions can be verified before boot:

```txt
PIXELATED_API_URL=https://pixelated-api-services-6ovi.onrender.com
```

For localhost API testing:

```txt
PIXELATED_API_URL=http://127.0.0.1:4000
```

Override trusted browser origins:

```txt
PIXELATED_ALLOWED_ORIGINS=https://pixelated-studio-edition.vercel.app,http://localhost:5173,http://127.0.0.1:5173
```

## Packaging

Package a release from this folder:

```sh
npm run dist
```

The `dist` script:

1. Builds the desktop TypeScript.
2. Runs electron-builder for DMG, NSIS, or AppImage targets.
3. Runs the packaged release smoke against the unpacked app.

The release smoke verifies required main/preload/renderer files, sandbox-safe preload behavior, and bundled engine runtime resources. The desktop opens the configured hosted web application rather than shipping a duplicate web bundle.

Cross-platform packaging is validated by `.github/workflows/desktop-release-validation.yml`.

Manual workflow runs may create unsigned draft releases for review. A public
release (`release_draft=false`) takes a stricter path: macOS requires the
`MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD`, `APPLE_ID`,
`APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID` secrets; Windows requires
`WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD`. CI verifies the notarization staple
and embedded macOS signature and validates the Windows Authenticode signature
before upload. Every draft or public release also includes `SHA256SUMS` and a
GitHub OIDC/Sigstore provenance bundle that can be checked with
`gh attestation verify`.
