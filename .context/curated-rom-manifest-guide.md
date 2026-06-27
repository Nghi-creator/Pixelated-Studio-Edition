# Curated ROM manifest guide

Use this when a game is not available through an automated source adapter such
as Homebrew Hub, but appears to have explicit redistribution permission.

The manifest is only an intake format. Importing it creates
`catalog_ingestion_candidates` rows for admin review; it does not publish games.

## Hard requirements

Every entry needs:

- a playable artifact filename ending in `.nes`, `.gb`, `.gbc`, `.gba`, `.sfc`,
  `.smc`, `.md`, `.gen`, `.sms`, or `.gg`;
- an HTTPS artifact URL, or a `sourceEntryPath` that can be resolved through the
  manifest's pinned `rawBaseUrl` and `sourceCommit`;
- exact `artifactSha256` and `artifactSize`;
- an SPDX `codeLicenseSpdx`;
- a license/evidence URL when the license is not obvious from the source file;
- no third-party/fan-game IP unless the rights are documented.

Do not use price, itch.io tags, “homebrew,” “free download,” or abandoned status
as permission evidence.

## Manifest shape

Copy [.context/curated-rom-manifest-template.json](./curated-rom-manifest-template.json)
and replace every placeholder.

Top-level fields:

- `repoUrl`: public repository or evidence source.
- `rawBaseUrl`: raw HTTPS base URL for artifacts.
- `sourceCommit`: immutable 40-character Git commit SHA.
- `manifestPath`: path to the manifest/evidence file inside that repo.
- `entries`: candidate game artifacts.

Entry fields:

- `title`: display/review title.
- `slug`: stable identifier used in the candidate `source_entry_path`.
- `developerName`, `developerUrl`: optional but preferred.
- `sourceEntryPath`: artifact path inside the pinned source.
- `artifactFilename`: final playable filename.
- `artifactUrl`: optional override. If omitted, Pixelated builds
  `${rawBaseUrl}/${sourceCommit}/${sourceEntryPath}`.
- `artifactSha256`: lowercase SHA-256 of the playable artifact.
- `artifactSize`: artifact byte size.
- `codeLicenseSpdx`: required source/game license.
- `assetLicenseSpdx`: use when assets have a separate license.
- `licenseUrl`: license/evidence URL.
- `originalReleaseUrl`: original project page.
- `attributionText`: required public attribution/review note.
- `rightsWarnings`: reviewer reminders, for example “verify cover art is not
  reused from the upstream page.”

## Workflow

1. Download the candidate artifact from its original source.
2. Compute checksum and size:

   ```bash
   shasum -a 256 path/to/game.sfc
   wc -c path/to/game.sfc
   ```

3. Fill a copy of the template.
4. Dry-run the importer in strict mode:

   ```bash
   npm --prefix services/api run import:curated-rom-candidates -- \
     --manifest .context/my-source-manifest.json \
     --dry-run \
     --strict
   ```

5. If the JSON rows look right, import to Supabase with service-role env vars:

   ```bash
   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
     npm --prefix services/api run import:curated-rom-candidates -- \
     --manifest .context/my-source-manifest.json \
     --strict
   ```

6. Promote or reject the candidates from the admin review queue.

## Current platform mapping

| Extension | Platform | Runtime |
| --- | --- | --- |
| `.nes` | `nes` | `mesen` |
| `.gb` | `gb` | `mgba` |
| `.gbc` | `gbc` | `mgba` |
| `.gba` | `gba` | `mgba` |
| `.sfc`, `.smc` | `snes` | `bsnes` |
| `.md`, `.gen` | `genesis` | `picodrive` |
| `.sms` | `sms` | `picodrive` |
| `.gg` | `game_gear` | `picodrive` |
