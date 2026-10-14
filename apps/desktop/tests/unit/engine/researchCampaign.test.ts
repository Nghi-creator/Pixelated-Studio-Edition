import assert from "node:assert/strict";
import test from "node:test";
import { buildDockerRunArgs } from "../../../main/docker/commands";

const options = {
  advertisedUrls: ["http://127.0.0.1:8080"], allowedOrigins: "http://localhost",
  apiUrl: "http://localhost:3000", companionUrls: [], engineImage: "pixelated-engine",
  engineToken: "token", exposureMode: "local" as const,
  includeUinputDevice: false, publishHost: "127.0.0.1",
};

test("normal engine startup has no campaign volume or trace flags", () => {
  const args = buildDockerRunArgs(options);
  assert.ok(!args.includes("pixelated-n5:/n5"));
  assert.ok(!args.some(arg => arg.startsWith("PIXELATED_N5_")));
  assert.ok(!args.includes("PIXELATED_STAGE_TRACE=1"));
});

test("explicit research startup preserves isolation and requires a workload declaration", () => {
  assert.throws(() => buildDockerRunArgs({ ...options, researchCampaign: true }));
  assert.throws(() => buildDockerRunArgs({ ...options, researchCampaign: true, researchWorkloadId: "private/path", researchWorkloadSeed: 7 }));
  const args = buildDockerRunArgs({ ...options, researchCampaign: true, researchWorkloadId: "workload-1", researchWorkloadSeed: 7 });
  assert.ok(args.includes("pixelated-n5:/n5"));
  assert.ok(args.includes("PIXELATED_STAGE_TRACE=1"));
  assert.ok(args.includes("PIXELATED_N5_WORKLOAD_SEED=7"));
  assert.ok(args.includes("PIXELATED_N5_WORKLOAD_ID=workload-1"));
  assert.ok(args.includes("--read-only"));
  assert.ok(args.includes("ALL"));
  assert.equal(args[args.indexOf("--user")+1], "10001:10001");
});
