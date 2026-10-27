/** Opt-in real browser -> authenticated relay -> actual Python camera/native owner acceptance. */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { processCpuSample } from "./gameBrowserTrial.mjs";
import { nativeBrowserHtml } from "./nativeBrowserPage.mjs";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const runtime = fileURLToPath(new URL("../../", import.meta.url));

export async function runNativeBrowserAcceptance(image, mode = "production-admission") {
  if (!/^sha256:[a-f0-9]{64}$/.test(image || "")) throw new Error("explicit cached image digest required");
  if (!["production-admission", "engineering-complete", "engineering-receiver-loss", "observer-off", "observer-on", "observer-static-diagnostic", "observer-moving-off", "observer-moving-on"].includes(mode)) throw new Error("invalid acceptance mode");
  const movingMode = ["observer-moving-off", "observer-moving-on"].includes(mode);
  const observerOff = ["observer-off", "observer-moving-off"].includes(mode);
  const diagnosticMode = mode === "observer-static-diagnostic";
  const screenMode = mode.startsWith("observer-");
  const docker = process.platform === "darwin" ? "/Applications/Docker.app/Contents/Resources/bin/docker" : "docker";
  const name = `n10-browser-native-${process.pid}-${Date.now()}`;
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "n10-browser-native-"));
  const token = randomBytes(32).toString("hex");
  let browser, child, timer, processFailure, softwareHash;
  const pages = [];
  const events = []; let logTail = "";
  let logBytes = 0, stdoutBytes = 0;
  const append = (data) => {
    logBytes += data.length;
    logTail = (logTail + String(data)).slice(-32768);
    if (logBytes > 1024 * 1024) { processFailure = new Error("acceptance output budget"); child?.kill(); }
  };
  const command = (args) => {
    const result = spawnSync(docker, args, { encoding: "utf8", timeout: 10000 });
    if (result.status !== 0) throw new Error(`container command failed: ${result.stderr?.slice(0, 1000)}`);
    return result.stdout.trim();
  };
  try {
    const hash = createHash("sha256");
    for (const folder of [".", "live_probe_control", "scripts/n10"]) {
      for (const file of (await fs.readdir(path.join(runtime, folder))).sort()) {
        if (!/\.(py|mjs|cjs)$/.test(file)) continue;
        hash.update(JSON.stringify([folder + "/" + file, createHash("sha256").update(await fs.readFile(path.join(runtime, folder, file))).digest("hex")]));
      }
    }
    for (const relative of (await fs.readdir(path.join(runtime, "dist/src"), { recursive: true })).filter((name) => name.endsWith(".js")).sort()) {
      hash.update(JSON.stringify(["dist/src/" + relative, createHash("sha256").update(await fs.readFile(path.join(runtime, "dist/src", relative))).digest("hex")]));
    }
    for (const relative of ["telemetry/receiverObservation.ts", "transport/webrtcEngineErrors.ts"]) {
      hash.update(await fs.readFile(new URL(`../../../../apps/web/src/lib/webrtc/${relative}`, import.meta.url)));
    }
    softwareHash = hash.digest("hex");
    await fs.writeFile(path.join(directory, "index.html"), nativeBrowserHtml(token));
    for (const [name, relative] of [["collector.js", "telemetry/receiverObservation.ts"], ["engine-errors.js", "transport/webrtcEngineErrors.ts"]]) {
      const source = await fs.readFile(new URL(`../../../../apps/web/src/lib/webrtc/${relative}`, import.meta.url), "utf8");
      await fs.writeFile(path.join(directory, name), ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      }).outputText);
    }
    await fs.copyFile(new URL("./browserQualityScreen.mjs", import.meta.url), path.join(directory, "quality.js"));
    // Readable by the image's unprivileged UID on native Linux bind mounts too.
    // These assets contain only this disposable test's ephemeral pairing token.
    await fs.chmod(directory, 0o755);
    for (const asset of ["index.html", "collector.js", "engine-errors.js", "quality.js"]) await fs.chmod(path.join(directory, asset), 0o644);
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
    if (movingMode) {
      // An owned host-only marker, never a signaling/network control message.
      await Promise.all(pages.map((page) => page.waitForFunction(() => {
        const item = Object.values(globalThis.timelines || {})[0];
        return globalThis.snapshot().state === "connected" && item?.first_presented?.presented > 0;
      }, undefined, { timeout: 8000 })));
      const marker = path.join(directory, "presented.pending");
      await fs.writeFile(marker, JSON.stringify({ method: "n10-observer-moving-acquisition-v2", peers: ["first", "second"] }), { flag: "wx", mode: 0o644 });
      await fs.chmod(marker, 0o644);
      await fs.rename(marker, path.join(directory, "presented.json"));
    }
    let quality = null, browserResources = null;
    const diagnosticWindows = [];
    async function measurePages() {
      const session = await browser.newBrowserCDPSession();
      try {
        const before = processCpuSample((await session.send("SystemInfo.getProcessInfo")).processInfo, Number(process.hrtime.bigint()));
        quality = await Promise.all([first, second].map((page) => page.evaluate(() => globalThis.collectQuality())));
        const after = processCpuSample((await session.send("SystemInfo.getProcessInfo")).processInfo, Number(process.hrtime.bigint()));
        browserResources = { basis: "host_hrtime_browser_owned_process_cpu_separate_clock", before, after };
        return { quality, browser_resources: browserResources };
      } finally { await session.detach(); }
    }
    await Promise.race([
      (async () => {
        let stopped = false;
        let measured = false;
        await deadline(async () => {
          if (screenMode && !measured && events.some((event) => event.kind === "screen_started")) {
            measured = true;
            await measurePages();
          }
          if (diagnosticMode) {
            const pending = events.filter((event) => event.kind === "diagnostic_started")[diagnosticWindows.length];
            if (pending) diagnosticWindows.push({ phase: pending.phase, ...await measurePages() });
          }
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
    if (!observerOff) await Promise.all([first, second].map((page) => page.waitForFunction(() => globalThis.unbound >= 1, undefined, { timeout: 2000 })));
    const snapshots = await Promise.all([first, second].map((page) => page.evaluate(() => globalThis.snapshot())));
    assert.deepEqual(pageErrors, []);
    assert.equal(snapshots[0].problem, null);
    assert.equal(snapshots[1].problem, null);
    if (screenMode) {
      assert.ok(quality && browserResources, "read-only screen was measured");
      assert.ok(snapshots.every((snapshot) => snapshot.failures.length === 0));
      if (observerOff) assert.ok(snapshots.every((snapshot) => snapshot.bindings.length === 0 && Object.keys(snapshot.counts).length === 0 && snapshot.unbound === 0));
      else assert.ok(snapshots.every((snapshot) => snapshot.bindings.length === (diagnosticMode ? 2 : 1) && snapshot.unbound === 1));
    } else {
    assert.equal(snapshots[0].failures.length, 1);
    assert.equal(snapshots[0].failures[0].peerId, "first");
    assert.deepEqual(snapshots[1].failures, []);
    assert.ok(snapshots[0].counts.first.framesDecoded > 0 && snapshots[0].counts.replacement.presentedFrames > 0);
    assert.ok(snapshots[1].counts.second.framesDecoded > 0);
    assert.equal(new Set(snapshots[0].bindings).size, 2);
    assert.ok(snapshots.every((snapshot) => snapshot.unbound >= 1));
    }
    if (diagnosticMode) assert.deepEqual(diagnosticWindows.map((window) => window.phase), ["on-1", "off", "on-2"]);
    const counters = snapshots.map((snapshot) => Object.values(snapshot.counts).map((item) => item.sequence));
    await first.waitForTimeout(450);
    const after = await Promise.all([first, second].map((page) => page.evaluate(() => globalThis.snapshot())));
    assert.deepEqual(after.map((snapshot) => Object.values(snapshot.counts).map((item) => item.sequence)), counters);
    await Promise.all([first, second].map((page) => page.evaluate(() => globalThis.cleanup())));
    await reading;
    if (processFailure) throw processFailure;
    const exitCode = await exited;
    assert.equal(exitCode, 0, `acceptance container exited with code ${exitCode} after media completion; process cleanup is required`);
    return { status: "passed", mode, live_authority: false, context: {image, software_hash: softwareHash, host_platform: process.platform, host_arch: process.arch}, events, ...(screenMode ? { quality, browser_resources: browserResources } : {}),
      ...(movingMode ? {role: "moving_acquisition_not_qualification", method: "n10-observer-moving-acquisition-v2"} : {}),
      ...(diagnosticMode ? {role: "exploratory_static_scene_not_qualification", diagnostic_windows: diagnosticWindows} : {}), startup: snapshots.map((snapshot) => ({ basis: snapshot.timeline_basis, timelines: snapshot.timelines })), browser: browser.version(),
      viewers: snapshots.map((snapshot) => ({ failures: snapshot.failures.length, epochs: Object.keys(snapshot.counts), unbound: snapshot.unbound })) };
  } catch (error) {
    const diagnostics = await Promise.allSettled(pages.map((page) => page.evaluate(() => globalThis.snapshot?.())));
    const failure = new Error(`${error.message}\n${JSON.stringify(diagnostics)}\n${logTail}`, { cause: error });
    failure.acquisition = { status: "failed", mode, live_authority: false, events, diagnostics,
      context: { image, software_hash: softwareHash || null, host_platform: process.platform, host_arch: process.arch } };
    throw failure;
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
      throw new Error("use --image sha256:<cached-image-digest> [--mode all|production-admission|engineering-complete|engineering-receiver-loss|observer-static-diagnostic]");
    const selected = process.argv[5] || "all";
    const modes = selected === "all" ? ["production-admission", "engineering-complete", "engineering-receiver-loss"] : [selected];
    for (const mode of modes) console.log(JSON.stringify(await runNativeBrowserAcceptance(process.argv[3], mode), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
