import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDockerRunArgs,
  removeEngineContainerArgs,
} from "../main/dockerCommands";

test("Docker run arguments preserve environment values without shell quoting", () => {
  const args = buildDockerRunArgs({
    advertisedUrls: ["http://localhost:8080"],
    allowedOrigins: "https://example.test,https://space test",
    apiUrl: "https://api.example.test/path?value=$HOME",
    companionUrls: ["https://192.168.1.20:8090"],
    engineImage: "pixelated-engine:test",
    engineToken: "token with $hell `chars`",
    exposureMode: "lan",
    includeUinputDevice: true,
    publishHost: "0.0.0.0",
  });

  assert.deepEqual(args.slice(0, 10), [
    "run",
    "-d",
    "--name",
    "pixelated-node",
    "-p",
    "0.0.0.0:8080:8080",
    "--device",
    "/dev/uinput",
    "-v",
    "pixelated-roms:/roms",
  ]);
  assert.ok(args.includes("PIXELATED_ENGINE_TOKEN=token with $hell `chars`"));
  assert.ok(args.includes("PIXELATED_API_URL=https://api.example.test/path?value=$HOME"));
  assert.equal(args.at(-1), "pixelated-engine:test");
});

test("Docker removal uses fixed argument-array execution", () => {
  assert.deepEqual(removeEngineContainerArgs, ["rm", "-f", "pixelated-node"]);
});
