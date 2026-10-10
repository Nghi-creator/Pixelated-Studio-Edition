# N5 scenario-harness handoff

**Updated:** 2026-10-10. Step 1 starting software baseline and ownership inventory
are complete locally. The detached core's active `docs/plans/NEXT_IMPLEMENTATION_PLAN.md`
now specifies N5 (Phase 1.3). Scenario/phase/evidence/cleanup contracts are next;
no new runner or live fault trial was implemented in this baseline step.

Inspected producer surfaces are runtime process/launcher ownership, camera trace
lifecycle, browser collector/export controls, healthy/degraded/relief research
configuration and existing smoke/interaction cleanup helpers. These are reusable
starting points, not a scenario controller or measured-effect verification system.
The core's existing bounded CPU-pressure helper likewise remains experiment-only.

N5 keeps runtime hooks, bounded actions and capture in this testbed; detached
manifest validation and offline inspection belong to the core. Warm-up, probe,
recovery and cooldown require an additive experiment contract rather than changing
research-v2 phase enums or N4 traces. Requested fault startup must remain separate
from measured effects and verified restoration. Mixed/changing cases follow stable
single causes; unsupported adapters cannot count toward real acceptance.

[Existing N4 tracing/export](n4-stage-trace-export.md) remains delivered in software.
Its Linux capture, fresh post-warm-up recording control, browser/picker and all
paired overhead gates remain pending. N5 can implement shared lifecycle/control;
starting the new slice does not pass those gates or complete Phase 1.

Reproduced local baseline: 714 Node tests pass with one existing artifact skip,
all 42 nested Python trace cases pass, whole-workspace lint/lockfiles, API
TypeScript checks and production web build pass. Actual Node 24/hosted execution
and real Linux runtime measurements remain unverified. No live pressure, network
shaping, hosted smoke request, deployment or new dependency was run in Step 1.
