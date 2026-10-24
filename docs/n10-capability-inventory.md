# Read-only live-probe property inventory

Run the opt-in inspector in the target Linux/GStreamer environment:

```sh
cd engine/runtime
python3 live_probe_inventory.py
python3 -m unittest discover -s tests/python -p 'test_live_probe_*.py' -v
```

Both runtime Dockerfiles ship `/app/live_probe_inventory.py`. Existing images need
a rebuild or an explicit read-only bind mount of that file; the camera and server
do not import it or automatically run it. The core's
[capability boundary](../../latency_fingerprinting/docs/live_probes/N10_CAPABILITY_INVENTORY.md)
defines how these observations relate to later live relief proof.

The command accepts no arguments and writes bounded, closed-inventory JSON to
stdout. Exit 0 means the inventory ran; it does **not** mean a live family is
available. Exit 1 retains `gstreamer_unavailable` JSON when Gst/initialization is
unavailable. Unexpected arguments return 2 with a fixed diagnostic on stderr.
Individual missing plugins/properties, unreadable values, state races and getter
failures remain explicit per-element/property outcomes. Native exception text,
peer identities, tokens, addresses and local paths are not included.

## Scope and interpretation

The inspector lazily loads GI and constructs fresh `vp8enc`, `videorate` and
`identity` elements in NULL. It reads only a fixed numerical/boolean property
list: encoder bitrate/cost/quantizer/deadline/thread/keyframe settings,
`videorate.max-rate`/`drop-only`, and `identity.sleep-time`. Units accompany every
row. It reads element state with zero timeout before/after the bounded property
list; pending/changed/failed/unknown states are unavailable. The standalone
inventory rejects a factory unexpectedly returning a non-NULL element.

Rows retain GObject read/write/construct-only flags, the exact flags integer,
advertised Gst PLAYING mutability, default/range metadata and getter values.
Values are plugin defaults in this command, not an active camera's settings.
Large integer bounds are exact Python/JSON integers; consumers requiring binary64
must preserve them rather than silently rounding them into control limits.

`status=observed` describes a successful observation only. Regardless of metadata,
the report keeps `selected_family=null`, `live_authority=false`,
`live_relief=unavailable_unverified`, and application/restoration/receiver
continuity as `not_run`. Writability and a successful getter do not independently
prove live application, output effect, continuity or restoration. Missing mutable
flags are evidence gaps; no state-specific support is guessed.

There are no setters, state transitions, media pipelines, watchdogs, sockets,
mutation endpoints, journals, core imports or frame callbacks in this inspector.
Normal Gst initialization may load plugins/cache registry metadata. Run the
command explicitly outside capture callbacks; do not add periodic inventory work
to gameplay or telemetry loops.

## Source controls to inspect alongside the report

`camera_config.py` maps a launch profile to bitrate, FPS, CPU and quantizer values.
The camera builds fixed-framerate caps and a VP8 encoder in one pipeline.
`apps/web/src/lib/engine/streamProfiles.ts` supplies compound presets; switching one
is not an isolated live bitrate probe. N5's opted-in `n5_capture_pacer` adds a
50,000-microsecond delay to create a fault and restores its own value to zero.
That cleanup is not a general capture-cadence relief controller.

An installed `videorate` plugin is not an installed camera control. A future
controller needs separate generation/ownership, bounded application, independent
observations, abort/restoration and recovery evidence. Keep all families
unavailable until a controlled target-runtime trial qualifies one family.

The fake-boundary tests prove read-only behavior and retained failure semantics.
They do not establish physical timing, actual live Gst mutability or safe playback.

For explicit synthetic setter/output investigation, use the separately contained
[isolated bitrate trial](n10-bitrate-feasibility.md). It changes only a disposable
encoder and does not qualify a running camera or WebRTC receiver.
