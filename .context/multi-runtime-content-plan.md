# Multi-runtime game catalog plan

## Outcome

Pixelated should evolve from a hard-coded NES streamer into a curated,
license-aware game streaming platform with two execution paths:

1. **Libretro content** for ROM-style games (`.nes`, `.gb`, `.gbc`, `.gba`, and
   later other formats).
2. **Native Linux content** for approved free-software games packaged by a
   trusted distribution such as Debian `main`.

The catalog must never infer redistribution permission from price, age,
availability, or a “homebrew” label. Every published build must retain its
license evidence, source link, attribution, and immutable checksum.

## Phase tracker

- [ ] Phase 0 — Rights and schema foundation
- [x] Phase 1 — Multi-core libretro engine
- [x] Phase 2 — Automated licensed-ROM candidates
- [x] Phase 3 — Debian native proof of concept
- [ ] Phase 4 — Native catalog operations
- [ ] Phase 5 — Additional libretro platforms

When a phase meets every acceptance criterion in this plan, change its checkbox
to `[x]` and add a short completion note beneath the corresponding phase.

## Current architecture and constraints

The engine already has most of the platform-independent pieces:

- RetroArch runs inside the engine container.
- Xvfb, PulseAudio, virtual gamepads, and the WebRTC camera bridge are shared
  infrastructure that can serve more than NES.
- Cloud sessions receive a backend-verified artifact URL.
- Local Vault keeps user-provided files on the paired local engine.

The NES assumptions are concentrated in a few places:

- `engine/runtime/Dockerfile` builds only `mesen_libretro.so`.
- `engine/runtime/src/runtime/processManager.ts` always launches the Mesen core.
- `engine/runtime/src/signaling/startGameHandlers.ts` always downloads cloud
  content to a `.nes` temporary filename.
- upload validation, API copy, and database fields use `rom_*` naming and only
  accept `.nes`.
- input translation exposes the NES set: D-pad, A, B, Start, and Select.

This means GB/GBC/GBA support is an extension, not a rewrite. Native Linux
games are a separate runtime type and should not be disguised as ROMs.

## What a Debian game package is

A Debian package page exposes several different artifacts:

- `*.deb`: a compiled package for one CPU architecture. For the current desktop
  hosts, `amd64` is normally the relevant build.
- `*.dsc`, `*.orig.tar.*`, and `*.debian.tar.*`: source-package materials used
  to rebuild the binary and satisfy source-distribution obligations.
- package dependencies: libraries and data that `apt` installs alongside the
  game.

Pixelated should **not** ask an administrator to download a `.deb` and upload it
as a game artifact. It should maintain an allowlist of Debian `main` package
names and install pinned versions during an engine-image build, for example:

```dockerfile
FROM debian:trixie-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends frozen-bubble neverball \
    && rm -rf /var/lib/apt/lists/*
```

Each approved package then gets a local launch manifest containing a fixed
executable and arguments. The database may select a manifest ID, but it must
never supply an arbitrary shell command.

The screenshot's `2048` package is a text-terminal program. The current video
pipeline captures an X11 display, so it would also need an allowlisted terminal
launcher. SDL/OpenGL/X11 games are better first candidates.

The current engine uses Ubuntu 22.04. Directly installing Debian Trixie `.deb`
files into it is unsupported and likely to create dependency/ABI conflicts.
Use either:

- Ubuntu `main/universe` packages in the current image, with independent
  license review; or
- a separate Debian-based native-game engine image, which is the recommended
  long-term boundary.

## Target data model

Keep catalog identity separate from executable builds. One game may eventually
have multiple builds or platforms.

### `games`

- `id`, `title`, `description`
- `developer_name`, `developer_url`
- `cover_url`, `backdrop_url`
- `publication_status`

### `game_builds`

- `id`, `game_id`
- `runtime_kind`: `libretro` or `native_linux`
- `runtime_id`: allowlisted identifier such as `mesen`, `mgba`, or
  `debian-native-v1`
