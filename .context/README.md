# Project Context Index

Use this file as the entry point for project documentation under `.context/`.
Keep this directory small. It should contain durable project memory, active
runbooks, and test fixtures that are intentionally checked in.

## Current Sources Of Truth

- `current-infrastructure.md`: deployed and local architecture, runtime
  boundaries, and operational behavior.
- `agent-rules.md`: persistent agent/Git ownership rules for this repository.
- `project-flows.md`: compact runtime flow map for boot, pairing, gameplay,
  multiplayer, submissions, and hosted deploys.
- `target-architecture-refurbishment.md`: durable ownership boundaries and
  architectural direction.

## Active Operational Checklists

- `backend-hosting-checklist.md`: hosted deploy gates, environment variables,
  health checks, and smoke commands.
- `lan-manual-smoke-checklist.md`: manual two-device LAN validation.
- `docker-onboarding-validation.md`: desktop Docker onboarding validation and
  remaining platform proof.

## Catalog Intake Fixtures

- `curated-rom-manifest-guide.md`: human workflow for legally reviewed ROM
  intake.
- `curated-rom-manifest-template.json`: template for curated ROM manifests.
- `phase1-libretro-smoke-catalog.json`: libretro smoke catalog fixture used by
  engine runtime tests.
- `phase5-curated-roms.json`: curated import fixture used by API tests.

## What Does Not Belong Here

- Completed implementation plans.
- Old audit ledgers or recommendation logs.
- Generated smoke output.
- Large evidence bundles.

Generated smoke output defaults to `.artifacts/`, which is ignored by Git. Only
move evidence into `.context` if the user explicitly asks to preserve it as
project memory.
