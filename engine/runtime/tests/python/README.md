# Python runtime regressions

Tests are grouped by responsibility, with native integration tests beside the
unit tests for the same component.

| Directory | Coverage |
| --- | --- |
| `tracing/` | Camera stage collectors, hooks, export and shutdown |
| `scenarios/` | N5 adapters, campaigns, effects, pacing, export and reproduction |
| `live_probes/control/` | Controller, local owner, dispatch and controller-thread faults |
| `live_probes/peers/` | Peer protocol/supervision, camera workers and receiver bridge |
| `live_probes/capture/` | Owned capture, game fixture, browser and WebRTC workers |
| `live_probes/trials/` | Inventory, bitrate and cadence trials |
| `qualification/observation/` | Observer, continuity and control-disturbance screens |
| `qualification/costs/` | Resource, action-span and failure-lifecycle costs |
| `qualification/protocols/` | Frozen qualification protocol versions |
| `support/` | Shared scenario fixtures and executable native fault helper |

Run the full suite from `engine/runtime`:

```sh
python3 -m unittest discover -s tests/python -v
```

For one group, retain the discovery root with `-t` so shared test imports resolve:

```sh
python3 -m unittest discover -s tests/python/tracing -t tests/python -v
python3 -m unittest discover -s tests/python/qualification/costs -t tests/python -v
```

Keep the package `__init__.py` files: recursive unittest discovery requires them
on supported Python versions. Import shared test fixtures using their group
names, such as `from tracing.test_camera_trace import Clock`.

Native media and pidfd integration tests require the disposable Linux runtime
and `N10_NATIVE_PEER_TESTS=1`. They are not desktop acceptance tests. See the
[peer-worker procedure](../../../../docs/research/n10/n10-peer-workers.md) for setup and
containment. The engine's Node test wrappers also run the tracing, scenario and
live-probe unit groups through unittest discovery.
