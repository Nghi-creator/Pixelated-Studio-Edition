# N4 standalone stage trace export

Tracing remains opt-in. Export is independent of research bundle v2 and contains
only trace-manifest.json and canonical trace-record.json in a gzip TAR. No summary,
pixels, raw PTS, addresses, credentials, titles or game/session filename are added.

Host camera: configure PIXELATED_STAGE_TRACE=1, PIXELATED_STAGE_TRACE_OUTPUT to an
existing-parent local destination, and PIXELATED_STAGE_TRACE_PRODUCER_VERSION to
the deployed producer's lowercase forty-hex Git commit. After loop exit/SIGTERM,
the recording finishes, then the stdlib exporter hashes and atomically publishes
a private 0600 artifact. Unconfigured/disabled/empty recordings write nothing.
Links/special destinations, invalid versions and failures preserve existing output
and use a fixed diagnostic. SIGKILL cannot guarantee export. Both Dockerfiles ship
the exporter; no container or real pipeline was run by software tests.

Browser: build with VITE_N4_STAGE_TRACE=1 and
VITE_N4_STAGE_TRACE_PRODUCER_VERSION set to the deployed producer commit. The player
shows **Finish and export stage trace**. It stops collection, hashes canonical
bytes and downloads pixelated-stage-trace.tar.gz through the existing picker or
anchor download. Picker cancellation is reported; collection remains stopped and
you can retry export. Invalid commit/no media lifetime does not stop collection.
SHA-256/gzip browser APIs are required; failures show a fixed status. Export work
runs outside callbacks; there is no automatic download or upload.

The sibling Python core accepts the standalone gzip TAR or an exact two-file
directory through `ingest-trace --bundle PATH --output PATH`. It validates versions,
closed fields, hash/length, canonical bytes, clocks, sampling/loss and resource caps
before atomic output. Actual no-follow paths are required; JSON is bounded to
10 MiB/depth 32, compressed/expanded archive to 32 MiB. Legacy exports are unchanged.

Synthetic export API tests and both producer-to-core CLI handoffs pass. Effective
browser clock resolution, real capture, picker interaction and measured overhead
have not been validated. The sibling core now implements inspect-trace (Step 6) for offline same-clock
queue/encode/age/callback reconstruction with loss/exclusion and budget evidence.
Pinned synthetic integration is delivered; real capture/overhead acceptance remains pending.

## Synthetic integration and next acceptance step

From this trusted checkout, export fixed inputs through the actual bounded
collectors and production exporters into an existing disposable directory:

```sh
mkdir -p /private/tmp/n4-step7-bundles
python3 scripts/n4/exportSyntheticTraces.py /private/tmp/n4-step7-bundles
node --experimental-strip-types scripts/n4/exportSyntheticTraces.mts /private/tmp/n4-step7-bundles
```

From the sibling core checkout, run:

```sh
.venv/bin/python -m tests.observability.check_reproduction \
  --producer-bundles /private/tmp/n4-step7-bundles
```

The core pins three independent host/browser/unsupported-API records, manifests
and expected summaries. It compares adoption, reconstruction and both CLI output
files byte for byte. These scripts do not read the goldens. Synthetic provenance
and the placeholder commit are explicit; no real timing is claimed.

Next run the core's frozen `N4_PRODUCER_CAPABILITIES.md` procedure in an actual
Linux/Xvfb/PulseAudio runtime with a draining WebRTC receiver. Record unique PTS
correlation, nominal/tiny-capacity/interrupted/two-peer and browser evidence, all
five paired overhead trials and the separate callback diagnostic. Docker is
unavailable on the current host; real capture, live callbacks, picker interaction
and measured overhead remain pending. Full N4 acceptance is open.

The health audit tightens browser decimal/commit validation to reject trailing
line terminators and validates export provenance before ending collection. Host
atomic writes close file/directory descriptors even when stream creation or
cleanup fails. These changes preserve all trace schemas and pinned payloads.