- `platform_id`: `nes`, `gb`, `gbc`, `gba`, or `linux`
- `artifact_url` (nullable for native packages installed in the image)
- `artifact_filename`, `artifact_size`, `artifact_sha256`
- `launch_manifest_id` (required for native builds)
- `multiplayer_max_players`
- `enabled`

### `game_rights`

- `game_id` and optional `game_build_id`
- `code_license_spdx`
- `asset_license_spdx`
- `cover_license_spdx`
- `license_url`, `source_url`, `original_release_url`
- `attribution_text`
- `permission_evidence_url` for direct creator approval
- `commercial_use_allowed`, `modification_allowed`
- `verified_by`, `verified_at`, `review_notes`

Publishing must fail closed if required rights records are absent.

## Runtime registry

Create an engine-owned registry. The backend returns only a `runtimeId`; the
engine resolves all executable paths and limits locally.

```ts
type RuntimeDefinition = {
  id: string;
  kind: "libretro" | "native_linux";
  extensions: string[];
  maxArtifactBytes: number;
  inputProfile: string;
  corePath?: string;
  launchManifestId?: string;
};
```

Initial registry:

| Runtime ID | Formats | Core/executable |
| --- | --- | --- |
| `mesen` | `.nes` | `/cores/mesen_libretro.so` |
| `mgba` | `.gb`, `.gbc`, `.gba` | `/cores/mgba_libretro.so` |
| `debian-native-v1` | none | fixed native launch manifests |

Never choose a runtime solely from a client-provided filename. Cloud sessions
must bind the approved build ID, runtime ID, URL, size, and SHA-256 checksum.
The engine should additionally validate file extension and format signatures
(iNES header, GB/GBC cartridge header, and GBA header) before launch.

## Input model

Replace browser-key-oriented engine messages with normalized game actions:

- `dpad_up`, `dpad_down`, `dpad_left`, `dpad_right`
- `face_south`, `face_east`, and later `face_west`, `face_north`
- `start`, `select`
- `shoulder_left`, `shoulder_right`

Input profiles map these actions onto the virtual controller. NES and GB use a
subset; GBA adds L/R. Native SDL games should consume the same virtual gamepad,
with a per-game keyboard fallback only when necessary.

## Catalog ingestion pipeline

The long-term solution is a candidate importer plus human publication gate:

```text
source adapters
    -> candidate records
    -> license and artifact validation
    -> curator review
    -> immutable artifact ingestion
    -> gameplay screenshot generation
    -> published game/build/rights records
```

### Source adapters

1. **Homebrew Hub GB/GBC/GBA/NES**
   - Read its public Git repositories, not HTML pages.
   - Import only entries with an explicit game license and a playable supported
     file.
   - Require an asset license or verify that the upstream project license
     explicitly covers the complete game assets.
   - Store the upstream commit SHA and file checksum.

2. **Debian `main` games**
   - Read Debian package metadata to create candidates.
   - Require component `main`; never auto-import `contrib`, `non-free`, or
     `non-free-firmware`.
   - Curate actual playable games separately from engines, servers, tools,
     documentation, and game-data installers.
   - Pin the Debian snapshot/version used to build the engine.
   - Store the package copyright file and source-package URL.

3. **F-Droid main repository (future)**
   - Redistribution is part of its inclusion policy, but Android execution
     needs a distinct runtime and is not an early milestone.

4. **Creator submissions**
   - Require rights ownership, hosting/streaming permission, code/assets/cover
     licenses, source URL, and typed consent.
   - Keep pending artifacts private and provide signed reviewer URLs.

### Publication rules

- Candidate import never makes a game public.
- Reject fan games using third-party characters/assets unless documented rights
  cover them.
- Generate covers from captured gameplay when upstream cover rights are unclear.
- Retain license/notice files beside every mirrored artifact.
- For GPL builds, provide the corresponding source or a compliant written
  source offer from the game page.
- Revalidate source URLs periodically, but preserve the accepted license
  evidence and exact artifact version.

## Delivery phases

### Phase 0 — Rights and schema foundation

1. Add `game_builds` and `game_rights` migrations.
2. Backfill existing NES records as `mesen` builds.
3. Disable publication for any record without verified rights.
4. Make the submissions bucket private and add signed reviewer access.
5. Add admin fields for license evidence, attribution, platform, and runtime.

