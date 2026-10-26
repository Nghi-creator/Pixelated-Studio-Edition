/** Opt-in real browser -> authenticated relay -> actual Python camera/native owner acceptance. */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { nativeBrowserHtml } from "./nativeBrowserPage.mjs";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const runtime = fileURLToPath(new URL("../../", import.meta.url));

export async function runNativeBrowserAcceptance(image, mode = "production-admission") {
  if (!/^sha256:[a-f0-9]{64}$/.test(image || "")) throw new Error("explicit cached image digest required");
  if (!["production-admission", "engineering-complete", "engineering-receiver-loss"].includes(mode)) throw new Error("invalid acceptance mode");
  const docker = process.platform === "darwin" ? "/Applications/Docker.app/Contents/Resources/bin/docker" : "docker";
  const name = `n10-browser-native-${process.pid}-${Date.now()}`;
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "n10-browser-native-"));
  const token = randomBytes(32).toString("hex");
  let browser, child, timer, processFailure;
  const pages = [];
  const events = []; const logs = [];
  let logBytes = 0, stdoutBytes = 0;
  const append = (data) => {
    logBytes += data.length;
    if (logBytes <= 32768) logs.push(String(data));
    if (logBytes > 1024 * 1024) { processFailure = new Error("acceptance output budget"); child?.kill(); }
  };
  const command = (args) => {
    const result = spawnSync(docker, args, { encoding: "utf8", timeout: 10000 });
    if (result.status !== 0) throw new Error(`container command failed: ${result.stderr?.slice(0, 1000)}`);
    return result.stdout.trim();
  };
  try {
    await fs.writeFile(path.join(directory, "index.html"), nativeBrowserHtml(token));
    for (const [name, relative] of [["collector.js", "telemetry/receiverObservation.ts"], ["engine-errors.js", "transport/webrtcEngineErrors.ts"]]) {
      const source = await fs.readFile(new URL(`../../../../apps/web/src/lib/webrtc/${relative}`, import.meta.url), "utf8");
      await fs.writeFile(path.join(directory, name), ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      }).outputText);
    }
    // Readable by the image's unprivileged UID on native Linux bind mounts too.
    // These assets contain only this disposable test's ephemeral pairing token.
    await fs.chmod(directory, 0o755);
    for (const asset of ["index.html", "collector.js", "engine-errors.js"]) await fs.chmod(path.join(directory, asset), 0o644);
    const args = ["run", "--rm", "--init", "--name", name, "--pull", "never", "--read-only", "--cap-drop", "ALL",
      "--security-opt", "no-new-privileges", "--cpus", "2", "--memory", "768m", "--pids-limit", "256",
      "--network", "bridge", "--publish", "127.0.0.1::8080", "--tmpfs", "/tmp:rw,nosuid,nodev,noexec,size=96m",
      "--tmpfs", "/home/pixelated:rw,nosuid,nodev,noexec,uid=10001,gid=10001,size=32m",
      "--env", "XDG_CACHE_HOME=/tmp/cache", "--env", "PYTHONPYCACHEPREFIX=/tmp/pycache",
      "--env", "N10_BROWSER_ACCEPTANCE=1", "--env", `N10_BROWSER_ACCEPTANCE_MODE=${mode}`, "--env", `PIXELATED_ENGINE_TOKEN=${token}`, "--workdir", "/app",
      "--mount", `type=bind,src=${directory},dst=/acceptance,readonly`,
    ];
    for (const [source, target] of [
      ["dist", "/app/engine/runtime/dist"], ["scripts/n10", "/app/engine/runtime/scripts/n10"],
      ...["live_probe_control", "scenario_harness", "scripts/n10", ...(await fs.readdir(runtime)).filter((name) => name.endsWith(".py"))]
        .map((name) => [name, "/opt/repo/engine/runtime/" + name]),
    ]) args.push("--mount", `type=bind,src=${path.join(runtime, source)},dst=${target},readonly`);
    args.push("--entrypoint", "timeout", image, "42s", "node", "/app/engine/runtime/scripts/n10/nativeBrowserRelay.cjs");
    child = spawn(docker, args, { stdio: ["ignore", "pipe", "pipe"] });
    const exited = new Promise((resolve) => {
      child.once("error", (error) => { processFailure = error; resolve(null); });
      child.once("close", resolve);
    });
    child.stderr.on("data", append);
    child.stdout.on("data", (data) => { stdoutBytes += data.length; append(data); if (stdoutBytes > 1024 * 1024) child.kill(); });
    const reading = (async () => {
      for await (const line of readline.createInterface({ input: child.stdout })) {
        if (line.length > 65536) throw new Error("acceptance output line budget");
        if (line.startsWith("N10_ACCEPTANCE ")) events.push(JSON.parse(line.slice(15)));
      }
    })().catch((error) => { processFailure = error; });
    async function deadline(predicate, seconds = 8) {
      const end = Date.now() + seconds * 1000;
      while (Date.now() < end) {
        if (processFailure) throw processFailure;
        if (events.some((event) => event.kind === "failed")) throw new Error(JSON.stringify(events.at(-1)));
        if (await predicate()) return;
        if (child.exitCode !== null) throw new Error("acceptance container exited early");
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw new Error("acceptance phase deadline");
    }
    await deadline(() => events.some((event) => event.kind === "camera_ready"), 10);
    const published = command(["port", name, "8080/tcp"]);
    assert.match(published, /^127\.0\.0\.1:\d+$/);
    const url = "http://" + published;
    browser = await chromium.launch({ headless: true, args: ["--disable-features=WebRtcHideLocalIpsWithMdns"] });
    const context = await browser.newContext();
    await context.route("**/*", (route) => new URL(route.request().url()).origin === url ? route.continue() : route.abort());
    const first = await context.newPage(); const second = await context.newPage();
    pages.push(first, second);
    const pageErrors = [];
    for (const page of [first, second]) page.on("pageerror", (error) => pageErrors.push(error.message));
    await Promise.all([first.goto(url + "/?peer=first"), second.goto(url + "/?peer=second")]);
    await Promise.race([
      (async () => {
        let stopped = false;
        await deadline(async () => {
          if (!stopped && events.some((event) => event.kind === "stop_first_observations")) {
            stopped = true;
            const before = await first.evaluate(() => globalThis.stopObservations());
            await first.waitForTimeout(250);
            assert.ok(await first.evaluate(() => globalThis.videoFrames()) > before, "browser media must still advance after observation loss");
          }
          return events.some((event) => event.kind === "complete");
        }, 32);
        if (mode === "engineering-receiver-loss") assert.ok(stopped, "receiver loss injection was required");
      })(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("outer acceptance deadline")), 36000); }),
    ]);
    await Promise.all([first, second].map((page) => page.waitForFunction(() => globalThis.unbound >= 1, undefined, { timeout: 2000 })));
    const snapshots = await Promise.all([first, second].map((page) => page.evaluate(() => globalThis.snapshot())));
    assert.deepEqual(pageErrors, []);
    assert.equal(snapshots[0].problem, null);
    assert.equal(snapshots[1].problem, null);
    assert.equal(snapshots[0].failures.length, 1);
    assert.equal(snapshots[0].failures[0].peerId, "first");
    assert.deepEqual(snapshots[1].failures, []);
    assert.ok(snapshots[0].counts.first.framesDecoded > 0 && snapshots[0].counts.replacement.presentedFrames > 0);
    assert.ok(snapshots[1].counts.second.framesDecoded > 0);
    assert.equal(new Set(snapshots[0].bindings).size, 2);
    assert.ok(snapshots.every((snapshot) => snapshot.unbound >= 1));
    const counters = snapshots.map((snapshot) => Object.values(snapshot.counts).map((item) => item.sequence));
    await first.waitForTimeout(450);
    const after = await Promise.all([first, second].map((page) => page.evaluate(() => globalThis.snapshot())));
    assert.deepEqual(after.map((snapshot) => Object.values(snapshot.counts).map((item) => item.sequence)), counters);
    await Promise.all([first, second].map((page) => page.evaluate(() => globalThis.cleanup())));
    await reading;
    if (processFailure) throw processFailure;
    assert.equal(await exited, 0);
    return { status: "passed", mode, live_authority: false, events, browser: browser.version(),
      viewers: snapshots.map((snapshot) => ({ failures: snapshot.failures.length, epochs: Object.keys(snapshot.counts), unbound: snapshot.unbound })) };
  } catch (error) {
    const diagnostics = await Promise.allSettled(pages.map((page) => page.evaluate(() => globalThis.snapshot?.())));
    throw new Error(`${error.message}\n${JSON.stringify(diagnostics)}\n${logs.join("").slice(-16000)}`, { cause: error });
  } finally {
    clearTimeout(timer);
    const cleanup = spawnSync(docker, ["rm", "-f", name], { encoding: "utf8", timeout: 10000 });
    child?.kill();
    const released = await Promise.allSettled([
      browser?.close(), fs.rm(directory, { recursive: true, force: true }),
    ]);
    assert.ok(released.every((item) => item.status === "fulfilled"), "acceptance browser/assets cleanup unconfirmed");
    assert.ok(cleanup.status === 0 || /No such container/.test(cleanup.stderr || ""), "acceptance container cleanup unconfirmed");
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (![4, 6].includes(process.argv.length) || process.argv[2] !== "--image" || (process.argv.length === 6 && process.argv[4] !== "--mode"))
      throw new Error("use --image sha256:<cached-image-digest> [--mode all|production-admission|engineering-complete|engineering-receiver-loss]");
    const selected = process.argv[5] || "all";
    const modes = selected === "all" ? ["production-admission", "engineering-complete", "engineering-receiver-loss"] : [selected];
    for (const mode of modes) console.log(JSON.stringify(await runNativeBrowserAcceptance(process.argv[3], mode), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
