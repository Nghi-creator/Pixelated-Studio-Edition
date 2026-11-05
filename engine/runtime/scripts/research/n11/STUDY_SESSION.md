# Frozen study allocation and one-session execution

`studySession.mjs` extracts the reusable allocation/session loop from private N11
run scripts. It imports the existing condition acquisition and source/receipt
contracts. Machine paths, protocol choices, block IDs and session evidence are
caller inputs. Historical frozen scripts and run receipts remain private.

```sh
node engine/runtime/scripts/research/n11/studySession.mjs allocate /path/to/allocation-config.json
node engine/runtime/scripts/research/n11/studySession.mjs run /path/to/session-config.json
```

Allocation configuration:

```json
{
  "protocolFile": "/absolute/reviewed-protocol.json",
  "directory": "/absolute/new-study-directory",
  "coreRevision": "FULL_40_CHARACTER_CORE_COMMIT",
  "coreDirectory": "/absolute/core",
  "python": "/absolute/core/.venv/bin/python",
  "verificationCommand": ["/absolute/core/.venv/bin/python", "/absolute/case-processor.py"],
  "dependencyFiles": {
    "/absolute/case-processor.py": "sha256:EXPECTED_64_HEX_DIGEST",
    "/absolute/core/docs/analysis/N3_FEATURE_POLICY_SPEC.json": "sha256:EXPECTED_64_HEX_DIGEST"
  }
}
```

Use real revisions/digests, not the illustrative placeholders. Include the core
source dependency closure, processor and policy in `dependencyFiles`; paths are
absolute. `verificationCommand` is an argument vector, never a shell string. The
runner appends exactly one case-directory argument, captures its stdout in the
case directory, and requires exit status zero. The core tracked
`experiments/verify_native_exports.py --write-derived` can process new condition
cases; see the core N11 operator tools guide for its complete argument vector.
Python is also used to inspect protocol metadata with the core SDK. Allocation
requires reviewed declarations and matching producer source, but grants no
acquisition or independence authority. The output root must not already exist;
partial allocations remain on failure and are not retried in place.

Run configuration selects exactly one training block:

```json
{
  "directory": "/absolute/new-study-directory",
  "blockId": "cal-02",
  "contextFile": "/absolute/actual-session-context.json"
}
```

The separately recorded context must have matching `block_id`, `host_id` and
`session_id`, nonempty `boundary_description` and `documented_by`, a valid past
`recorded_at_utc`, and `known_cross_session_correlations` (an array). Context is an
operator declaration; the tool cannot authenticate a physical session boundary.
Known correlations stop execution for regrouping instead of inflating block counts.
The declared context does not resolve an ambiguous study-design boundary rule.

The tool checks protocol, tool, source, dependency and plan hashes before capture,
and source/dependency hashes before and after every case. Existing outputs or
attempt leases stop preflight. Only the selected block is executed; evaluation is
rejected. A case/verification failure retains start/result evidence, stops the
remaining suffix and prevents block retry. Successful states explicitly mean the
configured verification command passed; no diagnosis, accuracy, independence or
empirical acceptance is inferred. Original condition acquisition still owns its
native cleanup and attempt lease.

Adding or changing these tracked acquisition tools changes the source receipt.
Preserve earlier frozen protocols/plans; new collection needs newly reviewed
source pins. Never silently update a frozen allocation to make it executable.
