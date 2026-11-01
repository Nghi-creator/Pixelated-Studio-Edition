# Latency-fingerprinting research guides

These guides describe the producer's opt-in research behavior, evidence
contracts and reusable operator procedures. Personal plans and acquisition
receipts belong in ignored `local/`.

| Slice | Scope and starting points |
| --- | --- |
| [N4](n4/) | [Host tracing](n4/n4-host-stage-tracing.md), [browser tracing](n4/n4-browser-stage-tracing.md) and [standalone trace export](n4/n4-stage-trace-export.md) |
| [N5](n5/) | [Scenario harness](n5/n5-scenario-harness.md), [lifecycle](n5/n5-lifecycle.md), [adapters](n5/n5-adapters.md), [export](n5/n5-experiment-export.md), [reproduction](n5/n5-experiment-reproduction.md) and [live test procedure](n5/n5-live-test-procedure.md) |
| [N10](n10/) | [Capability inventory](n10/n10-capability-inventory.md), [local owner](n10/n10-local-owner.md), [native acceptance](n10/n10-browser-native-acceptance.md), [resource/fault evidence](n10/n10-full-span-cost.md) and [qualification protocol](n10/n10-qualification-protocol.md) |

Slice numbers follow the sibling Python core's roadmap. N6–N9 contracts are
owned by that core and do not require duplicate producer guides here.

Runtime modules are indexed in the [research layout](../../engine/runtime/research/README.md),
and tests in the [Python test inventory](../../engine/runtime/tests/python/README.md).
Moving guides does not change their evidence limits, acceptance requirements or
control defaults.
