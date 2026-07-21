<p align="center">
  <img src="assets/banner.png" alt="PIXELATED Studio" width="100%">
</p>

# PIXELATED Studio

<p align="center">
  <a href="https://github.com/Nghi-creator/Pixelated-Studio-Edition/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge" alt="License: MIT"></a>
  <a href="https://nghi-creator.github.io/"><img src="https://img.shields.io/badge/CreatorOS-Portfolio-1f7a4a?style=for-the-badge" alt="CreatorOS portfolio"></a>
  <a href="https://www.linkedin.com/in/nicholas-nguyen-3bb17a335/"><img src="https://img.shields.io/badge/Built%20by-Nicholas Nguyen%20-blueviolet?style=for-the-badge" alt="Built by Nicholas"></a>
  <a href="https://dev.to/dashboard"><img src="https://img.shields.io/badge/Dev-Post-green?style=for-the-badge" alt="Dev Post"></a>
</p>

## Acknowledgments and copyright disclaimer

**PIXELATED Studio does not claim ownership of any third-party games featured in the public library.** The 8-bit games provided on this platform are works created by indie homebrew developers within the retro gaming community. These titles are included strictly for educational, demonstrative, and testing purposes to showcase the platform's web, local engine, and cloud-control capabilities.

Full credit, copyright, and intellectual property rights remain with the original authors. We encourage players to support creators by finding their original work, playing their other games, and supporting them directly.

_If you are the original developer of a featured game and would like it removed from PIXELATED Studio, please open a GitHub Issue or contact the repository owner, and it will be handled immediately._

## Overview

PIXELATED Studio is a web arcade, desktop engine, and hosted control plane for fast 8-bit gameplay, local creator workflows, LAN multiplayer, and WebRTC stream research.

The browser is the front door: users browse games, sign in, save favorites, comment, react, submit games, pair an engine, and play. The desktop app owns the local Docker runtime and LAN companion. The engine container runs the emulator, capture pipeline, local vault, input routing, and WebRTC signaling. The hosted API owns authenticated app data, backend-approved cloud session boot, moderation, submissions, pairing metadata, multiplayer lobbies, access logs, and stream metrics.

## Current feature set

| Area | What it does |
| --- | --- |
| Intro and catalog | `/` introduces the product; `/home` is the cloud game library with featured games, search, pagination, and play entry points. |
| Desktop pairing | `/engine` pairs the browser with a local desktop engine, redeems desktop launch tickets, and supports LAN companion invites. |
| Cloud game boot | `/play/:id` asks the API for a short-lived cloud session before the local engine downloads and boots an approved game artifact. |
| Local Vault | `/local` stores user-provided `.nes` files in the local Docker volume and boots them through the same player path. |
| Multiplayer | `/multiplayer` supports host/guest flows, LAN invites, lobby roles, player slots, spectators, and revocable guest access. |
| Social features | Favorites, comments, comment reactions, game reactions, reports, moderation actions, and user controls are API-owned. |
| Publishing | `/publish` lets signed-in creators submit games, artwork, and rights answers for admin review. |
| Research telemetry | The gameplay screen records stream/playback samples, exports research bundles, and sends authenticated metrics to the API. |
| Admin tools | Admin routes cover submissions, catalog candidates, users, access logs, reports, and moderation workflows. |

## Architecture

```text
apps/web/        Vite React frontend and browser orchestration
apps/desktop/    Electron app for Docker engine lifecycle and LAN companion
engine/runtime/  Token-gated local engine API, emulator runtime, and WebRTC relay
services/api/    Hosted Fastify control plane and Supabase data boundary
supabase/        Database migrations, Storage policy, RPCs, and email templates
scripts/         Hosted, LAN, release, catalog, and interaction smoke tooling
assets/          Repository-level artwork
```

### Runtime flow

1. The desktop app checks Docker, builds or pulls the engine image, creates a per-run engine token, and starts the runtime container.
2. The web app pairs through local engine credentials or the desktop HTTPS companion. LAN guests receive scoped companion credentials rather than the raw engine token.
3. Cloud games are approved by the hosted API. The browser receives a session token, the local engine verifies it with the API, and only then downloads/boots the approved target.
4. Local Vault games stay local. The browser uploads to the paired engine, and the engine stores files in the Docker `pixelated-roms` volume.
5. Gameplay streams through WebRTC: the engine launches the emulator/camera bridge, relays offer/answer/ICE over Socket.IO, and receives browser input.
6. The web app records stream telemetry locally and can publish authenticated metric snapshots to the hosted API.

