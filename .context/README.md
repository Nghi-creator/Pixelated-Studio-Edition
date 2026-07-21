# Project Context Index

Use this file as the entry point for project documentation under `.context/`.
Keep this directory small. It should contain durable project memory, active
runbooks, and test fixtures that are intentionally checked in.

## Current Sources Of Truth

Agents should read `agent-rules.md` and `operations.md` before making large,
cross-package, workflow, deploy, smoke-test, lockfile, or PR-scale changes.

- `architecture.md`: deployed/local ownership boundaries and runtime flows.
- `agent-rules.md`: persistent agent/Git ownership rules for this repository.
- `operations.md`: verification matrix, deploy/smoke commands, CI tripwires,
  artifact policy, and remaining desktop release validation.
- `research-validation.md`: implemented research evidence contract and current
  experiment procedure.

## Active Operational Checklists

- `lan-manual-smoke-checklist.md`: manual two-device LAN validation.

## Catalog Intake Fixtures

- `curated-rom-manifest-guide.md`: human workflow for legally reviewed ROM
  intake.
- `curated-rom-manifest-template.json`: template for curated ROM manifests.

Test-only catalog fixtures live with the tests that consume them, not in
`.context`.

## What Does Not Belong Here

- Completed implementation plans.
- Old audit ledgers or recommendation logs.
- Generated smoke output.
- Large evidence bundles.

Generated smoke output belongs in `.artifacts/`, which is ignored by Git. Do
not move run output into `.context`; durable conclusions should be summarized
in the relevant runbook instead.
