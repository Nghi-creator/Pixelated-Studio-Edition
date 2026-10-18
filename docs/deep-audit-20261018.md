# Deep audit — 2026-10-18

Companion HTTP and WebSocket proxies now handle response errors and disconnects
in both directions, cancel abandoned upstream work, and avoid writing a second
HTTP response after headers. Graceful WebSocket closure preserves buffered output.
The health probe has a total deadline and a 64 KiB body cap, handles aborted/error
responses, and closes resources. Proxy token/header/path helpers now reuse shared
companion utilities. Broken links to the deleted auto-merge guide now point to
the current workflow and enforced policy.

Regressions cover seven previously failing proxy cases, health-stream errors and
timed-out probes, graceful closure, and a real 128 KiB streaming upload/download.
Final verification passes 814 Node tests (desktop 106), with one existing game
artifact skip, across local Node 24.18.0 and Node 26.4.0 runs. Workspace lint/builds,
hosted browser/TLS contracts, API verification and advisory audits pass. The
companion core passes all 2,038 tests on Python 3.13.13 and a fresh Python 3.11.17
environment. Its full record is in `experiments/deep-audit-20261018/` in the sibling
research repository; original live reports and fixture pins remain unchanged.

Manual verification: restart the engine during companion HTTP/stream traffic,
confirm the desktop remains responsive and reconnection works, then complete a
normal LAN stream and upload. Hosted Linux/image/CodeQL/platform checks and final
manual sign-off remain open. Docker's daemon was unavailable. Changes remain
unstaged; no publication or remote setting changes were performed.
