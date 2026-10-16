# Smoke and artwork utility maintenance

Existing command paths and npm commands remain stable. Large utilities now keep
configuration, transport, domain checks, ownership cleanup and reporting separate:

| Command | Helper location |
| --- | --- |
| `services/api/scripts/stagingSmoke.ts` | `scripts/staging/` beside the API entry point |
| `services/api/scripts/captureCatalogArtwork.ts` | `scripts/artwork/` and catalog artwork infrastructure |
| `scripts/lan/multiplayerSmoke.mjs` | `multiplayerSmokeOptions`, `Telemetry`, `Session`, `Cleanup`, `Run` modules |
| `scripts/hosted/hostedPairingSmoke.mjs` | `hostedPairingConfig`, `Client`, `Runtime`, `Report` modules |

Run `npm run lint`, `npm test` and `npm run build` for full local verification.
`npm run typecheck:tooling` checks both API utilities and their focused regression
helpers/tests; API verification and predeploy also include this check. Imports of
helper modules do not start live smoke or upload work.

Artwork downloads are capped at 64 MiB with a 30-second request deadline. Image
files are capped at 8 MiB; PNG dimensions, CRC, scanline/filter shape and inflation
are checked before RGB/RGBA brightness analysis. Palette/interlaced PNG and
JPEG/WebP signature handling does not establish full codec or visual-quality
validation. Capture deadlines must be integers in 1..600000 ms. Timeout sends TERM
then KILL and confirms exit; POSIX groups include descendants, Windows termination
covers the direct child. Workspaces are removed after consumption on success or
failure. An unconfirmed exit retains its private workspace with a cleanup failure.
Dry-run captures are temporary (`imageRetained: false`); supplied local artwork
remains untouched.

LAN smoke retains each connected guest immediately and attempts all owned cleanup
steps even when another fails. Host telemetry shutdown must succeed before a pass
report is written. HTTP bodies and diagnostic logs have explicit limits; hosted
pairing log reports include drop counts and redact credentials/URL parameters.

The reusable Repository Quality workflow tests all workspaces on the pinned
production Node version and Node 26 compatibility, with Linux producer Python 3.13.
Hosted deployment waits for it, then the existing hosted/schema gates. Standalone
and reused quality/API-gate runs use different concurrency groups. The API
production dependency audit also blocks deployment. Security audits and
three-platform desktop validation retain their existing workflows. These workflow
edits require actual CI runs; local tests do not establish remote success.

See the sibling core's [verification record](../../latency_fingerprinting/experiments/phase-1-script-ci-20261016/README.md)
and the [manual/live acceptance procedure](n5-live-test-procedure.md).
