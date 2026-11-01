# Latency-fingerprinting research runtime

These opt-in modules support trace collection, bounded experiments and offline
qualification. Gameplay entry points remain in the runtime root. Moving these
modules does not enable probes or change the current qualification scope.

| Directory | Responsibility |
| --- | --- |
| `tracing/` | Camera stage trace configuration, hooks, recording and export |
| `trials/` | Explicit disposable capability, bitrate and cadence trials |
| `scenario_harness/` | Bounded N5 workloads, campaign lifecycle and evidence export |
| `live_probe_control/control/` | Contracts, cadence controller, ownership/binding, transport, journal and watchdog |
| `live_probe_control/peers/` | Camera workers, peer protocol/supervision/lifetime and receiver bridge |
| `live_probe_control/capture/` | Owned game capture and dedicated WebRTC/browser workers |
| `live_probe_control/qualification/` | Observation, continuity, resource/fault screens and qualification protocols |

`private_journal.py` supplies shared private journal I/O to N5 and live probes.
The `research.live_probe_control` package still exports its lifecycle controller
and contract types. Other modules use their owning subpackages directly.

Run Python modules from `engine/runtime`, for example:

```sh
python3 -m research.trials.live_probe_inventory
python3 -m research.trials.live_probe_cadence_trial --isolated-cadence-trial
```

The second command is an explicit disposable media experiment and requires the
native Linux/GStreamer dependencies. See the
[cadence procedure](../../../docs/research/n10/n10-cadence-feasibility.md) for its full setup.
Research drivers live in [`scripts/research/n10/`](../scripts/research/n10/).
Root-level [`scripts/research/n4/`](../../../scripts/research/n4/) and
[`scripts/research/n5/`](../../../scripts/research/n5/) supply synthetic fixture
exporters for the Python core.

Both runtime images copy this entire package. The native acquisition driver
recursively hashes its Python sources and its own harness sources. The frozen
game-browser v1 driver retains logical source identifiers and maps them to the
current files in its isolated worker dependency closure. Those identifiers are
wire bindings, not filesystem paths. Reorganizing files changes the source
context and does not requalify historical evidence.
