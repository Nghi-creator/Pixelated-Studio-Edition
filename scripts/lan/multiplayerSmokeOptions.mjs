const DEFAULT_ENGINE_URL = "http://127.0.0.1:8080";
const DEFAULT_OUT_DIR = ".artifacts/lan-smoke";
const DEFAULT_TIMEOUT_MS = 120000;
const DEFAULT_POLL_MS = 2000;
export function printUsage() {
  console.log(`Usage:
  node scripts/lan/multiplayerSmoke.mjs [options]

Options:
  --engine-url <url>        Engine or HTTPS companion origin. Default: ${DEFAULT_ENGINE_URL}
  --invite-code <code>      Redeem this LAN companion invite and automate guest join.
  --expected-guests <n>     Number of new camera peers to wait for. Default: 1
  --session-id <id>         Require this active engine session id.
  --timeout-ms <ms>         Wait timeout for join/disconnect phases. Default: ${DEFAULT_TIMEOUT_MS}
  --poll-ms <ms>            Health poll interval. Default: ${DEFAULT_POLL_MS}
  --out-dir <path>          Artifact directory. Default: ${DEFAULT_OUT_DIR}
  --label <name>            Artifact label. Default: lan-multiplayer-smoke
  --notes <path>            Copy completed manual notes into the bundle.
  --skip-disconnect         Do not wait for guest peer cleanup after join validation.
  --help                    Show this help.

Environment:
  PIXELATED_ENGINE_TOKEN    Host engine token required to control telemetry capture.
  NODE_EXTRA_CA_CERTS        PEM certificate/CA file trusted by Node at startup.

Flow:
  1. Start the host game and wait for the host stream to play.
  2. For HTTPS companion smoke, trust its certificate in Node via NODE_EXTRA_CA_CERTS
     and in the browser, then pass --invite-code.
  3. The harness preflights/redeems the invite and joins a synthetic spectator peer.
  4. Host and real guest browser telemetry is captured through Stream Stats.

Reports include camera peer counts, session survival checks, input mode, engine
process CPU/RSS snapshots from /health, directly captured host/guest telemetry,
and a manual pass/fail notes template.
`);
}
export function parseArgs(argv, environment = process.env) {
  const options = {
    engineUrl: DEFAULT_ENGINE_URL,
    engineToken: environment.PIXELATED_ENGINE_TOKEN || "",
    expectedGuests: 1,
    inviteCode: null,
    label: "lan-multiplayer-smoke",
    notesPath: null,
    outDir: DEFAULT_OUT_DIR,
    pollMs: DEFAULT_POLL_MS,
    sessionId: null,
    skipDisconnect: false,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length || argv[index].startsWith("--")) {
        throw new Error(`Missing value for ${arg}`);
      }
      return argv[index];
    };
    if (arg === "--help") {
      return { ...options, help: true };
    }
    else if (arg === "--engine-url") {
      options.engineUrl = next();
    }
    else if (arg === "--expected-guests") {
      options.expectedGuests = Number(next());
    }
    else if (arg === "--invite-code") {
      options.inviteCode = next().trim();
    }
    else if (arg === "--session-id") {
      options.sessionId = next();
    }
    else if (arg === "--timeout-ms") {
      options.timeoutMs = Number(next());
    }
    else if (arg === "--poll-ms") {
      options.pollMs = Number(next());
    }
    else if (arg === "--out-dir") {
      options.outDir = next();
    }
    else if (arg === "--label") {
      options.label = next();
    }
    else if (arg === "--notes") {
      options.notesPath = next();
    }
    else if (arg === "--allow-self-signed") {
      throw new Error("--allow-self-signed is no longer supported. Trust the companion certificate with NODE_EXTRA_CA_CERTS=/path/to/certificate.pem before starting Node.");
    }
    else if (arg === "--skip-disconnect") {
      options.skipDisconnect = true;
    }
    else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  if (!Number.isInteger(options.expectedGuests) || options.expectedGuests < 1 || options.expectedGuests > 16) {
    throw new Error("--expected-guests must be an integer in 1..16.");
  }
  if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs <= 0 || options.timeoutMs > 600000) {
    throw new Error("--timeout-ms must be an integer in 1..600000.");
  }
  if (!Number.isSafeInteger(options.pollMs) || options.pollMs <= 0 || options.pollMs > Math.min(options.timeoutMs, 60000)) {
    throw new Error("--poll-ms must be an integer in 1..min(timeout, 60000).");
  }
  const url = new URL(options.engineUrl);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash)
    throw new Error("Engine URL must be an HTTP(S) base without credentials, query or fragment.");
  options.engineUrl = options.engineUrl.replace(/\/+$/, "");
  return options;
}