**Acceptance:** every playable public card resolves to one enabled build and a
verified rights record.

Progress note — 2026-06-25: added the initial `game_builds`/`game_rights`
migration, legacy NES-to-`mesen` build backfill, private submissions bucket
flip, and backend fail-closed catalog/session filtering. Phase 0 remains open
until reviewer signed access and admin rights/build fields are implemented.

### Phase 1 — Multi-core libretro engine

1. Pin and build the mGBA libretro core in the engine Dockerfile.
2. Add the engine-owned runtime registry.
3. Make cloud download paths format-neutral and verify size, checksum, extension,
   and header.
4. Pass the backend-approved `runtimeId` through session verification.
5. Select the libretro core from the registry in `processManager`.
6. Extend local storage and upload validation to `.gb`, `.gbc`, and `.gba`.
7. Add normalized L/R-capable input actions.
8. Add unit tests for runtime selection, spoofed extensions, invalid headers,
   excessive sizes, and unapproved runtime IDs.

**Acceptance:** one verified title for each of NES, GB, GBC, and GBA launches
through both cloud catalog and Local Vault without arbitrary core selection.

Progress note — 2026-06-25: added the first Phase 1 slice: pinned mGBA
Docker build, engine-owned `mesen`/`mgba` runtime registry, runtime-selected
RetroArch core launch, backend-approved `runtimeId` in cloud sessions,
format-neutral cloud temp filenames, and Local Vault `.nes`/`.gb`/`.gbc`/`.gba`
extension support. Phase 1 remains open until checksum/header validation,
runtime-aware upload limits, normalized L/R input actions, and end-to-end
verified GB/GBC/GBA catalog titles are finished.

Progress note — 2026-06-25: added the second Phase 1 slice: backend sessions
now bind optional artifact size/SHA-256, cloud downloads and Local Vault uploads
validate runtime extension, runtime max size, cartridge headers, and checksum
when present, and engine input now accepts normalized L/R-capable game actions
while preserving legacy browser-key input. Phase 1 remains open until the
frontend emits normalized actions and verified GB/GBC/GBA catalog titles are
seeded and smoke-tested end-to-end.

Progress note — 2026-06-25: added the third Phase 1 slice: the web player now
emits normalized game actions, Local Vault frontend validation/UI accepts
`.nes`, `.gb`, `.gbc`, and `.gba`, and cloud session response types include
runtime/integrity metadata. Attempted an engine Docker build, but Docker was not
running locally (`Cannot connect to the Docker daemon`). Phase 1 remained open
until the Docker image build was verified and reviewed GB/GBC/GBA catalog builds
were seeded and smoke-tested end-to-end.

Completion note — 2026-06-25: Phase 1 is complete. The engine image now builds
with pinned Mesen and mGBA libretro cores; the built image contains both
`/cores/mesen_libretro.so` and `/cores/mgba_libretro.so`. Added a curated
Phase 1 smoke catalog fixture plus a Supabase migration publishing one reviewed
NES, GB, GBC, and GBA title with exact source commits, artifact URLs, sizes,
checksums, runtime IDs, platform IDs, and verified rights records. Engine tests
validate those exact local mirror artifacts against extension/header/size/SHA
rules, cloud sessions bind backend-approved runtime/integrity metadata, and
Local Vault resolves supported uploads through the engine registry. A container
smoke run launched each curated artifact with its allowlisted core under Xvfb:
Nova the Squirrel on Mesen, Rex Runner GB/Rebound/xniq on mGBA.

### Phase 2 — Automated licensed-ROM candidates

1. Add a scheduled/manual Homebrew Hub metadata importer.
2. Apply an SPDX license allowlist and supported-file filter.
3. Present candidates in an admin review queue.
4. Mirror approved artifacts into private ingestion storage, verify checksums,
   then promote immutable versions to the catalog bucket.
5. Capture homepage artwork from the running engine and generate attribution
   blocks.

**Acceptance:** adding a supported upstream release requires review and one
approval action, not manual database/storage editing.

