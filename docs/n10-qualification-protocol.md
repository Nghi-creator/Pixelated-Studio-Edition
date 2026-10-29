# Qualification protocol declarations

`live_probe_control.qualification_protocol` checks an operator's proposed
qualification protocol without running an acquisition, inspecting evidence,
approving review claims or enabling a controller. It is separate from frozen
core evidence roots, engineering controller configuration and producer activation.

Generate a new draft under ignored `local/` from the repository root:

```sh
PYTHONPATH=engine/runtime python3 - <<'PY'
import json
from pathlib import Path
from live_probe_control.qualification_protocol import draft
with Path('local/n10-qualification-draft.json').open('x') as output:
    output.write(json.dumps(draft(), indent=2) + '\n')
PY
PYTHONPATH=engine/runtime python3 -m live_probe_control.qualification_protocol \
  local/n10-qualification-draft.json
```

The version is `n10-qualification-protocol-draft-v1`, role
`operator_planning_only`, with `live_authority=false`. Input is bounded to64KiB,
closed fields and procedure versions, duplicate-safe JSON and finite typed values.
The checker reads only the supplied protocol file; nested references are text
and are not opened or executed. Inspection does not modify the draft.

## Required declarations

| Group | Required content |
| --- | --- |
| Context | Exact image, final source hash and browser; the initial supported proposal is an owned Linux/aarch64 game capture with a Darwin/arm64 headless receiver, balanced1500kbps,640×480, VP8 CPU-used6/quantizer48. Other contexts require a separate protocol revision. |
| Operation | Baseline/target cadence, duration and bounded controller policy. The fixed30→24 FPS/five-second proposal and its budgets come from engineering limits; generation does not qualify them. A different rate/duration requires separate procedure versions. The full reservation must fit the cumulative budget; the typed engineering envelope still applies. |
| Cost limits | Explicit maximum, units, comparison, interval, rationale and review reference for each fixed metric slot. Action container/browser/worker CPU and worker sampled RSS use action-minus-unchanged pairs; fault totals use absolute CPU-seconds before dispatch through cleanup callbacks. Limits remain null until decided. |
| Quality | Procedures, criteria and review references for cadence, perceptual quality, audio and supported desktop workflows. A procedure must explicitly state any scope exclusion; headless video proxies do not establish desktop/audio acceptance. |
| Additional faults | Decide whether whole-camera death and controller-thread-only failure are required or excluded. A required case needs a procedure; an exclusion needs rationale and review reference. Stopped-worker teardown does not establish either case. |
| Unmeasured scopes | Decide whether initial source startup, later process/container/browser exit, individual ancillary breakdown and browser cleanup/RSS/GPU costs are accepted exclusions or must be measured. A measurement requirement needs its own procedure; acceptance needs a scoped rationale and review reference. |
| Review and acquisition | Protocol revision, review reference, independence rationale and fixed prospective retention rules. These are supplied declarations, not authenticated approvals. |

The fixed procedure inventory covers read-only observer comparison, matched
full-span action costs, actual cancellation/loss/reconnect costs, stopped-worker
costs and Linux native guard regressions. Changing a procedure's meaning or version
requires a new protocol revision rather than silently substituting another screen.
Cost scopes overlap or use independent clocks; the protocol cannot authorize
adding them into a synchronized system total.

## Results and the qualification sequence

`invalid` means a declaration violates the closed contract. `draft_incomplete`
retains every missing decision by field path. `complete_declarations_unverified`
means the declared fields are complete and structurally consistent. Exit0 means
only this last state; incomplete or invalid inputs exit1. All states retain
`review_verified=false`, `qualification=unavailable_protocol_is_not_evidence` and
`activation=not_implemented_by_this_tool`. A review-reference string is not proof
of review, and no result is a dispatch capability or approved policy.

Use the protocol in this order:

1. Decide supported scope, cost/quality limits, required faults and exclusions;
   justify limits independently of development receipt distributions.
2. Review those decisions and the actual measurement coverage. Complete and check
   the declarations. A complete file still needs external review and a final
   source/context freeze before qualification acquisition.
3. Freeze independent qualifying cases, exact context, criteria and output paths.
   Retain all original attempts; no retries, substitution, averaging away failures
   or hidden alignment of browser/native clocks. Historical sources need explicit
   applicability review and cannot be renamed into the frozen context.
4. Assess new observations and supported workflow acceptance against that protocol,
   retaining unavailable and failed gates. Bind an accepted decision and limits to
   an explicit capability/policy revision before implementing supported activation.

The current checker performs none of steps2–4's review, acquisition, evidence
acceptance or activation. Normal production sources retain their engineering
control guard. N9 proposals, old record hashes, a caller's filled JSON or this
checker's exit status cannot authorize mutation. The core
[qualification requirements](../../latency_fingerprinting/docs/live_probes/N10_QUALIFICATION.md)
state the broader evidence and producer boundary.

The v1 draft's fixed procedure and cost slots cover the observer, matched action,
four original fault cases and stopped worker. The separate controller-thread
exit/block and whole-camera-death methods require explicit procedure and metric
slots in a new protocol revision before their costs can be required for
qualification. In particular, whole-camera descendant cleanup is a different
interval from camera cleanup callbacks. Adding free-text fault references to a
v1 draft does not add those metric slots or qualify the additional evidence.
