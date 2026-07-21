# Agent Working Rules

Last updated: 2026-07-22

## Git Ownership

The user owns all Git history and publication actions.

Agents may inspect Git state and history with read-only commands such as
`git status`, `git diff`, `git log`, and `git show`.

Agents must not perform any of the following unless the user explicitly asks
for that exact action in the current message:

- Stage files with `git add`.
- Create or amend commits.
- Create, switch, rename, or delete branches.
- Merge, rebase, cherry-pick, revert, or reset commits.
- Push or force-push branches or tags.
- Create, merge, or close pull requests.
- Create or push tags.

After making changes, agents should:

1. Run the relevant tests, builds, lint checks, and packaging commands.
   Use `operations.md` to map touched paths to GitHub Actions checks.
2. Report which checks passed or failed.
3. Leave all changed files unstaged.
4. Tell the user how to manually test the behavior.
5. Let the user review, stage, commit, push, and merge the changes.

## UI Rules

- Dropdown menus whose position matters use the shared custom select pattern.
  Anchor the menu below the field, keep the chevron inside the input, and leave
  enough right padding for the selected value.
- Size modals to their content. Compact controls before increasing width and
  prefer the smallest explicit content cap that avoids wrapping or dead space.