Progress note — 2026-06-26: added the first Phase 2 slice. Created the
`catalog_ingestion_candidates` review table with admin/service-role RLS, added a
manual Homebrew Hub candidate importer, and added an admin-only
`GET /admin/catalog-candidates` review queue endpoint. The importer reads local
Homebrew Hub Git clones, filters to playable `.nes`/`.gb`/`.gbc`/`.gba`
artifacts with explicit allowlisted licenses, computes exact size/SHA-256, pins
source commits, stores rights warnings, and never publishes candidates directly.
A real dry run against the current local GB/GBC/GBA/NES mirrors found 111
candidate artifacts. Phase 2 remains open until approval/promotion mirrors
approved artifacts into controlled storage and generates reviewed artwork and
attribution blocks with one curator action.

Progress note — 2026-06-26: added the second Phase 2 slice. Admins can now
`PATCH /admin/catalog-candidates/:candidateId` with `promote` or `reject`.
Promotion reuses an existing `games` row when the candidate artifact filename
already exists, then creates or updates the enabled `game_builds` row and
verified `game_rights` record from the candidate's pinned metadata. This keeps
legacy rows intact while allowing one reviewed candidate to become playable
without manual database editing. Phase 2 remains open until promotion first
mirrors approved artifacts into controlled storage and captures reviewed
artwork/attribution blocks instead of pointing catalog builds straight at the
upstream raw artifact URL.

Progress note — 2026-06-26: added the third Phase 2 slice. Approved candidate
promotion now downloads artifacts only from allowlisted upstream hosts, verifies
byte size and SHA-256 against the imported candidate record, uploads the artifact
to the new public `catalog_artifacts` storage bucket under a deterministic
checksum-based path, and publishes the mirrored storage URL in `games.rom_url`
and `game_builds.artifact_url`. Phase 2 remains open until promotion also
captures or assigns reviewed homepage artwork and produces complete attribution
blocks for display.

Completion note — 2026-06-26: Phase 2 is complete. Promotion now performs the
full one-action curator path for Homebrew Hub candidates: import from local Git
mirrors, filter by supported artifact and explicit allowlisted license, expose
admin review queue records, approve or reject through the API, mirror approved
artifacts into `catalog_artifacts` after host allowlist + size + SHA-256
verification, generate safe placeholder homepage artwork in the same bucket,
reuse existing `games` rows when filenames already exist, and create/update the
enabled build plus verified rights/attribution record. Generated art is a legal
fallback until gameplay capture replaces it.

### Phase 3 — Debian native proof of concept

1. Create a separate Debian-based native runtime image.
2. Choose two small SDL/X11 games from Debian `main`; avoid terminal-only,
   server-only, and asset-download wrapper packages.
3. Install pinned packages at image-build time.
4. Add hard-coded launch manifests and reuse Xvfb, PulseAudio, virtual gamepad,
   WebRTC, telemetry, and cleanup infrastructure.
5. Add per-title CPU, memory, process, and session time limits.
6. Expose package copyright/source information on the game page.

**Acceptance:** both native games launch without accepting a command, package,
or executable path from the database or browser.

Completion note — 2026-06-26: Phase 3 is complete for the proof-of-concept
acceptance. Added a separate Debian Trixie native runtime image that installs
pinned Debian `main` builds of Frozen-Bubble and Neverball at image-build time,
added engine-owned launch manifests for `frozen-bubble` and `neverball`, and
extended the runtime/session path so native cloud sessions boot only those
allowlisted manifest IDs. The database stores `runtime_kind = native_linux`,
`runtime_id = debian-native-v1`, and `launch_manifest_id`; it never supplies a
package name, command, executable path, or arbitrary arguments. Added catalog
seed data with Debian copyright/source links, exposed verified rights metadata
through `/games/:gameId`, and surfaced license/copyright/source links in the
web player header. Docker smoke verified both `/usr/games/frozen-bubble` and
`/usr/games/neverball` launch under Xvfb with headless SDL audio. Per-title
resource-limit hardening beyond the single allowlisted process and session
cleanup path should be carried into Phase 4's native operations work.

### Phase 4 — Native catalog operations

