# Dependabot safe merge

The `Dependabot Safe Merge` workflow is **disabled by default**. It can squash
merge routine `npm-types-patches` PRs after CI completes. It does not approve
reviews, bypass branch rules, or enable GitHub's pending auto-merge feature.
The merge API must accept the exact commit that passed the policy checks.

## Initial scope

Only patch upgrades to these existing development dependencies qualify:
`@types/node`, `@types/react`, `@types/react-dom`, `@types/qrcode`, `@types/cors`,
`@types/express`, and `@types/multer`. Every changed locked version must have
been published on npm for at least seven days. This is release age, not PR age.

Security update groups, GitHub Actions, runtime dependencies, Electron, build
tools, minor/major upgrades, dependency additions/removals, and changed
dependency graphs remain manual. Even an allowed type patch stays manual if it
changes other lockfile metadata or updates a transitive package outside the
allowlist. This intentionally favors leaving a PR for review over broadening
the merge policy. A cooldown reduces exposure to newly published releases; it
does not prove that a package is safe.

The privileged job checks out only trusted default-branch policy code. It
does not execute PR code, install PR dependencies, or download PR artifacts.
It verifies the PR author, signed commits, same-repository origin, file scope,
JSON changes, npm release age/integrity, branch rules, and current CI results.
Missing data or failed API calls leave the PR unmerged.

## Activation

1. Review and merge the configuration, workflow, policy, tests, and this guide
   into `main`. The workflow runs only from `main`.
2. In **Settings → Rules → Rulesets**, configure an active rule for `main`:
   require pull requests and require branches to be up to date before merging.
   Require every check below, selecting **GitHub Actions** as its expected
   source. Do not give GitHub Actions a ruleset bypass. Keep existing review,
   conversation-resolution, and other protections.

   - `API contract`
   - `Hosted web and smoke contract`
   - `npm audit production dependencies (root, .)`
   - `npm audit production dependencies (web, apps/web)`
   - `npm audit production dependencies (desktop, apps/desktop)`
   - `npm audit production dependencies (api, services/api)`
   - `npm audit production dependencies (engine-runtime, engine/runtime)`
   - `Secret pattern scan`
   - `Engine image security (libretro)`
   - `Engine image security (native)`
   - `CodeQL`

   The workflow also requires `macOS DMG`, `Windows NSIS`, and `Ubuntu AppImage`
   when desktop or engine files change. These path-filtered jobs should not be
   made unconditional required checks: web-only PRs do not run them.

3. Keep squash merging enabled. No PAT, new GitHub App, or repository
   **Allow auto-merge** toggle is needed. The workflow uses the short-lived
   `GITHUB_TOKEN` and respects required reviews; it cannot supply those reviews.
4. In **Actions → Dependabot Safe Merge → Run workflow**, select `main` and
   enter an eligible PR number. This manual trigger is always a **dry run**,
   even after activation. It exits unsuccessfully with a reason when the PR
   is ineligible. An eligible dry run reports that nothing was merged.
5. Set the repository Actions variable `DEPENDABOT_AUTOMERGE_ENABLED` to
   exactly `true` under **Settings → Secrets and variables → Actions → Variables**.
   Future successful PR CI completions will evaluate eligible PRs for merging.
   Delete this variable or set it to `false` to disable future runs. To stop
   work already in progress, also cancel active `Dependabot Safe Merge` runs.

An existing PR with completed CI is not merged just by enabling the variable.
Re-run its CI to trigger evaluation. If a gate was still pending or GitHub had
not calculated mergeability, the PR remains open; a later CI completion retries
evaluation. There is no polling loop and failed merge writes are not retried.
Lockfile consistency failures require manual reconciliation before merging.

## Deployment behavior

Merges made with `GITHUB_TOKEN` do **not** trigger subsequent `push` workflows.
In particular, this project's `Hosted Deploy` workflow will not automatically
run after one of these merges. If a deployment is wanted, manually run
`Hosted Deploy` on `main`; its existing gates still apply. These initial
auto-merges update type packages only. Do not replace the token with a broad
PAT to work around this behavior without reviewing the deployment design.
See [GitHub's workflow-trigger documentation](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow).

## Local verification

Run `node --test scripts/security/dependabotAutomerge.test.mjs` and
`npm run test:smoke`. The policy tests use mocked API responses and never merge
a real PR. The manual GitHub dry run is the integration check for actual
repository permissions, ruleset configuration, and live Dependabot PR data.

The existing npm cooldown does not delay Dependabot security updates; those
PRs remain manual under this policy. See the
[Dependabot options reference](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference#cooldown).
