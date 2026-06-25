import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const runtimeRoot = path.resolve(scriptDir, "..");

function getArgValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function hasArg(name) {
  return process.argv.includes(name);
}

function shellSingleQuote(value) {
  return `'${String(value).replaceAll("'", "'\"'\"'")}'`;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function loadLock(manifestPath) {
  const bytes = fs.readFileSync(manifestPath);
  const parsed = JSON.parse(bytes.toString("utf8"));
  if (!Array.isArray(parsed.packages) || parsed.packages.length === 0) {
    throw new Error("Native runtime lock manifest must include packages.");
  }
  return { hash: sha256(bytes), manifest: parsed };
}

function packageSmokeShell(packages, timeoutSeconds, expectedLockHash) {
  const packageJson = JSON.stringify(packages);
  return `
set -eu
if [ ! -f /app/native-runtime.lock.json ]; then
  echo "native-lock-missing:/app/native-runtime.lock.json"
  exit 1
fi
actual_lock_hash="$(node -e "const crypto=require('crypto');const fs=require('fs');process.stdout.write(crypto.createHash('sha256').update(fs.readFileSync('/app/native-runtime.lock.json')).digest('hex'))")"
if [ "$actual_lock_hash" != "${expectedLockHash}" ]; then
  echo "native-lock-mismatch:$actual_lock_hash"
  exit 1
fi

Xvfb :99 -screen 0 640x480x24 >/tmp/xvfb.log 2>&1 &
export DISPLAY=:99
export SDL_AUDIODRIVER="${process.env.SDL_AUDIODRIVER || "dummy"}"
sleep 1

node -e '
const fs = require("fs");
const packages = JSON.parse(process.argv[1]);
for (const pkg of packages) {
  if (!pkg.executable || !pkg.executable.startsWith("/usr/games/")) {
    console.error("native-invalid-executable:" + pkg.manifestId);
    process.exit(1);
  }
  try {
    fs.accessSync(pkg.executable, fs.constants.X_OK);
  } catch {
    console.error("native-missing-executable:" + pkg.manifestId + ":" + pkg.executable);
    process.exit(1);
  }
}
' ${shellSingleQuote(packageJson)}

${packages
  .map((pkg) => {
    const args = Array.isArray(pkg.args) ? pkg.args : [];
    const command = [pkg.executable, ...args].map(shellSingleQuote).join(" ");
    const logPath = `/tmp/native-${String(pkg.manifestId).replace(/[^a-zA-Z0-9._-]/g, "-")}.log`;
    return `
if timeout ${timeoutSeconds}s ${command} >${shellSingleQuote(logPath)} 2>&1; then
  echo "native-exited:${pkg.manifestId}"
  tail -80 ${shellSingleQuote(logPath)}
  exit 1
else
  code=$?
  if [ "$code" -eq 124 ]; then
    echo "native-running:${pkg.manifestId}"
  else
    echo "native-failed:${pkg.manifestId}:$code"
    tail -80 ${shellSingleQuote(logPath)}
    exit "$code"
  fi
fi`;
  })
  .join("\n")}
`;
}

function main() {
  const image =
    getArgValue("--image") ||
    process.env.NATIVE_RUNTIME_IMAGE ||
    "pixelated-engine-native:phase4";
  const manifestPath = path.resolve(
    getArgValue("--manifest") ||
      process.env.NATIVE_RUNTIME_LOCK_MANIFEST ||
      path.join(runtimeRoot, "native-runtime.lock.json"),
  );
  const timeoutSeconds = Number(getArgValue("--timeout-seconds") || 8);
  if (!Number.isFinite(timeoutSeconds) || timeoutSeconds < 1) {
    throw new Error("--timeout-seconds must be a positive number.");
  }

  const { hash, manifest } = loadLock(manifestPath);
  const shell = packageSmokeShell(manifest.packages, timeoutSeconds, hash);

  if (hasArg("--print-shell")) {
    process.stdout.write(shell);
    return;
  }

  const result = spawnSync("docker", ["run", "--rm", image, "sh", "-lc", shell], {
    encoding: "utf8",
    stdio: "pipe",
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }

  process.stdout.write(
    `Native runtime smoke passed for ${manifest.packages.length} package(s) in ${image}.\n`,
  );
}

try {
  main();
} catch (err) {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
}