1. Build a Debian candidate adapter for the `main`/`games` package index.
2. Add compatibility testing and launch-manifest authoring to admin review.
3. Produce versioned native runtime images from a locked manifest.
4. Add automated boot/input/video/audio smoke tests per approved game.
5. Roll out new image versions without changing active sessions.

Progress note — 2026-06-26: added the first Phase 4 slice. Created a locked
native runtime manifest for `debian-native-v1`, added a Debian native candidate
importer that emits `debian_main_games` review rows from that lock, extended
the candidate schema for native package metadata and `launch_manifest_id`, and
updated admin promotion so native candidates create catalog games/builds/rights
without mirroring a ROM artifact or accepting executable paths from the
database. Added consistency tests to keep the Docker package pins, lock file,
and engine launch manifests aligned. Phase 4 remains open until admin review
can author/validate new launch manifests, native boot/audio/video/input smoke
tests are automated per candidate, and versioned native images can roll out
without disrupting active sessions.

Progress note — 2026-06-26: added the second Phase 4 slice. The native Docker
image now embeds `native-runtime.lock.json`, and `npm run smoke:native` reads
the local lock manifest, verifies the embedded lock checksum inside the image,
checks every package executable remains under `/usr/games`, boots each locked
game under Xvfb with headless SDL audio, and fails if a game exits immediately
instead of staying alive. Verified against `pixelated-engine-native:phase4` for
Frozen-Bubble and Neverball. Phase 4 remains open until review can author new
launch manifests safely, input/video/audio telemetry is captured per native
candidate, and native image rollout/version selection is wired into operations.

Progress note — 2026-06-26: added the third Phase 4 slice. Native image builds
now derive a stable Docker tag from the runtime ID plus lock-manifest hash
(`pixelated-engine-native:<runtimeId>-<lockHash12>`), and the native Dockerfile
records the runtime ID and full lock SHA-256 as image labels. `npm run
build:native` builds that versioned image, and `npm run smoke:native` defaults
to the same lock-derived image tag so smoke tests target the exact image version
represented by `native-runtime.lock.json`. The generated command was verified
with `--print`; the actual Docker build could not be rerun in this step because
Docker Desktop was not reachable. Phase 4 remains open until this versioned
image tag is wired into desktop/hosted runtime selection without disrupting
active sessions.

### Phase 5 — Additional libretro platforms

Add platforms only when both a maintained core and a sustainable licensed
content source exist. Likely technical candidates include SNES, Genesis/Mega
Drive, Atari 2600, and PC Engine, but core availability alone is not a reason to
publish a platform.

## Security boundaries

- Runtime IDs and launch manifests are allowlisted in the engine image.
- The database cannot provide shell commands or filesystem paths.
- All cloud artifacts use HTTPS host allowlists, maximum sizes, checksums, and
  format validation.
- Native processes run without network access unless a reviewed game requires
  it.
- Native games receive per-session writable directories; their installed files
  remain read-only.
- Do not mount the host Docker socket into a game runtime.
- Submission files remain private until approval.

## Recommended first milestone

Implement Phases 0 and 1 together, then import the currently identified licensed
GB/GBC/GBA candidates. This grows the catalog while preserving the existing
RetroArch/WebRTC architecture. Begin Debian-native work only after runtime IDs,
rights records, checksums, and normalized inputs are established; otherwise the
native path will duplicate assumptions that the multi-core refactor is meant to
remove.

## Reference sources

- Debian package index and `main` redistribution statement:
  <https://www.debian.org/distrib/packages>
- Debian games package section: <https://packages.debian.org/stable/games/>
- Debian archive components policy:
  <https://www.debian.org/doc/debian-policy/ch-archive>
- Homebrew Hub: <https://hh.gbdev.io/>
- Homebrew Hub GB/GBC database: <https://github.com/gbdev/database>
- Homebrew Hub GBA database: <https://github.com/gbadev-org/games>
- Homebrew Hub NES database: <https://github.com/nesdev-org/homebrew-db>
- F-Droid inclusion policy: <https://f-droid.org/docs/Inclusion_Policy/>