## Desktop app

PIXELATED Studio is intended to be used through the packaged desktop app plus the hosted website.

### Prerequisites

- Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) and keep it running.
- On Windows, make sure WSL2 or Hyper-V support is enabled for Docker.

### Download

Install the latest packaged release from [GitHub Releases](https://github.com/Nghi-creator/Pixelated-Studio-Edition/releases/latest).

- **Windows:** download the `.exe` installer.
- **macOS:** download the `.dmg` and drag the app into Applications. If Gatekeeper blocks it, right-click and choose **Open**.
- **Linux:** download the `.AppImage`, mark it executable, and run it.

### Normal use

1. Open PIXELATED Studio.
2. Start the engine from the desktop app.
3. Wait for the startup pipeline to finish Docker checks, image build/pull, container start, and health polling.
4. Use **Launch Web** or open the hosted web app at [https://pixelated-studio-edition.vercel.app/](https://pixelated-studio-edition.vercel.app/).
5. Pair on `/engine`, then play cloud games, upload Local Vault ROMs, or host LAN multiplayer.

## Local development

Install workspace dependencies from the repository root:

```sh
npm install
```

Common root commands:

```sh
npm run lint
npm test
npm run build
npm run verify:api
npm run verify:hosted-contract
```

Focused commands:

```sh
npm --prefix apps/web run dev
npm --prefix apps/web run test
npm --prefix apps/desktop start
npm --prefix apps/desktop run dist:ci
npm --prefix engine/runtime run test
npm --prefix services/api run dev
```

The desktop app is the normal way to run the engine because it generates the per-run token, manages Docker, starts the correct local/LAN exposure, and launches the HTTPS companion when needed.

## Hosted deploy and CI

The project uses GitHub Actions gates around the hosted API, web app, desktop packaging, and release validation.

Important workflows:

- `.github/workflows/hosted-api-deploy-gate.yml`
- `.github/workflows/hosted-deploy.yml`
- `.github/workflows/desktop-release-validation.yml`

Useful local equivalents:

```sh
npm run verify:api
npm run verify:hosted-contract
npm --prefix apps/web run lint
npm --prefix apps/web run test
npm --prefix apps/web run build
npm --prefix apps/desktop run test
```

Before a hosted deploy, run the staging predeploy gate with the configured staging secrets:

```sh
STAGING_API_URL=https://pixelated-api-services-6ovi.onrender.com \
STAGING_SUPABASE_URL=<supabase-project-url> \
STAGING_SUPABASE_ANON_KEY=<supabase-anon-key> \
STAGING_SMOKE_EMAIL=<dedicated-staging-admin-email> \
STAGING_SMOKE_PASSWORD=<dedicated-staging-admin-password> \
npm run predeploy:hosted
```

See `.context/backend-hosting-checklist.md`, `.context/ci-rules.md`, and the package READMEs for deeper operational notes.

## Repository READMEs

- [Web app](apps/web/README.md)
- [Desktop app](apps/desktop/README.md)
- [Engine runtime](engine/runtime/README.md)
- [Hosted API](services/api/README.md)

## Community

- **CreatorOS portfolio:** [Nicholas Nguyen](https://nghi-creator.github.io/)
- **Link to the User edition:** [PIXELATED User edition](https://github.com/Nghi-creator/Pixelated-User-Edition)
- **Dev post:** [Dev.to Nicholas](https://dev.to/nicholasthegreat)
- **LinkedIn:** [LinkedIn Nicholas](https://www.linkedin.com/in/nicholas-nguyen-3bb17a335/)
- **Email:** [Mail Nicholas](mailto:gianghi30032005@gmail.com)

## License

MIT - see [LICENSE](LICENSE).

Built by [Nicholas Nguyen](https://www.linkedin.com/in/nicholas-nguyen-3bb17a335/).
