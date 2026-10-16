import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { readBoundedResponse, readBoundedFile, withRequestDeadline } from "../../../src/infrastructure/boundedRead.js";
import { parseCaptureCommand, captureTimeout, runCaptureProcess, captureGameplayArtworkWithCommand } from "../../../src/modules/catalog/ingestion/infrastructure/catalogArtworkCommand.js";
import { readArtworkImage } from "../../../src/modules/catalog/ingestion/infrastructure/catalogArtworkImage.js";
import { parseArtworkOptions } from "../../../scripts/artwork/options.js";
function chunk(type: string, data: Buffer) {
  const kind = Buffer.from(type);
  const sum = Buffer.concat([kind, data]);
  let crc = 0xffffffff;
  for (const byte of sum) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  const header = Buffer.alloc(4);
  header.writeUInt32BE(data.length);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([header, sum, tail]);
}
function image(width = 16, height = 2, rawLength = (width * 3 + 1) * height) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const raw = Buffer.alloc(rawLength, 255);
  for (let y = 0; y < height; y++)
    if (y * (width * 3 + 1) < raw.length)
      raw[y * (width * 3 + 1)] = 0;
  if (raw.length > 28)
    raw.fill(0, 25, 28);
  return Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), chunk("IHDR", header), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
async function workspace(t: TestContext) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pixelated-capture-test-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}
for (const value of ["NaN", "0", "-1", "Infinity", "600001"])
  test(`reject capture deadline ${value} before spawning`, () => {
    assert.throws(() => captureTimeout({ CATALOG_ARTWORK_CAPTURE_TIMEOUT_MS: value }), /timeout/);
  });
test("image file, dimensions, inflation and CRC bounds reject malformed captures", async (t) => {
  const dir = await workspace(t);
  const file = path.join(dir, "frame.png");
  await fs.writeFile(file, image());
  assert.equal((await readArtworkImage(file)).extension, ".png");
  for (const bytes of [image(8193, 1), image(16, 2, 10000), image().subarray(0, 30)]) {
    await fs.writeFile(file, bytes);
    await assert.rejects(readArtworkImage(file));
  }
  const bytes = image();
  bytes[29] = (bytes[29] ?? 0) ^ 1;
  await fs.writeFile(file, bytes);
  await assert.rejects(readArtworkImage(file), /checksum/);
  await assert.rejects(readBoundedFile(dir, 8), /regular/);
  await fs.writeFile(file, Buffer.alloc(9));
  await assert.rejects(readBoundedFile(file, 8), /bounded/);
});
test("bounded response cancels excess without allocating its claimed body", async () => {
  let cancelled = false;
  const response = new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(9)); }, cancel() { cancelled = true; } }));
  await assert.rejects(readBoundedResponse(response, 8), /byte limit/);
  assert.equal(cancelled, true);
  const controller = new AbortController();
  let observed: AbortSignal | null | undefined;
  const fetchBounded = withRequestDeadline(async (_input, options) => { observed = options?.signal; return new Response(); }, 1000);
  await fetchBounded("https://artifact.test", { signal: controller.signal });
  controller.abort();
  assert.equal(observed?.aborted, true);
  const declared = new Response("x", { headers: { "content-length": "100000000000" } });
  await assert.rejects(readBoundedResponse(declared, 8), /byte limit/);
});
for (const successful of [false, true])
  test(`capture workspace is removed after ${successful ? "success" : "failure"}`, async (t) => {
    const dir = await workspace(t);
    const script = path.join(dir, "capture.cjs");
    const marker = path.join(dir, "marker");
    await fs.writeFile(script, `const fs=require('node:fs');fs.writeFileSync(${JSON.stringify(marker)},process.env.PIXELATED_CAPTURE_ROM_PATH);${successful ? `fs.writeFileSync(process.env.PIXELATED_CAPTURE_OUTPUT_PATH,Buffer.from(${JSON.stringify(image().toString("hex"))},'hex'));` : "process.exitCode=1;"}`);
    const operation = captureGameplayArtworkWithCommand(`${JSON.stringify(process.execPath)} ${JSON.stringify(script)}`, { artifactBytes: Buffer.from("rom"), artifactFilename: "game.nes", buildId: "build-1", gameId: "game-1", platformId: "nes", runtimeId: "retroarch", title: "Smoke" });
    if (successful)
      assert.equal((await operation).extension, ".png");
    else
      await assert.rejects(operation, /failed/);
    const romPath = await fs.readFile(marker, "utf8");
    await assert.rejects(fs.stat(path.dirname(romPath)), { code: "ENOENT" });
  });
test("timeout escalates an owned TERM-resistant child and confirms exit", { timeout: 5000 }, async (t) => {
  const dir = await workspace(t);
  const script = path.join(dir, "hang.cjs");
  const marker = path.join(dir, "pid");
  await fs.writeFile(script, `require('node:fs').writeFileSync(${JSON.stringify(marker)},String(process.pid));process.on('SIGTERM',()=>{});setInterval(()=>{},1000);`);
  await assert.rejects(runCaptureProcess(`${JSON.stringify(process.execPath)} ${JSON.stringify(script)}`, process.env, { timeoutMs: 500, terminateGraceMs: 25 }), /timed out/);
  const pid = Number(await fs.readFile(marker, "utf8"));
  assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
});
test("artwork CLI rejects missing/unknown options and preserves quoted relative paths", async (t) => {
  for (const args of [["--limit"], ["--unknown"], ["--limit", "--apply"]])
    assert.throws(() => parseArtworkOptions(args, {}));
  const dir = await workspace(t);
  await fs.writeFile(path.join(dir, "capture with spaces"), "");
  const options = parseArtworkOptions(["--capture-command", '"./capture with spaces" "one argument"'], { INIT_CWD: dir });
  assert.deepEqual(parseCaptureCommand(options.captureCommand!), { file: path.join(dir, "capture with spaces"), args: ["one argument"] });
  assert.equal(options.dryRun, true);
});
