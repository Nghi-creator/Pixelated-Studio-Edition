import assert from "node:assert/strict";
import test from "node:test";
import { parseOptions, processCpuSample, runTrial } from "./gameBrowserTrial.mjs";

const args = ["--mode", "changed", "--image", "sha256:" + "a".repeat(64),
  "--output", "/tmp/report", "--state-directory", "/tmp/private-state"];

test("explicit bounded browser experiment arguments", () => {
  assert.equal(parseOptions(args)["--mode"], "changed");
  for (const values of [[], args.slice(0, -1), [...args, "--mode", "sham"],
    [...args, "--fps", "1"], args.map((value) => value === "changed" ? "automatic" : value)])
    assert.throws(() => parseOptions(values));
  assert.throws(() => parseOptions(args.map((value) => value === "changed" ? 1 : value)));
});

test("browser process counters retain stable inventory identity without native IDs", () => {
  const info = [{ id: 2, type: "renderer", cpuTime: .2 }, { id: 1, type: "browser", cpuTime: .3 }];
  const sample = processCpuSample(info, 100);
  assert.equal(sample.cpu_seconds, .5);
  assert.equal(sample.process_count, 2);
  assert.equal(sample.inventory_hash, processCpuSample(info.toReversed(), 200).inventory_hash);
  assert.notEqual(sample.inventory_hash, processCpuSample([{ ...info[0], id: 3 }, info[1]], 100).inventory_hash);
  assert.equal("id" in sample, false);
  for (const invalid of [[], [info[0], info[0]], [{ id: 1, type: "browser", cpuTime: NaN }],
    [{ id: 0, type: "browser", cpuTime: 0 }], [{ id: 1, type: "browser", cpuTime: -1 }], [{ id: 1, type: "browser", cpuTime: Number.MAX_VALUE }]])
    assert.throws(() => processCpuSample(invalid, 100));
});


test("programmatic trial cannot bypass closed image and mode arguments", async () => {
  await assert.rejects(runTrial({ "--image": "--privileged" }));
});
