import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDockerRunArgs,
  buildPrepareEngineVolumeArgs,
  removeEngineContainerArgs,
} from "../../../main/docker/commands";

test("Docker run arguments preserve environment values without shell quoting", () => {
  const args = buildDockerRunArgs({
    advertisedUrls: ["http://localhost:8080"],
    allowedOrigins: "https://example.test,https://space test",
    apiUrl: "https://api.example.test/path?value=$HOME",
    companionUrls: ["https://192.168.1.20:8090"],
    engineImage: "pixelated-engine:test",
    engineRuntimeKind: "native_linux",
    engineToken: "token with $hell `chars`",
    exposureMode: "lan",
    includeUinputDevice: true,
    publishHost: "0.0.0.0",
    uinputGroupId: 123,
  });

  assert.ok(args.includes("10001:10001"));
  assert.ok(args.includes("--read-only"));
  assert.ok(args.includes("--cap-drop"));
  assert.ok(args.includes("no-new-privileges:true"));
  assert.ok(args.includes("/dev/uinput"));
  assert.ok(args.includes("123"));
  assert.ok(args.includes("pixelated-roms:/roms"));
  assert.ok(args.includes("PIXELATED_ENGINE_TOKEN=token with $hell `chars`"));
  assert.ok(args.includes("PIXELATED_ENGINE_RUNTIME_KIND=native_linux"));
  assert.ok(args.includes("PIXELATED_API_URL=https://api.example.test/path?value=$HOME"));
  assert.equal(args.at(-1), "pixelated-engine:test");
});

test("ROM volume migration has no network and only the chown capability", () => {
  assert.deepEqual(buildPrepareEngineVolumeArgs("pixelated-engine:test"), [
    "run",
    "--rm",
    "--network",
    "none",
    "--user",
    "0:0",
    "--cap-drop",
    "ALL",
    "--cap-add",
    "CHOWN",
    "--security-opt",
    "no-new-privileges:true",
    "-v",
    "pixelated-roms:/roms",
    "pixelated-engine:test",
    "chown",
    "-R",
    "10001:10001",
    "/roms",
  ]);
});

test("Docker removal uses fixed argument-array execution", () => {
  assert.deepEqual(removeEngineContainerArgs, ["rm", "-f", "pixelated-node"]);
});
