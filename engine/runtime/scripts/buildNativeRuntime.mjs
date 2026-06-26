import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import {
  loadNativeRuntimeLock,
  nativeRuntimeImageTag,
  runtimeRoot,
} from "./nativeRuntimeLock.mjs";

function getArgValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function hasArg(name) {
  return process.argv.includes(name);
}

function main() {
  const manifestPath = path.resolve(
    getArgValue("--manifest") ||
      process.env.NATIVE_RUNTIME_LOCK_MANIFEST ||
      path.join(runtimeRoot, "native-runtime.lock.json"),
  );
  const { hash, manifest } = loadNativeRuntimeLock(manifestPath);
  const image = getArgValue("--image") || nativeRuntimeImageTag(manifest, hash);
  const dockerfile = path.join(runtimeRoot, "Dockerfile.native");
  const args = [
    "build",
    "-t",
    image,
    "-f",
    dockerfile,
    "--build-arg",
    `NATIVE_RUNTIME_ID=${manifest.runtimeId}`,
    "--build-arg",
    `NATIVE_RUNTIME_LOCK_SHA256=${hash}`,
    runtimeRoot,
  ];

  if (hasArg("--print")) {
    process.stdout.write(`docker ${args.map((arg) => JSON.stringify(arg)).join(" ")}\n`);
    process.stdout.write(`image=${image}\n`);
    process.stdout.write(`lockSha256=${hash}\n`);
    return;
  }

  const result = spawnSync("docker", args, {
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);

  process.stdout.write(`Native runtime image built: ${image}\n`);
  process.stdout.write(`Native runtime lock SHA-256: ${hash}\n`);
}

try {
  main();
} catch (err) {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
}
