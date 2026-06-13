# Docker Onboarding Validation

Last updated: 2026-06-13

## Automated Release Gate

`.github/workflows/desktop-release-validation.yml` runs the desktop diagnostic
contracts, builds the native installer, and executes the packaged `app.asar`
smoke on:

| Runner | Native artifact | Coverage |
| --- | --- | --- |
| `macos-14` | DMG | macOS packaging and shared Docker contracts |
| `windows-latest` | NSIS `.exe` | Windows packaging and shared Docker contracts |
| `ubuntu-latest` | AppImage | Linux packaging and shared Docker contracts |

The shared tests cover missing CLI, stopped daemon, Windows named-pipe failure,
Linux permission denial, WSL 2/virtualization failure, disk full, invalid
context, timeout, trusted start locations, readiness success, cancellation, and
sanitized diagnostics.

## Local Apple Silicon Validation

Validated on 2026-06-13:

- Platform: macOS 26.5, arm64.
- Native DMG packaging: passed.
- Packaged `app.asar` smoke: passed.
- Docker CLI discovery: passed.
- Safe missing-CLI probe: classified as `cli_missing`.
- Real intervention/config failure: Docker returned permission denied for the
  local Docker socket and classified as `permission_denied`, with the macOS
  troubleshooting guide rather than Linux-only socket-group instructions.
- Trusted Docker Desktop discovery: `/Applications/Docker.app`.

## Manual Validation Still Required

Automated fixtures and packaging do not replace these real-machine checks:

| Platform | Missing | Stopped/start-resume | Ready/full startup | Permission/config |
| --- | --- | --- | --- | --- |
| macOS Apple Silicon | Pending | Pending | Pending | Permission case observed |
| macOS Intel | Best effort | Best effort | Best effort | Best effort |
| Windows 11 + WSL 2 | Pending | Pending | Pending | Pending |
| Ubuntu LTS | Pending | Pending | Pending | Pending |

Record the installer version, OS version, observed diagnostic, recovery action,
and result when completing a manual row. Do not mark a platform validated from
classifier fixtures alone.

## Production Readiness Backlog

Before calling Docker onboarding production-ready:

1. Push and confirm the macOS, Windows, and Ubuntu GitHub Actions matrix passes.
2. Manually test Windows 11 + WSL 2 and Ubuntu with Docker missing, stopped,
   and ready.
3. Test the full macOS stopped-Docker flow:
   **Initialize Engine → Start Docker → automatic resume**.
4. Add code signing and notarization before public distribution. The current
   macOS DMG is unsigned.
5. Consider privacy-safe telemetry for diagnostic categories and recovery
   success rates, without recording raw logs or paths.
6. Consider Docker version compatibility checks and warnings for unsupported or
   outdated versions.
7. Later, add an in-app release/update mechanism so users receive fixes without
   reinstalling manually.
