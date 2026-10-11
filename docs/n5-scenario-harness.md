# N5 scenario-harness handoff

**Updated:** 2026-10-11. Steps 1–4 software gates are complete locally. The
sibling core's active `docs/plans/NEXT_IMPLEMENTATION_PLAN.md` specifies N5
(Phase 1.3). Its frozen experiment contract, capability matrix, independent
examples and three strict models/schemas preserve prior research-v2/N4 meanings.
Standalone validation does not verify artifact hashes or recompute effects.

[Step 4 lifecycle/recording guide](n5-lifecycle.md) describes the delivered
stdlib-only runner, single-owner private lease/journal, exact-generation recovery,
monotonic deadlines and explicit fresh recording control for one opted-in peer.
The camera retires old probes behind a bounded source barrier and starts new
collectors/clocks for healthy/degraded/probe/recovery. Failed ownership/cleanup
remains visible. Both runtime image COPY lists include the new modules.

Step 5 is next: concrete draining-peer/workload and bounded owned CPU adapters,
native child identity/handshake records, TERM/KILL/reap, worker CPU collection and
fixed measured-effect predicates. The Step 4 runner currently requires trusted
cooperative hooks and is exercised with fake runtime dependencies. It cannot
preempt an arbitrary blocking Python/GI hook or certify a live adapter. No N5
experiment CLI or real fault trial is delivered yet. Bundle export/inspection
remains Step 6; independent new fixture pins remain Step 7.

V1 approves healthy and host contention for implementation. Other fault classes
and mixed/changing scenarios remain unsupported. Startup is separate from effect
verification and scientific causality; no failed restoration becomes a successful
trial. Existing pressure helpers/smoke scripts do not already meet this contract.
The producer owns runtime hooks, actions and capture; detached validation and
offline inspection remain in the sibling core with no callback dependency.

Final Step 4 producer checks: 185 API, 135 engine, 245 web, 90 desktop and 61
smoke/security tests pass, **716 total**, with one existing external-artifact engine
skip. **70** nested Python cases pass (50 trace/control and 20 lifecycle/lease).
Whole-workspace lint/lockfile checks, final engine lint/build and N4 synthetic
producer→core API/CLI pinned reproduction pass. Step 1's API typecheck and
production web build remain historical results; those unchanged paths were not
rebuilt separately here. No new dependency or fixture release was introduced.

[Existing N4 tracing/export](n4-stage-trace-export.md) remains delivered. Fresh
recording control is now available in software, but actual Linux/Xvfb/PulseAudio
capture, draining receiver, real callbacks/picker and every paired overhead trial
remain pending. No live pressure, host networking change, deployment, container
build, actual Node 24 or hosted verification was run. Healthy plus one approved CPU
class cannot satisfy Phase 1.3's two real bottleneck-class gate or complete Phase 1.
